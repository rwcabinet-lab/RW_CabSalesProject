"use client";

import { useToastStore, type ToastType } from "@/stores/useToastStore";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
  info: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
};

const TOAST_STYLES: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50/95 text-emerald-950",
  error: "border-red-200 bg-red-50/95 text-red-950",
  warning: "border-amber-200 bg-amber-50/95 text-amber-950",
  info: "border-blue-200 bg-blue-50/95 text-blue-950",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="系統通知"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border shadow-lg backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${TOAST_STYLES[t.type]}`}
        >
          {TOAST_ICONS[t.type]}
          <div className="flex-1 text-xs font-semibold leading-relaxed whitespace-pre-wrap">
            {t.message}
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="text-slate-400 hover:text-slate-600 transition shrink-0 p-0.5 rounded-md hover:bg-black/5"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
