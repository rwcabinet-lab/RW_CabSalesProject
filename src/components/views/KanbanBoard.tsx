"use client";

import Link from "next/link";
import {
  User,
  ShieldAlert,
  Clock,
  ExternalLink,
} from "lucide-react";
import type { ProjectWithMilestonesDTO } from "@/types/dto";
import { formatTenThousands } from "@/lib/currency";
import { matchesStage } from "@/lib/constants";

interface KanbanProps {
  projects: ProjectWithMilestonesDTO[];
}

const STAGES = [
  { id: "DEVELOP", label: "案件開發", color: "bg-blue-100 text-blue-800" },
  { id: "REQUIREMENT", label: "現況及需求確認", color: "bg-sky-100 text-sky-800" },
  { id: "PROPOSAL", label: "提案/報價/簽約", color: "bg-indigo-100 text-indigo-800" },
  { id: "PRE_PROD", label: "生產前確認/拆單", color: "bg-purple-100 text-purple-800" },
  { id: "PROD_SHIP", label: "生產及派送", color: "bg-amber-100 text-amber-800" },
  { id: "INSTALL", label: "安裝及驗收", color: "bg-orange-100 text-orange-800" },
  { id: "CLOSURE", label: "結案/售後", color: "bg-teal-100 text-teal-800" },
  { id: "CLOSED", label: "已結案", color: "bg-emerald-100 text-emerald-800" },
  { id: "BILLED", label: "已立帳", color: "bg-cyan-100 text-cyan-800" },
  { id: "WRAP_UP", label: "收尾", color: "bg-rose-100 text-rose-800" },
  { id: "LOST", label: "已流標", color: "bg-slate-200 text-slate-800" },
];


export function KanbanBoard({ projects }: KanbanProps) {
  return (
    <div className="space-y-4">
      {/* 頂部說明提示 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 pb-1 gap-1">
        <span>💡 專案階段由各案場「里程碑實際進度」自動推進；點擊卡片時鐘圖示可進入里程碑細部維護。</span>
        <span className="font-semibold shrink-0">共 {projects.length} 個案場｜依當前階段分類</span>
      </div>

      {/* 階段看板主體欄位 */}
      <div className="flex gap-4 overflow-x-auto pb-6 min-h-[600px] pt-1">
        {STAGES.map((col) => {
          const columnProjects = projects.filter((p) => matchesStage(p.currentStage, col.id));

          return (
            <div
              key={col.id}
              className="w-72 shrink-0 flex flex-col bg-slate-100/70 rounded-2xl border border-slate-200/80 p-3"
            >
              {/* 欄位 Header */}
              <div className="flex items-center justify-between px-2 py-1.5 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${col.color}`}>
                    {col.label}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs">
                  {columnProjects.length}
                </span>
              </div>

              {/* 卡片清單區域 */}
              <div className="flex-1 space-y-3 rounded-xl p-1 overflow-y-auto">
                {columnProjects.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl bg-white/40">
                    目前無案件
                  </div>
                ) : (
                  columnProjects.map((project) => (
                    <div
                      key={project.id}
                      className={`bg-white rounded-xl p-4 border shadow-xs transition hover:shadow-md hover:border-slate-300 ${
                        project.isDelayed
                          ? "border-red-300 ring-1 ring-red-200"
                          : "border-slate-200"
                      }`}
                    >
                      {/* 卡片頂部 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {project.customerType}
                          </span>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            {project.defaultDiscount === 1.0
                              ? "牌價"
                              : `${(project.defaultDiscount * 10).toFixed(1)}折`}
                          </span>
                        </div>

                        {project.currentStage === "LOST" ? (
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full">
                            ⚪ 已流標
                          </span>
                        ) : project.isDelayed ? (
                          <span className="text-[10px] font-black text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full animate-pulse flex items-center gap-0.5">
                            <ShieldAlert className="w-3 h-3" /> 逾期卡關
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                            🟢 正常
                          </span>
                        )}
                      </div>

                      {/* 案場名稱 */}
                      <h4 className="font-bold text-slate-900 text-xs mt-2.5 line-clamp-2">
                        {project.projectName}
                      </h4>

                      <p className="text-[11px] text-slate-500 mt-1 truncate">
                        業主: {project.customerName}
                      </p>

                      {(project.quoteAmount || project.estimatedBudget) && (
                        <div className="mt-2 text-right text-xs font-mono font-bold tabular-nums text-slate-800">
                          報價: {formatTenThousands(project.quoteAmount ?? project.estimatedBudget ?? 0)}
                        </div>
                      )}

                      {/* 卡片底部業務資訊與里程碑連結 */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span className="font-medium text-slate-700 truncate max-w-[120px]">
                            {project.salesRepName}
                          </span>
                        </div>

                        <Link
                          href={`/projects/${project.id}/milestones`}
                          title="查看並維護里程碑"
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>里程碑</span>
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
