"use client";

import Link from "next/link";
import { Calendar, CheckCircle2, Clock } from "lucide-react";
import type { ProjectWithMilestonesDTO, TaskDTO } from "@/types/dto";
import { MILESTONE_STAGE_LABELS } from "@/lib/mock-data";

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
  const taskByProject = new Map<string, TaskDTO[]>();
  for (const task of tasks) {
    const projectTasks = taskByProject.get(task.projectId) || [];
    projectTasks.push(task);
    taskByProject.set(task.projectId, projectTasks);
  }

  const projectRows = projects.map((project) => {
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
    ...projectRows.flatMap(({ rows }) =>
      rows.flatMap((row) => [row.dateKey, row.actualDateKey].filter((key): key is string => Boolean(key)))
    ),
  ];
  const earliest = Math.min(...dateKeys.map(utcFromKey));
  const latest = Math.max(...dateKeys.map(utcFromKey));
  const startKey = addDays(new Date(earliest).toISOString().slice(0, 10), -7);
  const endKey = addDays(new Date(latest).toISOString().slice(0, 10), 7);
  const startTime = utcFromKey(startKey);
  const range = utcFromKey(endKey) - startTime;
  const positionOf = (key: string) => Math.max(0, Math.min(100, ((utcFromKey(key) - startTime) / range) * 100));
  const ticks = Array.from({ length: 7 }, (_, index) => {
    const key = addDays(startKey, Math.round((range / (24 * 60 * 60 * 1000) / 6) * index));
    return { key, position: (index / 6) * 100 };
  });

  const markerColor = (row: TimelineRow) => {
    if (row.kind === "PROJECT") return "bg-violet-500";
    if (row.status === "OVERDUE" || (row.dateKey && row.dateKey < todayKey && row.status !== "COMPLETED")) return "bg-red-500";
    if (row.status === "COMPLETED") return "bg-emerald-500";
    if (row.kind === "TASK") return "bg-amber-500";
    if (row.status === "IN_PROGRESS") return "bg-blue-500";
    return "bg-slate-400";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <span className="font-bold text-slate-800">時間軸標記：</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />里程碑期限</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />待辦期限</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />已完成／實際日期</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />預計完工日</span>
        <span className="ml-auto text-slate-500">時間範圍：{formatDate(startKey)} – {formatDate(endKey)}</span>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          目前沒有可顯示的案場時程。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[1050px] p-5">
            <div className="mb-3 grid grid-cols-[270px_minmax(0,1fr)_130px] items-end gap-3 border-b border-slate-200 pb-2">
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

            <div className="space-y-5">
              {projectRows.map(({ project, rows }) => (
                <section key={project.id} className="space-y-1">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 pt-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-900">{project.projectName}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{project.currentStage}</span>
                      {project.isDelayed && <span className="shrink-0 text-[10px] font-bold text-red-700">時程逾期</span>}
                    </div>
                    <Link
                      href={`/projects/${project.id}/milestones`}
                      className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
                    >
                      查看案場時程
                    </Link>
                  </div>

                  {rows.length === 0 ? (
                    <p className="py-3 text-xs text-slate-400">尚無里程碑或待辦時程。</p>
                  ) : rows.map((row) => {
                    const overdue = Boolean(row.dateKey && row.dateKey < todayKey && row.status !== "COMPLETED");
                    const color = markerColor(row);
                    return (
                      <div key={row.id} className="grid grid-cols-[270px_minmax(0,1fr)_130px] items-center gap-3 py-1.5">
                        <div className="flex min-w-0 items-center gap-2 pl-2">
                          {row.kind === "PROJECT" ? <Calendar className="h-3.5 w-3.5 shrink-0 text-violet-500" /> : row.status === "COMPLETED" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                          <span className={`truncate text-xs ${row.kind === "PROJECT" ? "font-bold text-violet-700" : "font-medium text-slate-700"}`}>{row.label}</span>
                          {row.kind === "TASK" && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">待辦</span>}
                        </div>

                        <div
                          className="relative h-7 rounded bg-slate-50"
                          style={{
                            backgroundImage: "linear-gradient(to right, #e2e8f0 1px, transparent 1px)",
                            backgroundSize: `${100 / 6}% 100%`,
                          }}
                        >
                          <div
                            className="absolute bottom-0 top-0 z-10 w-px bg-sky-400/80"
                            style={{ left: `${positionOf(todayKey)}%` }}
                            title="今日"
                          />
                          {row.dateKey && (
                            <span
                              className={`absolute top-1/2 z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${color}`}
                              style={{ left: `${positionOf(row.dateKey)}%` }}
                              title={`期限：${row.dateKey}${row.status ? `｜${row.status}` : ""}`}
                            />
                          )}
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
                          <div className="truncate text-slate-400">{row.assignedToName || (row.kind === "PROJECT" ? "案場" : "未指定")}</div>
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
