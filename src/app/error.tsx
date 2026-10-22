"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled client error captured:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-red-100">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">系統發生暫時性錯誤</h2>
      <p className="text-sm text-slate-500 max-w-md mb-6">
        {error.message || "應用程式在處理此頁面時遭遇非預期狀況，請嘗試重新整理或返回首頁。"}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 transition shadow-sm"
        >
          <RotateCcw className="w-4 h-4" />
          重新嘗試
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl hover:bg-slate-200 transition"
        >
          <Home className="w-4 h-4" />
          返回首頁
        </Link>
      </div>
    </div>
  );
}
