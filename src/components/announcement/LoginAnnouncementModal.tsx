"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Megaphone, X, CheckCircle2, Clock, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  QUERY_KEYS,
  useAnnouncementQuery,
  type AnnouncementResponseDTO,
} from "@/hooks/useQueries";
import {
  ANNOUNCEMENT_LEVEL_CONFIG,
  shouldShowAnnouncementModal,
} from "@/lib/announcement";

const LOCAL_ACK_KEY_PREFIX = "cab_announcement_ack_";

function getLocalAckStorageKey(userId: string): string {
  return `${LOCAL_ACK_KEY_PREFIX}${userId}`;
}

interface LoginAnnouncementModalProps {
  isAuthenticated: boolean;
  userId?: string | null;
}

function formatPushedTime(isoStr: string): string {
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

export function LoginAnnouncementModal({
  isAuthenticated,
  userId,
}: LoginAnnouncementModalProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [localAckedId, setLocalAckedId] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const { data } = useAnnouncementQuery(isAuthenticated);
  const announcement = data?.announcement ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setLocalAckedId(null);
      setDismissedId(null);
      return;
    }
    try {
      setLocalAckedId(localStorage.getItem(getLocalAckStorageKey(userId)));
    } catch {
      setLocalAckedId(null);
    }
  }, [isAuthenticated, userId]);

  const effectiveAcknowledgedId =
    announcement && localAckedId === announcement.id
      ? announcement.id
      : data?.acknowledgedId;

  const isOpen = Boolean(
    mounted &&
      isAuthenticated &&
      shouldShowAnnouncementModal({
        announcement,
        acknowledgedId: effectiveAcknowledgedId,
        dismissedInRender: Boolean(announcement && dismissedId === announcement.id),
      })
  );

  const handleAcknowledge = useCallback(async () => {
    if (!announcement) return;
    setDismissedId(announcement.id);
    setLocalAckedId(announcement.id);

    if (userId) {
      try {
        localStorage.setItem(getLocalAckStorageKey(userId), announcement.id);
      } catch {
        // ignore storage errors
      }
    }

    queryClient.setQueryData<AnnouncementResponseDTO>(
      QUERY_KEYS.announcement,
      (old) => (old ? { ...old, acknowledgedId: announcement.id } : old)
    );

    try {
      await fetch("/api/announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId: announcement.id }),
        keepalive: true,
      });
    } catch {
      // fallback: cache + localStorage already dismissed locally
    }
  }, [announcement, queryClient, userId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void handleAcknowledge();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleAcknowledge]);

  if (!isOpen || !announcement) return null;

  const levelCfg = ANNOUNCEMENT_LEVEL_CONFIG[announcement.level] || ANNOUNCEMENT_LEVEL_CONFIG.INFO;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-announcement-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className={`bg-gradient-to-r ${levelCfg.headerClass} px-6 py-4 text-white flex items-start justify-between gap-3`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-xs">
              <Megaphone className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold tracking-wide">
                系統公告 · {levelCfg.label}
              </span>
              <h2 id="system-announcement-title" className="mt-1 text-lg font-extrabold leading-snug">
                {announcement.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleAcknowledge()}
            aria-label="關閉公告"
            className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className={`rounded-xl border p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto ${levelCfg.bannerClass}`}>
            {announcement.message}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-slate-400" />
              發布者：{announcement.pushedBy}
            </span>
            <span className="inline-flex items-center gap-1 font-mono">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              推送時間：{formatPushedTime(announcement.pushedAt)}
            </span>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-3.5">
          <button
            type="button"
            onClick={() => void handleAcknowledge()}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition ${levelCfg.buttonClass}`}
          >
            <CheckCircle2 className="h-4 w-4" />
            我知道了，進入系統
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
