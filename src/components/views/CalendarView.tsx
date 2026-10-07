"use client";

import { useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  MapPin,
  User,
} from "lucide-react";
import type { MilestoneDTO, ProjectWithMilestonesDTO, TaskDTO } from "@/types/dto";
import { MILESTONE_STAGE_LABELS } from "@/lib/mock-data";

interface CalendarProps {
  projects: ProjectWithMilestonesDTO[];
  tasks: TaskDTO[];
}

type CalendarEvent =
  | { type: "MILESTONE"; project: ProjectWithMilestonesDTO; milestone: MilestoneDTO }
  | { type: "TASK"; task: TaskDTO };

function toDateKey(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function keyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function taskTypeLabel(task: TaskDTO): string {
  switch (task.taskType) {
    case "SITE_VISIT":
      return "現場丈量";
    case "DRAWING":
      return "圖面作業";
    case "QUOTE_FOLLOWUP":
      return "報價追蹤";
    case "PAYMENT_REMINDER":
      return "請款提醒";
  }
}

function taskStyle(task: TaskDTO, todayKey: string): string {
  if (task.isCompleted) return "border-slate-200 bg-slate-100 text-slate-600";
  const dueKey = toDateKey(task.dueDatetime);
  if (dueKey && dueKey < todayKey) return "border-red-200 bg-red-100 text-red-800";

  switch (task.taskType) {
    case "SITE_VISIT":
      return "border-blue-100 bg-blue-50 text-blue-800";
    case "DRAWING":
      return "border-purple-100 bg-purple-50 text-purple-800";
    case "QUOTE_FOLLOWUP":
      return "border-indigo-100 bg-indigo-50 text-indigo-800";
    case "PAYMENT_REMINDER":
      return "border-amber-100 bg-amber-50 text-amber-800";
  }
}

function monthLabel(year: number, month: number): string {
  return `${year} 年 ${String(month + 1).padStart(2, "0")} 月`;
}

export function CalendarView({ projects, tasks }: CalendarProps) {
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);

  const firstDay = new Date(month.year, month.month, 1);
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const cellCount = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
  const todayKey = keyFromDate(new Date());
  const eventsByDate = new Map<string, CalendarEvent[]>();

  const addEvent = (dateKey: string | null, event: CalendarEvent) => {
    if (!dateKey) return;
    const events = eventsByDate.get(dateKey) || [];
    events.push(event);
    eventsByDate.set(dateKey, events);
  };

  for (const project of projects) {
    for (const milestone of project.milestones) {
      addEvent(toDateKey(milestone.plannedDueDate), { type: "MILESTONE", project, milestone });
    }
  }
  for (const task of tasks) {
    addEvent(toDateKey(task.dueDatetime), { type: "TASK", task });
  }

  const changeMonth = (offset: number) => {
    const date = new Date(month.year, month.month + offset, 1);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
  };

  const currentMonthEvents = Array.from(eventsByDate.entries())
    .filter(([dateKey]) => dateKey.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}`))
    .reduce((total, [, dayEvents]) => total + dayEvents.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-blue-600" />
          <h3 className="text-base font-bold text-slate-900">業務與專案時程排程行事曆</h3>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            {monthLabel(month.year, month.month)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => changeMonth(-1)}
            aria-label="前一個月"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const today = new Date();
              setMonth({ year: today.getFullYear(), month: today.getMonth() });
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50"
          >
            本月
          </button>
          <button
            onClick={() => changeMonth(1)}
            aria-label="下一個月"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-xs text-slate-500">本月共 {currentMonthEvents} 項時程</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 py-3 text-center text-xs font-bold text-slate-500">
            <div className="text-red-600">週日</div>
            <div>週一</div>
            <div>週二</div>
            <div>週三</div>
            <div>週四</div>
            <div>週五</div>
            <div className="text-blue-600">週六</div>
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: cellCount }, (_, index) => {
              const dayNumber = index - leadingBlanks + 1;
              const inMonth = dayNumber > 0 && dayNumber <= daysInMonth;
              const dateKey = inMonth
                ? `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`
                : null;
              const dayEvents = dateKey ? eventsByDate.get(dateKey) || [] : [];
              const isToday = dateKey === todayKey;
              const displayDay = inMonth
                ? dayNumber
                : dayNumber <= 0
                  ? new Date(month.year, month.month, dayNumber).getDate()
                  : dayNumber - daysInMonth;

              return (
                <div
                  key={dateKey || `outside-${month.year}-${month.month}-${index}`}
                  className={`min-h-[125px] border-b border-r border-slate-100 p-2 ${
                    inMonth ? "bg-white hover:bg-slate-50/70" : "bg-slate-50/70"
                  } ${isToday ? "bg-blue-50/60 ring-2 ring-inset ring-blue-400" : ""}`}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className={`rounded-md px-1.5 py-0.5 font-mono text-xs font-bold ${
                      isToday ? "bg-blue-600 text-white" : inMonth ? "text-slate-800" : "text-slate-300"
                    }`}>
                      {displayDay}
                    </span>
                    {isToday && <span className="text-[10px] font-bold text-blue-700">今日</span>}
                  </div>

                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => {
                      if (event.type === "MILESTONE") {
                        const { milestone, project } = event;
                        const label = milestone.stageName || MILESTONE_STAGE_LABELS[milestone.stageCode] || milestone.stageCode;
                        const milestoneStyle = milestone.status === "OVERDUE"
                          ? "border-red-200 bg-red-100 text-red-800"
                          : milestone.status === "COMPLETED"
                            ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                            : milestone.status === "IN_PROGRESS"
                              ? "border-blue-100 bg-blue-50 text-blue-800"
                              : "border-slate-200 bg-slate-50 text-slate-700";

                        return (
                          <button
                            key={`milestone-${milestone.id}`}
                            onClick={() => setActiveEvent(event)}
                            title={`${label}｜${project.projectName}`}
                            className={`w-full truncate rounded border px-1.5 py-1 text-left text-[10px] font-semibold ${milestoneStyle}`}
                          >
                            <span className="font-black">里</span> {label} · {project.projectName}
                          </button>
                        );
                      }

                      return (
                        <button
                          key={`task-${event.task.id}`}
                          onClick={() => setActiveEvent(event)}
                          title={`${event.task.subject}｜${event.task.projectName || ""}`}
                          className={`w-full truncate rounded border px-1.5 py-1 text-left text-[10px] font-medium ${taskStyle(event.task, todayKey)}`}
                        >
                          {event.task.isCompleted ? "✓" : "待"} {event.task.subject}
                        </button>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <p className="px-1 text-[10px] font-semibold text-slate-500">另有 {dayEvents.length - 3} 項</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {activeEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-title"
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 id="calendar-event-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
                <CalendarIcon className="h-5 w-5 text-blue-600" />
                {activeEvent.type === "MILESTONE" ? "里程碑時程詳情" : "業務待辦任務詳情"}
              </h3>
              <button
                onClick={() => setActiveEvent(null)}
                aria-label="關閉"
                className="text-lg font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {activeEvent.type === "MILESTONE" ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="block font-semibold text-slate-400">時程事項</span>
                  <span className="mt-0.5 block text-sm font-bold text-slate-900">
                    {activeEvent.milestone.stageName || MILESTONE_STAGE_LABELS[activeEvent.milestone.stageCode] || activeEvent.milestone.stageCode}
                  </span>
                </div>
                <div>
                  <span className="block font-semibold text-slate-400">關聯案場</span>
                  <span className="font-medium text-slate-800">{activeEvent.project.projectName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div>
                    <span className="block font-semibold text-slate-400">預定期限</span>
                    <span className="font-medium text-slate-800">
                      {activeEvent.milestone.plannedDueDate ? formatDate(activeEvent.milestone.plannedDueDate) : "未排定"}
                    </span>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-400">狀態</span>
                    <span className="font-medium text-slate-800">{activeEvent.milestone.status}</span>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-400">負責人</span>
                    <span className="font-medium text-slate-800">{activeEvent.milestone.assignedToName || "未指定"}</span>
                  </div>
                  {activeEvent.milestone.actualDueDate && (
                    <div>
                      <span className="block font-semibold text-slate-400">實際完成日</span>
                      <span className="font-medium text-slate-800">{formatDate(activeEvent.milestone.actualDueDate)}</span>
                    </div>
                  )}
                </div>
                {activeEvent.milestone.notes && (
                  <p className="rounded border border-amber-100 bg-amber-50 p-2 text-slate-700">{activeEvent.milestone.notes}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="block font-semibold text-slate-400">待辦事項</span>
                  <span className="mt-0.5 block text-sm font-bold text-slate-900">{activeEvent.task.subject}</span>
                  <span className="mt-1 inline-block rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">{taskTypeLabel(activeEvent.task)}</span>
                </div>
                <div>
                  <span className="block font-semibold text-slate-400">關聯案場</span>
                  <span className="font-medium text-slate-800">{activeEvent.task.projectName || "未指定案場"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start gap-1">
                    <Clock className="mt-0.5 h-3 w-3 text-slate-400" />
                    <div>
                      <span className="block font-semibold text-slate-400">預定完成</span>
                      <span className="font-medium text-slate-800">{new Date(activeEvent.task.dueDatetime).toLocaleString("zh-TW")}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-1">
                    <User className="mt-0.5 h-3 w-3 text-slate-400" />
                    <div>
                      <span className="block font-semibold text-slate-400">負責人</span>
                      <span className="font-medium text-slate-800">{activeEvent.task.assignedToName || "未指定"}</span>
                    </div>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-400">狀態</span>
                    <span className="font-medium text-slate-800">
                      {activeEvent.task.isCompleted ? "已完成" : toDateKey(activeEvent.task.dueDatetime)! < todayKey ? "逾期" : "待處理"}
                    </span>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-400">優先度</span>
                    <span className="font-medium text-slate-800">{activeEvent.task.priority}</span>
                  </div>
                </div>
                {activeEvent.task.resultNotes && (
                  <p className="rounded border border-amber-100 bg-amber-50 p-2 text-slate-700">{activeEvent.task.resultNotes}</p>
                )}
              </div>
            )}

            {activeEvent.type === "TASK" && activeEvent.task.isCompleted && activeEvent.task.completedAt && (
              <div className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                完成時間：{new Date(activeEvent.task.completedAt).toLocaleString("zh-TW")}
              </div>
            )}
            {activeEvent.type === "MILESTONE" && activeEvent.project.siteAddress && (
              <div className="flex items-start gap-1 text-xs text-slate-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {activeEvent.project.siteAddress}
              </div>
            )}

            <div className="flex justify-end border-t pt-3">
              <button
                onClick={() => setActiveEvent(null)}
                className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-900"
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
