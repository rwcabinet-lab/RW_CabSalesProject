"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
} from "lucide-react";
import type { ProjectWithMilestonesDTO, TaskDTO } from "@/types/dto";
import { MILESTONE_STAGE_LABELS } from "@/lib/constants";

interface GanttProps {
  projects: ProjectWithMilestonesDTO[];
  tasks: TaskDTO[];
}

type TimelineRow = {
  id: string;
  label: string;
  kind: "MILESTONE" | "TASK" | "PROJECT";
  dateKey: string | null;
  actualDateKey?: string | null;
  status?: string;
  assignedToName?: string | null;
  projectId: string;
};

function getDateKey(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function utcFromKey(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatDate(key: string): string {
  return dateFromKey(key).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
}

function addDays(key: string, days: number): string {
  const date = new Date(utcFromKey(key) + days * 24 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function GanttChart({ projects, tasks }: GanttProps) {
  const todayKey = getDateKey(new Date().toISOString())!;
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  const toggleCollapse = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedProjects(new Set(projects.map((p) => p.id)));
  };

  const expandAll = () => {
    setCollapsedProjects(new Set());
  };

  const { projectRows, ticks, positionOf, startKey, endKey } = useMemo(() => {
    const taskByProject = new Map<string, TaskDTO[]>();
    for (const task of tasks) {
      // 里程碑項目已由 project.milestones 呈現完整時程與完成狀態，排除伴生待辦以避免甘特圖案件下方重複顯示已完成的項目
      if (task.milestoneId) continue;
      const projectTasks = taskByProject.get(task.projectId) || [];
      projectTasks.push(task);
      taskByProject.set(task.projectId, projectTasks);
    }

    const rowsData = projects.map((project) => {
      const rows: TimelineRow[] = project.milestones.map((milestone) => ({
        id: `milestone-${milestone.id}`,
        label: milestone.stageName || MILESTONE_STAGE_LABELS[milestone.stageCode] || milestone.stageCode,
        kind: "MILESTONE",
        dateKey: getDateKey(milestone.plannedDueDate),
        actualDateKey: getDateKey(milestone.actualDueDate),
        status: milestone.status,
        assignedToName: milestone.assignedToName,
        projectId: project.id,
      }));

      const projectTasks = taskByProject.get(project.id) || [];
      for (const task of projectTasks) {
        rows.push({
          id: `task-${task.id}`,
          label: task.subject,
          kind: "TASK",
          dateKey: getDateKey(task.dueDatetime),
          actualDateKey: getDateKey(task.completedAt),
          status: task.isCompleted ? "COMPLETED" : undefined,
          assignedToName: task.assignedToName,
          projectId: project.id,
        });
      }

      const expectedDate = getDateKey(project.expectedDate);
      if (expectedDate) {
        rows.push({
          id: `expected-${project.id}`,
          label: "預計完工",
          kind: "PROJECT",
          dateKey: expectedDate,
          projectId: project.id,
        });
      }

      return { project, rows };
    });

    const dateKeys = [
      todayKey,
      ...rowsData.flatMap(({ rows }) =>
        rows.flatMap((row) => [row.dateKey, row.actualDateKey].filter((key): key is string => Boolean(key)))
      ),
    ];
    const earliest = Math.min(...dateKeys.map(utcFromKey));
    const latest = Math.max(...dateKeys.map(utcFromKey));
    const computedStartKey = addDays(new Date(earliest).toISOString().slice(0, 10), -7);
    const computedEndKey = addDays(new Date(latest).toISOString().slice(0, 10), 7);
    const startTime = utcFromKey(computedStartKey);
    const range = Math.max(24 * 60 * 60 * 1000, utcFromKey(computedEndKey) - startTime);
    const posFn = (key: string) => Math.max(0, Math.min(100, ((utcFromKey(key) - startTime) / range) * 100));
    const computedTicks = Array.from({ length: 7 }, (_, index) => {
      const key = addDays(computedStartKey, Math.round((range / (24 * 60 * 60 * 1000) / 6) * index));
      return { key, position: (index / 6) * 100 };
    });

    return {
      projectRows: rowsData,
      ticks: computedTicks,
      positionOf: posFn,
      startKey: computedStartKey,
      endKey: computedEndKey,
    };
  }, [projects, tasks, todayKey]);

  const markerColor = (row: TimelineRow) => {
    if (row.kind === "PROJECT") return "bg-violet-500";
    if (row.status === "OVERDUE" || (row.dateKey && row.dateKey < todayKey && row.status !== "COMPLETED")) return "bg-red-500";
    if (row.status === "COMPLETED") return "bg-emerald-500";
    if (row.kind === "TASK") return "bg-amber-500";
    if (row.status === "IN_PROGRESS") return "bg-blue-500";
    return "bg-slate-400";
  };

  return (
    <div className="space-y-4">
      {/* 圖例與展開/收合控制列 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-bold text-slate-800">時程標記：</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />里程碑期限</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />待辦期限</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />已完成／實際日期</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />預計完工日</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="flex items-center gap-1 rounded bg-white px-2 py-1 text-slate-600 border border-slate-200 hover:bg-slate-100 transition shadow-2xs"
            title="全部展開"
          >
            <ChevronsDown className="w-3.5 h-3.5" />
            <span>全部展開</span>
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="flex items-center gap-1 rounded bg-white px-2 py-1 text-slate-600 border border-slate-200 hover:bg-slate-100 transition shadow-2xs"
            title="全部收合"
          >
            <ChevronsUp className="w-3.5 h-3.5" />
            <span>全部收合</span>
          </button>
          <span className="text-slate-400 hidden sm:inline">|</span>
          <span className="text-slate-500 text-[11px] hidden sm:inline">時間範圍：{formatDate(startKey)} – {formatDate(endKey)}</span>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          目前沒有符合篩選條件的案場時程。請調整上方篩選條件或點擊重設。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[1050px] p-5">
            {/* 時間軸刻度標頭 */}
            <div className="mb-3 grid grid-cols-[280px_minmax(0,1fr)_130px] items-end gap-3 border-b border-slate-200 pb-2">
              <div className="text-xs font-bold text-slate-500">案場 / 時程項目</div>
              <div className="relative h-7 text-[11px] font-semibold text-slate-500">
                {ticks.map((tick, index) => (
                  <span
                    key={`${tick.key}-${index}`}
                    className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${tick.position}%` }}
                  >
                    {formatDate(tick.key)}
                  </span>
                ))}
              </div>
              <div className="text-right text-xs font-bold text-slate-500">期限 / 負責人</div>
            </div>

            {/* 案場清單區塊 */}
            <div className="space-y-4">
              {projectRows.map(({ project, rows }) => {
                const isProjectLost = project.currentStage === "LOST";
                const isCollapsed = collapsedProjects.has(project.id);

                return (
                  <section
                    key={project.id}
                    className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-2xs hover:border-slate-200 transition"
                  >
                    {/* 案場標頭：點擊可切換展開/收合 */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => toggleCollapse(project.id)}
                        className="flex min-w-0 items-center gap-2 text-left hover:opacity-80 transition"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate text-sm font-black text-slate-900">{project.projectName}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {project.currentStage}
                        </span>
                        {!isProjectLost && project.isDelayed && (
                          <span className="shrink-0 rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            時程逾期
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({rows.length} 項時程{isCollapsed ? "・已收合" : ""})
                        </span>
                      </button>

                      <div className="flex items-center gap-3">
                        {project.salesRepName && (
                          <span className="text-xs text-slate-500 hidden sm:inline">
                            業務：{project.salesRepName}
                          </span>
                        )}
                        <Link
                          href={`/projects/${project.id}/milestones`}
                          className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
                        >
                          查看案場時程
                        </Link>
                      </div>
                    </div>

                    {/* 時程項目列表 (未收合時顯示) */}
                    {!isCollapsed && (
                      <div className="pt-1">
                        {rows.length === 0 ? (
                          <p className="py-3 text-xs text-slate-400 pl-6">尚無里程碑或待辦時程。</p>
                        ) : (
                          rows.map((row) => {
                            const overdue = !isProjectLost && Boolean(row.dateKey && row.dateKey < todayKey && row.status !== "COMPLETED");
                            const color = isProjectLost ? (row.status === "COMPLETED" ? "bg-emerald-500" : "bg-slate-400") : markerColor(row);

                            return (
                              <div
                                key={row.id}
                                className="grid grid-cols-[280px_minmax(0,1fr)_130px] items-center gap-3 py-1.5 hover:bg-slate-50/70 rounded px-1 transition"
                              >
                                <div className="flex min-w-0 items-center gap-2 pl-4">
                                  {row.kind === "PROJECT" ? (
                                    <Calendar className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                                  ) : row.status === "COMPLETED" ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                  ) : (
                                    <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                  )}
                                  <span className={`truncate text-xs ${row.kind === "PROJECT" ? "font-bold text-violet-700" : "font-medium text-slate-700"}`}>
                                    {row.label}
                                  </span>
                                  {row.kind === "TASK" && (
                                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                                      待辦
                                    </span>
                                  )}
                                </div>

                                <div
                                  className="relative h-7 rounded bg-slate-50"
                                  style={{
                                    backgroundImage: "linear-gradient(to right, #e2e8f0 1px, transparent 1px)",
                                    backgroundSize: `${100 / 6}% 100%`,
                                  }}
                                >
                                  {/* 今日指示線 */}
                                  <div
                                    className="absolute bottom-0 top-0 z-10 w-px bg-sky-400/80"
                                    style={{ left: `${positionOf(todayKey)}%` }}
                                    title="今日"
                                  />

                                  {/* 期限點 */}
                                  {row.dateKey && (
                                    <span
                                      className={`absolute top-1/2 z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${color}`}
                                      style={{ left: `${positionOf(row.dateKey)}%` }}
                                      title={`期限：${row.dateKey}${row.status ? `｜${row.status}` : ""}`}
                                    />
                                  )}

                                  {/* 實際完成點 */}
                                  {row.actualDateKey && row.actualDateKey !== row.dateKey && (
                                    <span
                                      className="absolute top-1/2 z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500"
                                      style={{ left: `${positionOf(row.actualDateKey)}%` }}
                                      title={`實際完成：${row.actualDateKey}`}
                                    />
                                  )}
                                </div>

                                <div className="text-right text-[10px]">
                                  <div className={overdue ? "font-bold text-red-600" : "font-semibold text-slate-600"}>
                                    {row.dateKey ? formatDate(row.dateKey) : "未排定"}
                                    {overdue && "・逾期"}
                                  </div>
                                  <div className="truncate text-slate-400">
                                    {row.assignedToName || (row.kind === "PROJECT" ? "案場" : "未指定")}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
