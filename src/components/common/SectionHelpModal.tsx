"use client";

import React, { useEffect, useCallback } from "react";
import { useSectionHelpStore } from "@/stores/useSectionHelpStore";
import { SECTION_DOCS } from "@/config/section-docs";
import {
  BookOpen,
  X,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function SectionHelpModal() {
  const activeSectionId = useSectionHelpStore((s) => s.activeSectionId);
  const closeHelp = useSectionHelpStore((s) => s.closeHelp);

  const doc = activeSectionId ? SECTION_DOCS[activeSectionId] : null;

  // 監聽鍵盤 ESC 鍵自動關閉
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeHelp();
      }
    },
    [closeHelp]
  );

  useEffect(() => {
    if (activeSectionId) {
      window.addEventListener("keydown", handleKeyDown);
      // 禁止背景捲動
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeSectionId, handleKeyDown]);

  if (!doc) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={closeHelp}
      role="dialog"
      aria-modal="true"
      aria-labelledby="section-help-title"
    >
      <div
        className="relative flex flex-col max-h-[90vh] w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 表頭 Header */}
        <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-blue-50/80 via-white to-slate-50/80 px-6 py-4.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                <BookOpen className="h-3.5 w-3.5" />
                {doc.category}
              </span>
              <span className="text-xs font-semibold text-slate-400">專用說明文件</span>
            </div>
            <h2 id="section-help-title" className="text-xl font-black text-slate-900 flex items-center gap-2">
              {doc.title}
            </h2>
            <p className="text-xs text-slate-500">{doc.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={closeHelp}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            aria-label="關閉說明"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 內容區塊 Body (可捲動) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-700">
          {/* 功能概述 Callout */}
          <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <h3 className="font-bold text-blue-950 flex items-center gap-1.5 mb-1.5 text-sm">
              <Sparkles className="h-4 w-4 text-blue-600" />
              功能定位與目的
            </h3>
            <p className="text-xs text-blue-900/90 leading-relaxed">{doc.overview}</p>
          </section>

          {/* 核心指標與規範 */}
          {doc.keyPoints && doc.keyPoints.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                核心欄位與狀態定義
              </h3>
              <div className="grid gap-2.5">
                {doc.keyPoints.map((point, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-800">
                        {point.label}
                      </span>
                      {point.badge && (
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                          {point.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{point.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 操作流程 */}
          {doc.steps && doc.steps.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                <ArrowRight className="h-4 w-4 text-blue-600" />
                建議操作流程
              </h3>
              <ol className="space-y-2">
                {doc.steps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[11px] font-bold text-blue-700">
                      {idx + 1}
                    </span>
                    <span className="pt-0.5 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* 規範與注意事項 */}
          {doc.rules && doc.rules.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
              <h3 className="font-bold text-amber-950 flex items-center gap-1.5 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                重要規則與防呆提醒
              </h3>
              <ul className="space-y-1.5 list-disc pl-4 text-xs text-amber-900/90 leading-relaxed">
                {doc.rules.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            </section>
          )}

          {/* 常見問題 FAQ */}
          {doc.faqs && doc.faqs.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                <HelpCircle className="h-4 w-4 text-indigo-600" />
                常見問題解答
              </h3>
              <div className="space-y-2">
                {doc.faqs.map((faq, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                    <p className="font-bold text-slate-800 mb-1 flex items-center gap-1">
                      <span className="text-indigo-600 font-black">Q：</span>
                      {faq.q}
                    </p>
                    <p className="text-slate-600 pl-4 border-l-2 border-indigo-200 py-0.5 leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 底部 Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-3 text-xs text-slate-500">
          <span>如需進一步協助，請洽營業主管或系統管理員</span>
          <button
            type="button"
            onClick={closeHelp}
            className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 transition shadow-xs"
          >
            我瞭解了
          </button>
        </div>
      </div>
    </div>
  );
}
