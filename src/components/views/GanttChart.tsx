"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, ShieldAlert, CheckCircle2, ChevronRight, Calendar, ArrowRight } from "lucide-react";
import type { ProjectWithMilestonesDTO } from "@/types/dto";

interface GanttProps {
  projects: ProjectWithMilestonesDTO[];
}

export function GanttChart({ projects }: GanttProps) {
  // 時間軸參考基準區間：2026-09-01 至 2026-10-31 (共 61 天)
  const baseStartDate = new Date("2026-09-01").getTime();
  const totalDays = 60; // 9/1 到 10/31 約 60 天

  // 計算特定日期在時間軸上的百分比位置
  const getOffsetPercent = (dateStr?: string | null) => {
    if (!dateStr) return 0;
    const target = new Date(dateStr).getTime();
    const diffDays = (target - baseStartDate) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.min(100, (diffDays / totalDays) * 100));
  };

  const getWidthPercent = (startStr?: string | null, endStr?: string | null) => {
    if (!startStr || !endStr) return 4;
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    const durationDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
    return Math.max(3, Math.min(100, (durationDays / totalDays) * 100));
  };

  return (
    <div className="space-y-6">
      {/* 圖例說明 */}
      <div className="flex flex-wrap items-center justify-between text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold text-slate-700">甘特圖圖例：</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded bg-blue-500 inline-block" /> 預計排程 (Planned)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded bg-emerald-500 inline-block" /> 實際完工 (Completed)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded bg-amber-400 inline-block" /> 進行中 (In Progress)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded bg-red-500 inline-block animate-pulse" /> 逾期卡關 (Overdue)
          </span>
        </div>

        <div className="text-slate-400 font-mono text-[11px]">
          時間軸範圍: 2026/09/01 ~ 2026/10/31
        </div>
      </div>

      {/* 甘特圖本體 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="min-w-[900px] p-6 space-y-6">
          {/* 時間軸標尺刻度 */}
          <div className="grid grid-cols-6 border-b border-slate-200 pb-2 text-[11px] font-bold text-slate-400 font-mono">
            <div>09/01 - 09/10</div>
            <div>09/11 - 09/20</div>
            <div className="text-blue-600 font-extrabold bg-blue-50/50 px-1 rounded">
              09/21 (今日基準線)
            </div>
            <div>10/01 - 10/10</div>
            <div>10/11 - 10/20</div>
            <div>10/21 - 10/31</div>
          </div>

          {/* 各案場里程碑時間條清單 */}
          <div className="space-y-8 divide-y divide-slate-100">
            {projects.map((project) => (
              <div key={project.id} className="pt-6 first:pt-0 space-y-3">
                {/* 案場抬頭 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900">
                      {project.projectName}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      階段: {project.currentStage}
                    </span>
                    {project.isDelayed && (
                      <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        🔴 時程逾期
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/projects/${project.id}/milestones`}
                    className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    進入時程推進 <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* 五大里程碑甘特長條 */}
                <div className="space-y-2 pl-2">
                  {project.milestones.map((m) => {
                    const plannedLeft = getOffsetPercent(m.plannedStart);
                    const plannedWidth = getWidthPercent(m.plannedStart, m.plannedEnd);

                    const isCompleted = m.status === "COMPLETED";
                    const isOverdue = m.status === "OVERDUE";
                    const isInProgress = m.status === "IN_PROGRESS";

                    return (
                      <div key={m.id} className="flex items-center text-xs py-1">
                        {/* 里程碑名稱與負責人 */}
                        <div className="w-36 shrink-0 flex items-center justify-between pr-3">
                          <span className="font-semibold text-slate-800 truncate">{m.stageName}</span>
                          <span className="text-[10px] text-slate-400">{m.assignedToName}</span>
                        </div>

                        {/* 條狀圖軌道 */}
                        <div className="flex-1 relative h-6 bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
                          {/* 預計排程長條 (Planned Bar) */}
                          <div
                            style={{
                              left: `${plannedLeft}%`,
                              width: `${plannedWidth}%`,
                            }}
                            title={`預計: ${m.plannedStart || ""} ~ ${m.plannedEnd || ""}`}
                            className="absolute top-1 h-2 rounded bg-blue-300 opacity-70"
                          />

                          {/* 實際排程/進度長條 (Actual / Status Bar) */}
                          <div
                            style={{
                              left: `${plannedLeft}%`,
                              width: isCompleted ? `${plannedWidth}%` : `${Math.max(5, plannedWidth * 0.6)}%`,
                            }}
                            title={`狀態: ${m.status}`}
                            className={`absolute bottom-1 h-2 rounded ${
                              isOverdue
                                ? "bg-red-500 shadow-xs"
                                : isCompleted
                                ? "bg-emerald-500"
                                : isInProgress
                                ? "bg-amber-400"
                                : "bg-slate-300"
                            }`}
                          />
                        </div>

                        {/* 狀態標籤 */}
                        <div className="w-24 shrink-0 text-right pl-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isOverdue
                                ? "bg-red-100 text-red-700"
                                : isCompleted
                                ? "bg-emerald-100 text-emerald-700"
                                : isInProgress
                                ? "bg-amber-100 text-amber-800"
                                : "text-slate-400"
                            }`}
                          >
                            {isOverdue ? "逾期" : isCompleted ? "已完成" : isInProgress ? "進行中" : "待啟動"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
