"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Megaphone,
  Send,
  PauseCircle,
  History,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/hooks/useQueries";
import {
  ANNOUNCEMENT_LEVEL_CONFIG,
  type AnnouncementLevel,
  type SystemAnnouncement,
} from "@/lib/announcement";

function formatDateTime(isoStr: string): string {
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return isoStr;
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function AdminAnnouncementPanel() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const [currentAnnouncement, setCurrentAnnouncement] = useState<SystemAnnouncement | null>(null);
  const [history, setHistory] = useState<SystemAnnouncement[]>([]);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState<AnnouncementLevel>("INFO");
  const [showHistory, setShowHistory] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const loadAnnouncement = async () => {
      try {
        const res = await fetch("/api/announcement?scope=admin", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "無法載入公告設定");
        if (!active) return;
        const ann: SystemAnnouncement | null = data.announcement ?? null;
        setCurrentAnnouncement(ann);
        setHistory(Array.isArray(data.history) ? data.history : []);
        if (ann) {
          setTitle(ann.title);
          setMessage(ann.message);
          setLevel(ann.level);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "讀取公告失敗");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAnnouncement();
    return () => {
      active = false;
    };
  }, []);

  const handlePush = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!title.trim()) {
      setError("請填寫公告標題");
      return;
    }
    if (!message.trim()) {
      setError("請填寫公告內容");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push",
          title: title.trim(),
          message: message.trim(),
          level,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "推送公告失敗");

      setCurrentAnnouncement(data.announcement);
      if (Array.isArray(data.history)) {
        setHistory(data.history);
      }
      setNotice(data.message || "公告已設定推送！");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.announcement });
    } catch (err) {
      setError(err instanceof Error ? err.message : "推送公告失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setError("");
    setNotice("");
    setDeactivating(true);
    try {
      const res = await fetch("/api/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "暫停推送失敗");

      setCurrentAnnouncement(data.announcement ?? null);
      setNotice(data.message || "已暫停全體登入公告推送");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.announcement });
    } catch (err) {
      setError(err instanceof Error ? err.message : "暫停推送失敗");
    } finally {
      setDeactivating(false);
    }
  };

  const handleLoadFromHistory = (item: SystemAnnouncement) => {
    setTitle(item.title);
    setMessage(item.message);
    setLevel(item.level);
    setError("");
    setNotice("已將歷史公告帶入編輯區，確認內容後點擊【儲存並推送】即可重新推播。");
  };

  const activeCfg = currentAnnouncement
    ? ANNOUNCEMENT_LEVEL_CONFIG[currentAnnouncement.level] || ANNOUNCEMENT_LEVEL_CONFIG.INFO
    : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">全體系統公告欄（登入推送通知）</h2>
            <p className="text-xs text-slate-500">
              設定並推送公告後，每位使用者登入系統時皆會自動彈出公告視窗提醒。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentAnnouncement?.isActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              推送啟用中
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              目前已暫停 / 尚未推送
            </span>
          )}
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <History className="h-3.5 w-3.5" />
              {showHistory ? "隱藏紀錄" : `推送紀錄 (${history.length})`}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          載入公告欄設定中...
        </div>
      ) : (
        <div className="space-y-5">
          {/* 目前線上公告狀態預覽 */}
          {currentAnnouncement && (
            <div
              className={`rounded-xl border p-4 ${
                currentAnnouncement.isActive && activeCfg
                  ? activeCfg.bannerClass
                  : "border-slate-200 bg-slate-50/70 opacity-80"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                        activeCfg?.badgeClass || "border-slate-200 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {activeCfg?.label || "一般通知"}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {currentAnnouncement.title}
                    </span>
                    {!currentAnnouncement.isActive && (
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        已暫停推送
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {currentAnnouncement.message}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    最近推送：{formatDateTime(currentAnnouncement.pushedAt)} · 發布者：{currentAnnouncement.pushedBy}
                  </p>
                </div>

                {currentAnnouncement.isActive && (
                  <button
                    type="button"
                    onClick={() => void handleDeactivate()}
                    disabled={deactivating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-100 disabled:opacity-50"
                  >
                    <PauseCircle className="h-4 w-4 text-slate-500" />
                    {deactivating ? "處理中..." : "暫停推送"}
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* 編輯與發送新公告表單 */}
          <form onSubmit={handlePush} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="announcement-level" className="mb-1 block text-xs font-semibold text-slate-700">
                  公告等級
                </label>
                <select
                  id="announcement-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as AnnouncementLevel)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="INFO">一般通知</option>
                  <option value="WARNING">重要提醒</option>
                  <option value="URGENT">緊急公告</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="announcement-title" className="mb-1 block text-xs font-semibold text-slate-700">
                  公告標題 *
                </label>
                <input
                  id="announcement-title"
                  type="text"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：本週五系統維護通知 / 最新報價流程規範"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="announcement-message" className="mb-1 block text-xs font-semibold text-slate-700">
                公告內容 *
              </label>
              <textarea
                id="announcement-message"
                rows={3}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="輸入要推送給全體使用者的訊息內容（支援換行）..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-slate-500">
                點擊推送後將產生新推播通知，每位使用者登入時皆會自動顯示此訊息視窗。
              </span>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {saving ? "推送中..." : "儲存並推送給全體使用者"}
              </button>
            </div>
          </form>

          {/* 近期推送紀錄 */}
          {showHistory && history.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-xs font-bold text-slate-700">近期推送紀錄（最近 {history.length} 筆）</h3>
              <div className="divide-y divide-slate-100">
                {history.slice(0, 8).map((item) => {
                  const cfg = ANNOUNCEMENT_LEVEL_CONFIG[item.level] || ANNOUNCEMENT_LEVEL_CONFIG.INFO;
                  return (
                    <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-xs">
                      <div className="space-y-0.5 max-w-2xl">
                        <div className="flex items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${cfg.badgeClass}`}>
                            {cfg.label}
                          </span>
                          <span className="font-bold text-slate-800">{item.title}</span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {formatDateTime(item.pushedAt)}
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2 whitespace-pre-wrap">{item.message}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoadFromHistory(item)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <RotateCcw className="h-3 w-3" />
                        帶入編輯
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
