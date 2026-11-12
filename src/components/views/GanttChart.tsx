"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import type { ProjectWithMilestonesDTO, TaskDTO } from "@/types/dto";
import { MILESTONE_STAGE_LABELS } from "@/lib/constants";
import { getTaiwanDateString } from "@/lib/schedule-engine";
import { SectionHelpButton } from "@/components/common/SectionHelpButton";

interface GanttProps {
  projects: ProjectWithMilestonesDTO[];
  tasks: TaskDTO[];
}

type TimelineRow = {
  id: string;
  label: string;
  kind: "MILESTONE" | "TASK" | "PROJECT";
  stageCode?: string;
  dateKey: string | null;
  actualDateKey?: string | null;
  status?: string;
  assignedToName?: string | null;
  projectId: string;
};

type PhaseGroup = {
  phase: ProjectWithMilestonesDTO;
  rows: TimelineRow[];
  startKey: string | null;
  endKey: string | null;
  progressPercent: number;
};

type ProjectRowData = {
  project: ProjectWithMilestonesDTO;
  hasPhases: boolean;
  phases: PhaseGroup[];
  directRows: TimelineRow[];
  startKey: string | null;
  endKey: string | null;
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
  const todayKey = getTaiwanDateString();
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());

  // 縮放與平移狀態
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; scrollLeft: number }>({ x: 0, scrollLeft: 0 });

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const togglePhaseCollapse = (phaseId: string) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const collapseAll = () => {
    const allProjIds = new Set<string>();
    const allPhaseIds = new Set<string>();
    for (const p of projects) {
      allProjIds.add(p.id);
      if (p.phases) {
        for (const ph of p.phases) allPhaseIds.add(ph.id);
      }
    }
    setCollapsedProjects(allProjIds);
    setCollapsedPhases(allPhaseIds);
  };

  const expandAll = () => {
    setCollapsedProjects(new Set());
    setCollapsedPhases(new Set());
  };

  // 建構里程碑與待辦行
  const buildRowsForProject = useCallback(
    (proj: ProjectWithMilestonesDTO, taskByProject: Map<string, TaskDTO[]>): TimelineRow[] => {
      const sortedMilestones = [...proj.milestones].sort((a, b) => a.stageOrder - b.stageOrder);
      const pausedM = sortedMilestones.find((m) => m.status !== "COMPLETED" && !m.plannedDueDate);
      const pausedOrder = pausedM ? pausedM.stageOrder : null;

      const rows: TimelineRow[] = proj.milestones.map((milestone) => {
        const isSubsequent = Boolean(
          milestone.isSubsequentToPaused ??
            (pausedOrder !== null && milestone.stageOrder > pausedOrder && milestone.status !== "COMPLETED")
        );
        return {
          id: `milestone-${milestone.id}`,
          label: milestone.stageName || MILESTONE_STAGE_LABELS[milestone.stageCode] || milestone.stageCode,
          kind: "MILESTONE",
          stageCode: milestone.stageCode,
          dateKey: isSubsequent ? null : getDateKey(milestone.plannedDueDate),
          actualDateKey: getDateKey(milestone.actualDueDate),
          status: isSubsequent ? undefined : milestone.status,
          assignedToName: milestone.assignedToName,
          projectId: proj.id,
        };
      });

      const projectTasks = taskByProject.get(proj.id) || [];
      for (const task of projectTasks) {
        rows.push({
          id: `task-${task.id}`,
          label: task.subject,
          kind: "TASK",
          dateKey: getDateKey(task.dueDatetime),
          actualDateKey: getDateKey(task.completedAt),
          status: task.isCompleted ? "COMPLETED" : undefined,
          assignedToName: task.assignedToName,
          projectId: proj.id,
        });
      }

      const expectedDate = getDateKey(proj.expectedDate);
      if (expectedDate) {
        rows.push({
          id: `expected-${proj.id}`,
          label: "預計完工",
          kind: "PROJECT",
          dateKey: expectedDate,
          projectId: proj.id,
        });
      }

      return rows;
    },
    []
  );

  const { projectRows, ticks, positionOf, startKey, endKey } = useMemo(() => {
    const taskByProject = new Map<string, TaskDTO[]>();
    for (const task of tasks) {
      if (task.milestoneId) continue;
      const list = taskByProject.get(task.projectId) || [];
      list.push(task);
      taskByProject.set(task.projectId, list);
    }

    const rowsData: ProjectRowData[] = projects.map((project) => {
      const hasPhases = Boolean(project.phases && project.phases.length > 0);

      if (hasPhases && project.phases) {
        const phaseGroups: PhaseGroup[] = project.phases.map((ph) => {
          const phRows = buildRowsForProject(ph, taskByProject);
          const phDates = phRows
            .flatMap((r) => [r.dateKey, r.actualDateKey])
            .filter((k): k is string => Boolean(k));
          const completedCount = ph.milestones.filter((m) => m.status === "COMPLETED").length;
          const totalCount = ph.milestones.length;
          const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

          const phStart = phDates.length > 0 ? phDates.reduce((min, d) => (d < min ? d : min)) : null;
          const phEnd = phDates.length > 0 ? phDates.reduce((max, d) => (d > max ? d : max)) : null;

          return {
            phase: ph,
            rows: phRows,
            startKey: phStart,
            endKey: phEnd,
            progressPercent,
          };
        });

        const allPhaseDates = phaseGroups
          .flatMap((g) => [g.startKey, g.endKey])
          .filter((k): k is string => Boolean(k));
        const projStart = allPhaseDates.length > 0 ? allPhaseDates.reduce((min, d) => (d < min ? d : min)) : null;
        const projEnd = allPhaseDates.length > 0 ? allPhaseDates.reduce((max, d) => (d > max ? d : max)) : null;

        return {
          project,
          hasPhases: true,
          phases: phaseGroups,
          directRows: [],
          startKey: projStart,
          endKey: projEnd,
        };
      }

      // 一般單期案件
      const directRows = buildRowsForProject(project, taskByProject);
      const dates = directRows
        .flatMap((r) => [r.dateKey, r.actualDateKey])
        .filter((k): k is string => Boolean(k));
      const projStart = dates.length > 0 ? dates.reduce((min, d) => (d < min ? d : min)) : null;
      const projEnd = dates.length > 0 ? dates.reduce((max, d) => (d > max ? d : max)) : null;

      return {
        project,
        hasPhases: false,
        phases: [],
        directRows,
        startKey: projStart,
        endKey: projEnd,
      };
    });

    const dateKeys = [
      todayKey,
      ...rowsData.flatMap((g) => {
        const fromPhases = g.phases.flatMap((ph) =>
          ph.rows.flatMap((r) => [r.dateKey, r.actualDateKey].filter((k): k is string => Boolean(k)))
        );
        const fromDirect = g.directRows.flatMap((r) => [r.dateKey, r.actualDateKey].filter((k): k is string => Boolean(k)));
        return [...fromPhases, ...fromDirect];
      }),
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
  }, [projects, tasks, todayKey, buildRowsForProject]);

  const markerColor = (row: TimelineRow) => {
    if (row.kind === "PROJECT") return "bg-violet-500";
    if (row.status === "OVERDUE" || (row.dateKey && row.dateKey <= todayKey && row.status !== "COMPLETED")) return "bg-red-500";
    if (row.status === "COMPLETED") return "bg-emerald-500";
    if (row.kind === "TASK") return "bg-amber-500";
    if (row.status === "IN_PROGRESS") return "bg-sky-500";
    return "bg-slate-400";
  };

  // 滑鼠滾輪縮放與按住平移監聽
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 15 : -15;
      setZoomLevel((prev) => Math.max(60, Math.min(250, prev + delta)));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // 滾輪中鍵 (button 1) 或在時間軸平移區點擊左鍵
    if (e.button === 1 || (e.button === 0 && (e.target as HTMLElement).closest(".gantt-pan-area"))) {
      e.preventDefault();
      setIsDragging(true);
      if (scrollContainerRef.current) {
        dragStartRef.current = {
          x: e.clientX,
          scrollLeft: scrollContainerRef.current.scrollLeft,
        };
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    scrollContainerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
  };

  const handleMouseUp = () => {
    if (isDragging) setIsDragging(false);
  };

  // 渲染單個里程碑或待辦行（含預定完成與實際完成之啞鈴連線）
  const renderTimelineRow = (row: TimelineRow, isProjectLost: boolean) => {
    const overdue = !isProjectLost && Boolean(row.dateKey && row.dateKey < todayKey && row.status !== "COMPLETED");
    const dueToday = !isProjectLost && Boolean(row.dateKey && row.dateKey === todayKey && row.status !== "COMPLETED");
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
          <span
            className={`truncate text-xs ${
              row.kind === "PROJECT"
                ? "font-bold text-violet-700"
                : overdue || dueToday
                ? "font-bold text-red-900"
                : "font-medium text-slate-700"
            }`}
          >
            {row.label}
          </span>
          {row.kind === "TASK" && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                overdue || dueToday ? "bg-red-100 text-red-700 font-bold" : "bg-amber-50 text-amber-700"
              }`}
            >
              指派任務
            </span>
          )}
        </div>

        <div
          className="relative h-7 rounded bg-slate-50 select-none"
          style={{
            backgroundImage: "linear-gradient(to right, #e2e8f0 1px, transparent 1px)",
            backgroundSize: `${100 / 6}% 100%`,
          }}
        >
          {/* 今日指示線 */}
          <div
            className="absolute bottom-0 top-0 z-10 w-px bg-sky-400/80"
            style={{ left: `${positionOf(todayKey)}%` }}
            title="今日基準線"
          />

          {/* 預定與實際完成兩點相連線 (Dumbbell Variance Line) */}
          {row.dateKey && row.actualDateKey && row.actualDateKey !== row.dateKey && (() => {
            const p1 = positionOf(row.dateKey);
            const p2 = positionOf(row.actualDateKey);
            const minPos = Math.min(p1, p2);
            const width = Math.max(Math.abs(p2 - p1), 0.5);
            const isEarly = row.actualDateKey < row.dateKey;
            return (
              <span
                className={`absolute top-1/2 -translate-y-1/2 h-1 rounded-full z-15 ${
                  isEarly ? "bg-emerald-400" : "bg-red-400"
                }`}
                style={{ left: `${minPos}%`, width: `${width}%` }}
                title={
                  isEarly
                    ? `提前完成：預定 ${row.dateKey}，實際 ${row.actualDateKey}`
                    : `延誤落差：預定 ${row.dateKey}，實際 ${row.actualDateKey}`
                }
              />
            );
          })()}

          {/* 逾期且未完成之持續延誤虛線 */}
          {overdue && row.dateKey && !row.actualDateKey && (() => {
            const p1 = positionOf(row.dateKey);
            const pToday = positionOf(todayKey);
            const minPos = Math.min(p1, pToday);
            const width = Math.max(Math.abs(pToday - p1), 0.5);
            return (
              <span
                className="absolute top-1/2 -translate-y-1/2 h-0.5 border-t-2 border-dashed border-red-400 z-15 opacity-80"
                style={{ left: `${minPos}%`, width: `${width}%` }}
                title={`持續延遲中：預定 ${row.dateKey}，尚未完成`}
              />
            );
          })()}

          {/* 預定完成點 */}
          {row.dateKey && (
            <span
              className={`absolute top-1/2 z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${color}`}
              style={{ left: `${positionOf(row.dateKey)}%` }}
              title={`${row.stageCode === "6-1" ? "進場日期" : "預定完成"}：${row.dateKey}${
                row.status ? `｜${row.status}` : ""
              }`}
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
          <div className={overdue || dueToday ? "font-bold text-red-600" : "font-semibold text-slate-600"}>
            {row.dateKey ? formatDate(row.dateKey) : "未排定"}
            {overdue && "・逾期"}
            {dueToday && "・已到期"}
          </div>
          <div className="truncate text-slate-400">
            {row.assignedToName || (row.kind === "PROJECT" ? "案場" : "未指定")}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 圖例與展開/收合/縮放控制列 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            時程標記：
            <SectionHelpButton sectionId="views-gantt" />
          </span>
          <span className="flex items-center gap-1.5" title="進行中之標準里程碑子進度預定完成日">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
            現正進行
          </span>
          <span className="flex items-center gap-1.5" title="個別交辦之任務待辦到期日">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            指派任務
          </span>
          <span className="flex items-center gap-1.5" title="大圓代表預定完成期限，小圓代表實際完成日期">
            <span className="relative flex items-center justify-center mr-0.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="absolute -right-1 -bottom-0.5 h-1.5 w-1.5 rounded-full border border-white bg-emerald-500" />
            </span>
            預定／實際完成
          </span>
          <span className="flex items-center gap-1.5" title="同期預定與實際完成兩點相連：綠線代表提前完成，紅線代表延誤落差">
            <span className="flex items-center">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              <span className="h-0.5 w-3 bg-red-400" />
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            落差連線（提前/延誤）
          </span>
          <span className="flex items-center gap-1.5" title="已超過期限或今日到期未完成之項目">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            逾期／已到期
          </span>
          <span className="flex items-center gap-1.5" title="案場預定進場日">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
            預定進場日
          </span>
          <span className="flex items-center gap-1.5" title="貫穿時間軸之今日日期垂直基準線">
            <span className="h-3 w-0.5 rounded bg-sky-400" />
            今日基準線
          </span>
        </div>

        {/* 縮放與折疊操作按鈕列 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 時間軸縮放控制項 */}
          <div className="flex items-center gap-1 rounded bg-white px-2 py-1 text-slate-700 border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">縮放：{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(60, z - 20))}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-600"
              title="縮小時間軸 (Ctrl + 滾輪向下)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="px-1.5 py-0.5 text-[10px] font-bold rounded hover:bg-slate-100 text-slate-600"
              title="回復 100% 最適寬度"
            >
              最適
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(250, z + 20))}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-600"
              title="放大時間軸 (Ctrl + 滾輪向上)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

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
          <span className="text-slate-500 text-[11px] hidden sm:inline">
            範圍：{formatDate(startKey)} – {formatDate(endKey)}
          </span>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          目前沒有符合篩選條件的案場時程。請調整上方篩選條件或點擊重設。
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm select-none ${
            isDragging ? "cursor-grabbing" : "cursor-default"
          }`}
        >
          <div
            className="p-5 transition-[min-width] duration-150"
            style={{ minWidth: `${Math.round(1050 * (zoomLevel / 100))}px` }}
          >
            {/* 時間軸刻度標頭 (可拖曳平移感應區) */}
            <div className="gantt-pan-area mb-3 grid grid-cols-[280px_minmax(0,1fr)_130px] items-end gap-3 border-b border-slate-200 pb-2 cursor-grab">
              <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <span>案場 / 時程項目</span>
                <span className="text-[10px] font-normal text-slate-400">（中鍵/拖曳可平移）</span>
              </div>
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
              {projectRows.map((group) => {
                const { project, hasPhases, phases, directRows } = group;
                const isProjectLost = project.currentStage === "LOST";
                const isProjectCollapsed = collapsedProjects.has(project.id);

                return (
                  <section
                    key={project.id}
                    className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-2xs hover:border-slate-200 transition"
                  >
                    {/* 案場標頭：點擊可切換展開/收合 */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => toggleProjectCollapse(project.id)}
                        className="flex min-w-0 items-center gap-2 text-left hover:opacity-80 transition"
                      >
                        {isProjectCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate text-sm font-black text-slate-900">{project.projectName}</span>
                        {hasPhases && (
                          <span className="shrink-0 rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5" /> 共 {phases.length} 期
                          </span>
                        )}
                        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {project.currentStage}
                        </span>
                        {!isProjectLost && project.isDelayed && (
                          <span className="shrink-0 rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            時程逾期
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({hasPhases ? `${phases.length} 個分期` : `${directRows.length} 項時程`}
                          {isProjectCollapsed ? "・已收合" : ""})
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

                    {/* 未收合時顯示內容 */}
                    {!isProjectCollapsed && (
                      <div className="pt-2">
                        {/* 情況 A：多期案場（階層展示各分期橫條與其內部里程碑） */}
                        {hasPhases ? (
                          <div className="space-y-3 pl-2">
                            {phases.map((phGroup) => {
                              const phase = phGroup.phase;
                              const isPhaseCollapsed = collapsedPhases.has(phase.id);
                              const isPhaseLost = phase.currentStage === "LOST";

                              return (
                                <div
                                  key={phase.id}
                                  className="rounded-lg border border-indigo-100 bg-slate-50/60 p-2"
                                >
                                  {/* 期數列標頭與期數摘要條 (Phase Summary Bar) */}
                                  <div className="grid grid-cols-[280px_minmax(0,1fr)_130px] items-center gap-3 pb-1 border-b border-indigo-50">
                                    <button
                                      type="button"
                                      onClick={() => togglePhaseCollapse(phase.id)}
                                      className="flex min-w-0 items-center gap-1.5 text-left hover:opacity-80 transition"
                                    >
                                      {isPhaseCollapsed ? (
                                        <ChevronRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                      ) : (
                                        <ChevronDown className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                      )}
                                      <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[10px] font-black text-indigo-800 shrink-0">
                                        {phase.phaseName || `第 ${phase.phaseNumber} 期`}
                                      </span>
                                      <span className="truncate text-xs font-bold text-slate-800">
                                        {phase.projectName}
                                      </span>
                                    </button>

                                    {/* 期數時間軸摘要進度條 (Phase Summary Bar) */}
                                    <div className="relative h-6 rounded bg-slate-100">
                                      {/* 今日線 */}
                                      <div
                                        className="absolute bottom-0 top-0 z-10 w-px bg-sky-400/80"
                                        style={{ left: `${positionOf(todayKey)}%` }}
                                      />

                                      {/* 期數色塊跨度條 */}
                                      {phGroup.startKey && phGroup.endKey && (() => {
                                        const p1 = positionOf(phGroup.startKey);
                                        const p2 = positionOf(phGroup.endKey);
                                        const left = Math.min(p1, p2);
                                        const width = Math.max(Math.abs(p2 - p1), 2);
                                        const isOverdue = phase.isDelayed;

                                        return (
                                          <div
                                            className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-md overflow-hidden border shadow-2xs ${
                                              isOverdue
                                                ? "bg-red-50 border-red-200"
                                                : isPhaseLost
                                                ? "bg-slate-200 border-slate-300"
                                                : "bg-indigo-100 border-indigo-300"
                                            }`}
                                            style={{ left: `${left}%`, width: `${width}%` }}
                                            title={`期數跨度：${phGroup.startKey} ～ ${phGroup.endKey}（完成度 ${phGroup.progressPercent}%）`}
                                          >
                                            {/* 進度填充 */}
                                            <div
                                              className={`h-full transition-all ${
                                                isOverdue ? "bg-red-500/80" : "bg-indigo-500/80"
                                              }`}
                                              style={{ width: `${phGroup.progressPercent}%` }}
                                            />
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    <div className="text-right text-[10px] flex items-center justify-end gap-1.5">
                                      <span className="font-bold text-indigo-700">
                                        進度 {phGroup.progressPercent}%
                                      </span>
                                      <Link
                                        href={`/projects/${phase.id}/milestones`}
                                        className="text-blue-600 hover:underline"
                                      >
                                        時程
                                      </Link>
                                    </div>
                                  </div>

                                  {/* 展開期數內部里程碑 */}
                                  {!isPhaseCollapsed && (
                                    <div className="pt-1.5 space-y-0.5">
                                      {phGroup.rows.length === 0 ? (
                                        <p className="py-2 text-[11px] text-slate-400 pl-4">
                                          此分期尚無里程碑項目。
                                        </p>
                                      ) : (
                                        phGroup.rows.map((r) => renderTimelineRow(r, isPhaseLost))
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* 情況 B：常規單期案件（直接呈現 28 項進度與待辦） */
                          <div className="space-y-0.5">
                            {directRows.length === 0 ? (
                              <p className="py-3 text-xs text-slate-400 pl-6">尚無里程碑或待辦時程。</p>
                            ) : (
                              directRows.map((r) => renderTimelineRow(r, isProjectLost))
                            )}
                          </div>
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
