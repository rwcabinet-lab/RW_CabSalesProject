"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

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
 * 案件清單圖釘 (置頂) 狀態管理 Hook
 * - 以 userId 為命名空間隔離各使用者的個人化置頂案件
 * - 本地持久化 (localStorage) 確保換頁、重新整理與跨分頁同步
 * - 0 DB Migration 負擔，完全不影響排程引擎與核心業務邏輯
 */
export function usePinnedProjects(userId?: string) {
  const storageKey = userId ? `cab_sales_pinned_projects_${userId}` : "cab_sales_pinned_projects_default";
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  // 初始載入與 storageKey 變更時讀取
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

  // 跨分頁同步監聽
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

  const togglePin = useCallback(
    (projectId: string): boolean => {
      let isNowPinned = false;
      setPinnedIds((prev) => {
        const exists = prev.includes(projectId);
        isNowPinned = !exists;
        const next = exists ? prev.filter((id) => id !== projectId) : [projectId, ...prev];
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      return isNowPinned;
    },
    [storageKey]
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
  };
}
