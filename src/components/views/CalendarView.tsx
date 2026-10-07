"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, MapPin, User } from "lucide-react";
import type { CalendarEventDTO, ProjectWithMilestonesDTO, TaskDTO } from "@/types/dto";

interface CalendarProps {
  projects: ProjectWithMilestonesDTO[];
  tasks: TaskDTO[];
}

export function CalendarView({ projects, tasks }: CalendarProps) {
  const [selectedMonth, setSelectedMonth] = useState("2026 年 09 月");
  const [activeEvent, setActiveEvent] = useState<CalendarEventDTO | null>(null);

  // 整理 2026 年 9 月的日期陣列 (9/1 是週二，前面補 2 天空檔，共 30 天)
  const daysInMonth = Array.from({ length: 30 }, (_, i) => i + 1);
  const leadingBlanks = Array.from({ length: 2 }, (_, i) => i); // 週日、週一為 8/30, 8/31

  // 將任務與里程碑依據日期歸類
  const getEventsForDay = (day: number) => {
    const dateStr = `2026-09-${String(day).padStart(2, "0")}`;

    // 1. 任務事件
    const dayTasks = tasks.filter((t) => t.dueDatetime.startsWith(dateStr));

    // 2. 里程碑完成日事件
    const dayMilestones: CalendarEventDTO[] = [];
    for (const p of projects) {
      for (const m of p.milestones) {
        if (m.plannedEnd === dateStr) {
          dayMilestones.push({
            id: `m-${m.id}`,
            title: `【${m.stageName}】${p.projectName}`,
            type: "MILESTONE",
            status: m.status,
            assignedToName: m.assignedToName,
            notes: m.notes,
            project: p,
          });
        }
      }
    }

    return { dayTasks, dayMilestones };
  };

  return (
    <div className="space-y-6">
      {/* 行事曆 Header 與切換 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-900 text-base">
            業務與專案時程排程行事曆
          </h3>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            {selectedMonth}
          </span>
        </div>

        {/* 類型標籤說明 */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-blue-700">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> 現場丈量
          </span>
          <span className="flex items-center gap-1 text-purple-700">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" /> 出圖拆單
          </span>
          <span className="flex items-center gap-1 text-indigo-700">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" /> 報價解說
          </span>
          <span className="flex items-center gap-1 text-red-700 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block animate-pulse" /> 逾期時程
          </span>
        </div>
      </div>

      {/* 月曆網格 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* 星期 Header */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 text-center text-xs font-bold text-slate-500 py-3">
          <div className="text-red-600">週日 (Sun)</div>
          <div>週一 (Mon)</div>
          <div>週二 (Tue)</div>
          <div>週三 (Wed)</div>
          <div>週四 (Thu)</div>
          <div>週五 (Fri)</div>
          <div className="text-blue-600">週六 (Sat)</div>
        </div>

        {/* 日期單元格 */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 min-h-[600px]">
          {/* 上月結尾空白 */}
          {leadingBlanks.map((_, i) => (
            <div key={`blank-${i}`} className="bg-slate-50/50 p-2 min-h-[100px] text-slate-300 text-xs font-medium">
              8/{29 + i}
            </div>
          ))}

          {/* 9 月 1 日 ~ 30 日 */}
          {daysInMonth.map((day) => {
            const { dayTasks, dayMilestones } = getEventsForDay(day);
            const isToday = day === 21; // 基準日 2026-09-21
            const hasEvents = dayTasks.length > 0 || dayMilestones.length > 0;

            return (
              <div
                key={`day-${day}`}
                className={`p-2 min-h-[110px] flex flex-col justify-between transition hover:bg-slate-50/70 ${
                  isToday ? "bg-blue-50/50 ring-2 ring-blue-400 ring-inset" : ""
                }`}
              >
                <div>
                  {/* 日期數字與今日標記 */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded-md ${
                      isToday ? "bg-blue-600 text-white font-black" : "text-slate-800"
                    }`}>
                      {day}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1 rounded">
                        今日
                      </span>
                    )}
                  </div>

                  {/* 當日里程碑與任務列表 */}
                  <div className="space-y-1">
                    {dayMilestones.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setActiveEvent(m)}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-bold truncate transition ${
                          m.status === "OVERDUE"
                            ? "bg-red-100 text-red-800 border border-red-200 animate-pulse"
                            : m.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {m.title}
                      </button>
                    ))}

                    {dayTasks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setActiveEvent({ ...t, type: "TASK" })}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition ${
                          t.taskType === "SITE_VISIT"
                            ? "bg-blue-50 text-blue-800 border border-blue-100"
                            : t.taskType === "DRAWING"
                            ? "bg-purple-50 text-purple-800 border border-purple-100"
                            : t.taskType === "QUOTE_FOLLOWUP"
                            ? "bg-indigo-50 text-indigo-800 border border-indigo-100"
                            : "bg-amber-50 text-amber-800 border border-amber-100"
                        }`}
                      >
                        • {t.subject}
                      </button>
                    ))}
                  </div>
                </div>

                {hasEvents && (
                  <div className="text-right text-[10px] text-slate-400">
                    {dayMilestones.length + dayTasks.length} 項目
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 事件詳情彈窗 Modal */}
      {activeEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                {activeEvent.type === "MILESTONE" ? "里程碑時程詳情" : "業務待辦任務詳情"}
              </h3>
              <button
                onClick={() => setActiveEvent(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block">標題事項:</span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">
                  {activeEvent.title || activeEvent.subject}
                </span>
              </div>

              {activeEvent.projectName && (
                <div>
                  <span className="text-slate-400 font-semibold block">關聯案場:</span>
                  <span className="font-medium text-slate-800">{activeEvent.projectName}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="text-slate-400 font-semibold block">時間:</span>
                  <span className="font-medium text-slate-800">
                    {activeEvent.plannedEnd || new Date(activeEvent.dueDatetime as string).toLocaleString("zh-TW")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block">負責人:</span>
                  <span className="font-medium text-slate-800">
                    {activeEvent.assignedToName || "林宏遠"}
                  </span>
                </div>
              </div>

              {activeEvent.notes && (
                <div>
                  <span className="text-slate-400 font-semibold block">備註說明:</span>
                  <span className="text-slate-700 bg-amber-50 p-2 rounded block mt-0.5 border border-amber-100">
                    {activeEvent.notes}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t flex justify-end">
              <button
                onClick={() => setActiveEvent(null)}
                className="px-4 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg shadow"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
