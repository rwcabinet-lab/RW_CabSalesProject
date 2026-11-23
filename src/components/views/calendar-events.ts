import { ScheduleEngine, getPausedScheduleOrder, computeIsSubsequentToPaused } from "@/lib/schedule-engine";
import type { MilestoneDTO, ProjectWithMilestonesDTO, TaskDTO } from "@/types/dto";

export type CalendarEvent =
  | { type: "MILESTONE"; project: ProjectWithMilestonesDTO; milestone: MilestoneDTO }
  | { type: "TASK"; task: TaskDTO };

/**
 * 將日期字串轉為 YYYY-MM-DD 鍵值供月曆格子索引使用
 */
export function toDateKey(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * 判斷案場（或單一期數）是否處於進行中狀態（非流標且尚未立帳結案）
 */
export function isCalendarProjectActive(project: ProjectWithMilestonesDTO): boolean {
  if (project.currentStage === "LOST") return false;
  return !ScheduleEngine.isProjectClosed(project, project.milestones);
}

/**
 * 建立行事曆依日期分組之事件清單：
 * 1. 不重複顯示里程碑關聯待辦（排除 milestoneId !== null 之任務）
 * 2. 只顯示進行中項目（進行中/已逾期之里程碑與未完成之獨立待辦，並排除流標與已結案案場）
 */
export function buildCalendarEventsByDate({
  projects,
  tasks,
  hiddenStaffIds,
}: {
  projects: ProjectWithMilestonesDTO[];
  tasks: TaskDTO[];
  hiddenStaffIds?: Set<string>;
}): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const addEvent = (dateKey: string | null, event: CalendarEvent) => {
    if (!dateKey) return;
    const events = map.get(dateKey) || [];
    events.push(event);
    map.set(dateKey, events);
  };

  const allConcreteProjects: ProjectWithMilestonesDTO[] = [];
  const parentActiveMap = new Map<string, boolean>();
  for (const project of projects) {
    if (project.phases && project.phases.length > 0) {
      allConcreteProjects.push(...project.phases);
      parentActiveMap.set(project.id, project.phases.some(isCalendarProjectActive));
    } else {
      allConcreteProjects.push(project);
    }
  }

  const concreteProjectById = new Map<string, ProjectWithMilestonesDTO>();
  for (const project of allConcreteProjects) {
    concreteProjectById.set(project.id, project);
    if (!isCalendarProjectActive(project)) continue;

    const pausedOrder = getPausedScheduleOrder(project.milestones);

    for (const milestone of project.milestones) {
      if (milestone.status !== "IN_PROGRESS" && milestone.status !== "OVERDUE") continue;

      const isSubsequent = computeIsSubsequentToPaused(milestone, pausedOrder);
      if (isSubsequent) continue;
      if (milestone.assignedToId && hiddenStaffIds?.has(milestone.assignedToId)) continue;
      addEvent(toDateKey(milestone.plannedDueDate), { type: "MILESTONE", project, milestone });
    }
  }

  for (const task of tasks) {
    if (task.milestoneId) continue;
    if (task.isCompleted) continue;

    const linkedProject = concreteProjectById.get(task.projectId);
    if (linkedProject) {
      if (!isCalendarProjectActive(linkedProject)) continue;
    } else if (parentActiveMap.has(task.projectId) && !parentActiveMap.get(task.projectId)) {
      continue;
    }

    if (hiddenStaffIds?.has(task.assignedToId)) continue;
    addEvent(toDateKey(task.dueDatetime), { type: "TASK", task });
  }

  return map;
}
