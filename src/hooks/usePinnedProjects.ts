"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/**
 * 將專案清單依據置頂 (Pin) 狀態排序：
 * 1. 置頂項目永遠排在非置頂項目之前
 * 2. 同為置頂或同為非置頂項目，依據傳入之 baseComparator 比較器排序
 */
export function sortProjectsWithPins<T extends { id: string }>(
  projects: T[],
  pinnedSet: Set<string>,
  baseComparator?: (a: T, b: T) => number
): T[] {
  return [...projects].sort((a, b) => {
    const aPinned = pinnedSet.has(a.id);
    const bPinned = pinnedSet.has(b.id);
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }
    if (baseComparator) {
      return baseComparator(a, b);
    }
    return 0;
  });
}

/**
 * 案件清單圖釘 (置頂) 狀態管理 Hook（跨裝置雲端同步架構）
 * - 雙層架構：本地 localStorage（0ms 秒開零延遲）+ 雲端 API（跨裝置同步）
 * - 以 userId 為命名空間隔離各使用者的個人化置頂案件
 * - 支援多裝置、多分頁（StorageEvent）與視窗聚焦（focus）即時連動
 * - 0 DB Migration 負擔，完全不影響排程引擎與核心業務邏輯
 */
export function usePinnedProjects(userId?: string) {
  const storageKey = userId ? `cab_sales_pinned_projects_${userId}` : "cab_sales_pinned_projects_default";
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const isSyncingRef = useRef(false);

  // 1. 本地儲存初始化 (0ms 立即呈現)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setPinnedIds(parsed.filter((item): item is string => typeof item === "string"));
          return;
        }
      }
      setPinnedIds([]);
    } catch {
      setPinnedIds([]);
    }
  }, [storageKey]);

  // 2. 跨裝置雲端同步 (Fetch from Cloud)
  const syncFromCloud = useCallback(async () => {
    if (!userId || typeof window === "undefined" || isSyncingRef.current) return;
    try {
      isSyncingRef.current = true;
      const res = await fetch("/api/projects/pinned", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && Array.isArray(data.pinnedProjectIds)) {
        const cloudIds = data.pinnedProjectIds.filter((id: unknown): id is string => typeof id === "string");
        setPinnedIds(cloudIds);
        try {
          localStorage.setItem(storageKey, JSON.stringify(cloudIds));
        } catch {
          // ignore
        }
      }
    } catch {
      // 離線或網路短暫中斷時保留本地快取
    } finally {
      isSyncingRef.current = false;
    }
  }, [userId, storageKey]);

  // 3. 掛載與視窗聚焦時自動與雲端同步（跨裝置體驗：例如手機置頂後，切回電腦畫面自動更新）
  useEffect(() => {
    if (!userId) return;
    void syncFromCloud();

    const handleFocus = () => {
      void syncFromCloud();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [userId, syncFromCloud]);

  // 4. 同裝置跨分頁同步監聽 (localStorage event)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setPinnedIds(parsed.filter((item): item is string => typeof item === "string"));
          }
        } catch {
          // ignore
        }
      } else if (e.key === storageKey && !e.newValue) {
        setPinnedIds([]);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [storageKey]);

  // 5. 置頂開關切換（樂觀更新本地 + 非同步推送雲端）
  const togglePin = useCallback(
    (projectId: string): boolean => {
      let isNowPinned = false;
      setPinnedIds((prev) => {
        const exists = prev.includes(projectId);
        isNowPinned = !exists;
        const next = exists ? prev.filter((id) => id !== projectId) : [projectId, ...prev];

        // 樂觀更新本機
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }

        // 非同步推送至雲端，實現跨裝置同步
        if (userId) {
          void fetch("/api/projects/pinned", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pinnedProjectIds: next }),
          }).catch((err) => {
            console.error("Failed to sync pinned projects to cloud:", err);
          });
        }

        return next;
      });
      return isNowPinned;
    },
    [storageKey, userId]
  );

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const isPinned = useCallback(
    (projectId: string) => pinnedSet.has(projectId),
    [pinnedSet]
  );

  return {
    pinnedIds,
    pinnedSet,
    pinnedCount: pinnedIds.length,
    isPinned,
    togglePin,
    syncFromCloud,
  };
}
