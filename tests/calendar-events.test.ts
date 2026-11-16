import { describe, it, expect } from "vitest";
import { buildCalendarEventsByDate } from "@/components/views/calendar-events";
import type { MilestoneDTO, ProjectWithMilestonesDTO, TaskDTO } from "@/types/dto";

function makeMilestone(overrides: Partial<MilestoneDTO> = {}): MilestoneDTO {
  return {
    id: "m-1",
    projectId: "p-1",
    phase: "DEVELOP",
    stageCode: "1-2",
    stageName: "案件分配",
    stageOrder: 2,
    plannedDueDate: "2026-11-05T00:00:00.000Z",
    actualDueDate: null,
    status: "IN_PROGRESS",
    assignedToId: "u-1",
    assignedToName: "業務A",
    priority: "MEDIUM",
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectWithMilestonesDTO> = {}): ProjectWithMilestonesDTO {
  return {
    id: "p-1",
    projectName: "柯乃心(展覽)",
    customerId: "c-1",
    customerName: "測試客戶",
    customerType: "B2C",
    defaultDiscount: 1,
    siteAddress: "台北市信義區",
    salesRepId: "u-1",
    salesRepName: "業務A",
    currentStage: "DEVELOP",
    isDelayed: false,
    milestones: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id: "t-1",
    projectId: "p-1",
    projectName: "柯乃心(展覽)",
    assignedToId: "u-1",
    assignedToName: "業務A",
    milestoneId: null,
    taskType: "SITE_VISIT",
    subject: "現場初勘補拍",
    dueDatetime: "2026-11-05T00:00:00.000Z",
    priority: "MEDIUM",
    isCompleted: false,
    ...overrides,
  };
}

describe("buildCalendarEventsByDate (行事曆事件過濾邏輯)", () => {
  it("不重複顯示里程碑關聯待辦，且僅顯示進行中（IN_PROGRESS / OVERDUE）里程碑與未完成獨立待辦", () => {
    const project = makeProject({
      milestones: [
        makeMilestone({ id: "m-done", stageCode: "1-1", stageName: "客戶接洽", stageOrder: 1, status: "COMPLETED", plannedDueDate: "2026-11-03" }),
        makeMilestone({ id: "m-active", stageCode: "1-2", stageName: "案件分配", stageOrder: 2, status: "IN_PROGRESS", plannedDueDate: "2026-11-05" }),
        makeMilestone({ id: "m-overdue", stageCode: "2-1", stageName: "初步場勘", stageOrder: 3, status: "OVERDUE", plannedDueDate: "2026-11-04" }),
        makeMilestone({ id: "m-pending", stageCode: "2-2", stageName: "圖面繪製", stageOrder: 4, status: "PENDING", plannedDueDate: "2026-11-10" }),
      ],
    });

    const tasks: TaskDTO[] = [
      // 關聯里程碑之進行中待辦 -> 應排除（避免重複顯示）
      makeTask({ id: "t-ms-active", milestoneId: "m-active", subject: "案件分配", isCompleted: false, dueDatetime: "2026-11-05" }),
      // 關聯里程碑之已完成待辦 -> 應排除
      makeTask({ id: "t-ms-done", milestoneId: "m-done", subject: "客戶接洽", isCompleted: true, dueDatetime: "2026-11-03" }),
      // 獨立未完成待辦 -> 應保留
      makeTask({ id: "t-manual-active", milestoneId: null, subject: "與業主確認色板", isCompleted: false, dueDatetime: "2026-11-05" }),
      // 獨立已完成待辦 -> 應排除
      makeTask({ id: "t-manual-done", milestoneId: null, subject: "寄出型錄", isCompleted: true, dueDatetime: "2026-11-06" }),
    ];

    const map = buildCalendarEventsByDate({ projects: [project], tasks });

    expect(map.get("2026-11-03")).toBeUndefined();
    expect(map.get("2026-11-06")).toBeUndefined();
    expect(map.get("2026-11-10")).toBeUndefined();

    const nov04 = map.get("2026-11-04") || [];
    expect(nov04).toHaveLength(1);
    expect(nov04[0]).toMatchObject({ type: "MILESTONE", milestone: { id: "m-overdue" } });

    const nov05 = map.get("2026-11-05") || [];
    expect(nov05).toHaveLength(2);
    expect(nov05.map((e) => (e.type === "MILESTONE" ? `M:${e.milestone.id}` : `T:${e.task.id}`))).toEqual([
      "M:m-active",
      "T:t-manual-active",
    ]);
  });

  it("自動排除流標 (LOST) 與已結案 (BILLED / 7-2 COMPLETED) 案場之里程碑與待辦", () => {
    const lostProject = makeProject({
      id: "p-lost",
      currentStage: "LOST",
      milestones: [
        makeMilestone({ id: "m-lost", projectId: "p-lost", status: "IN_PROGRESS", plannedDueDate: "2026-11-07" }),
      ],
    });
    const closedProject = makeProject({
      id: "p-closed",
      currentStage: "CLOSURE",
      milestones: [
        makeMilestone({ id: "m-72", projectId: "p-closed", stageCode: "7-2", stageName: "立帳", stageOrder: 27, status: "COMPLETED", plannedDueDate: "2026-11-02" }),
        makeMilestone({ id: "m-73", projectId: "p-closed", stageCode: "7-3", stageName: "結案", stageOrder: 28, status: "IN_PROGRESS", plannedDueDate: "2026-11-07" }),
      ],
    });

    const tasks: TaskDTO[] = [
      makeTask({ id: "t-lost", projectId: "p-lost", milestoneId: null, isCompleted: false, dueDatetime: "2026-11-07" }),
      makeTask({ id: "t-closed", projectId: "p-closed", milestoneId: null, isCompleted: false, dueDatetime: "2026-11-07" }),
    ];

    const map = buildCalendarEventsByDate({
      projects: [lostProject, closedProject],
      tasks,
    });

    expect(map.size).toBe(0);
  });

  it("支援分期案場 (phases) 展開且遵循人員行程隱藏過濾", () => {
    const parent = makeProject({
      id: "p-parent",
      phases: [
        makeProject({
          id: "p-phase-1",
          parentId: "p-parent",
          phaseNumber: 1,
          phaseName: "第 1 期",
          milestones: [
            makeMilestone({ id: "m-ph1", projectId: "p-phase-1", status: "IN_PROGRESS", assignedToId: "u-1", plannedDueDate: "2026-11-08" }),
          ],
        }),
        makeProject({
          id: "p-phase-2",
          parentId: "p-parent",
          phaseNumber: 2,
          phaseName: "第 2 期",
          milestones: [
            makeMilestone({ id: "m-ph2", projectId: "p-phase-2", status: "IN_PROGRESS", assignedToId: "u-2", plannedDueDate: "2026-11-08" }),
          ],
        }),
      ],
    });

    const tasks: TaskDTO[] = [
      makeTask({ id: "t-u1", projectId: "p-phase-1", assignedToId: "u-1", dueDatetime: "2026-11-08" }),
      makeTask({ id: "t-u2", projectId: "p-phase-2", assignedToId: "u-2", dueDatetime: "2026-11-08" }),
    ];

    const hidden = new Set(["u-2"]);
    const map = buildCalendarEventsByDate({ projects: [parent], tasks, hiddenStaffIds: hidden });

    const nov08 = map.get("2026-11-08") || [];
    expect(nov08.map((e) => (e.type === "MILESTONE" ? `M:${e.milestone.id}` : `T:${e.task.id}`))).toEqual([
      "M:m-ph1",
      "T:t-u1",
    ]);
  });
});
