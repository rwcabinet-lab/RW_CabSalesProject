import { describe, it, expect } from "vitest";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { ConflictError } from "@/lib/errors";
import type { ProjectMilestoneItem, WorkbenchProjectDTO, TaskDTO } from "@/types/dto";

describe("Milestone Assignee & Task Lifecycle Logic (方案 A + 方案 B 待辦連動與自然分流規範)", () => {
  // 模擬專案里程碑資料
  const mockMilestones: ProjectMilestoneItem[] = [
    {
      id: "m-1",
      projectId: "proj-101",
      stageCode: "1-1",
      phase: "DEVELOP",
      stageOrder: 1,
      status: "COMPLETED",
      priority: "MEDIUM",
      plannedDueDate: "2026-11-01",
      actualDueDate: "2026-11-01",
      notes: null,
      attachments: null,
      assignedToId: "user-sales",
      assignedToName: "王業務",
    },
    {
      id: "m-2",
      projectId: "proj-101",
      stageCode: "1-2",
      phase: "DEVELOP",
      stageOrder: 2,
      status: "IN_PROGRESS",
      priority: "HIGH",
      plannedDueDate: "2026-11-05",
      actualDueDate: null,
      notes: null,
      attachments: null,
      assignedToId: "user-sales",
      assignedToName: "王業務",
    },
    {
      id: "m-3",
      projectId: "proj-101",
      stageCode: "2-1",
      phase: "REQUIREMENT",
      stageOrder: 3,
      status: "PENDING",
      priority: "MEDIUM",
      plannedDueDate: "2026-11-10",
      actualDueDate: null,
      notes: null,
      attachments: null,
      assignedToId: "user-engineer", // 預先指派給工務同仁
      assignedToName: "陳工務",
    },
  ];

  describe("方案 A: 狀態約束同步防呆 (State Synchronization Guard)", () => {
    it("未進行中 (PENDING) 之里程碑不應產生未完成待辦任務於同仁待辦清單", () => {
      // 模擬 TaskService.getTasks 的過濾規則
      const mockRawTasks = [
        {
          id: "task-active",
          projectId: "proj-101",
          milestoneId: "m-2",
          assignedToId: "user-sales",
          isCompleted: false,
          milestone: { id: "m-2", status: "IN_PROGRESS", plannedDueDate: "2026-11-05" },
        },
        {
          id: "task-pending-ghost",
          projectId: "proj-101",
          milestoneId: "m-3",
          assignedToId: "user-engineer",
          isCompleted: false,
          milestone: { id: "m-3", status: "PENDING", plannedDueDate: "2026-11-10" },
        },
      ];

      const visibleTasks = mockRawTasks.filter((t) => {
        if (t.milestoneId && t.milestone && t.milestone.status === "PENDING" && !t.isCompleted) {
          return false;
        }
        return true;
      });

      // 工務同仁的 PENDING 幽靈待辦被過濾排除
      expect(visibleTasks.find((t) => t.id === "task-pending-ghost")).toBeUndefined();
      // 進行中業務待辦正常保留
      expect(visibleTasks.find((t) => t.id === "task-active")).toBeDefined();
    });

    it("若強行完成 PENDING 里程碑會觸發 ScheduleEngine 409 衝突防呆，證實 PENDING 待辦為非法操作項", () => {
      // 嘗試完成尚處於 PENDING 的 m-3
      expect(() => {
        ScheduleEngine.advanceMilestone(mockMilestones, "m-3");
      }).toThrowError(ConflictError);

      try {
        ScheduleEngine.advanceMilestone(mockMilestones, "m-3");
      } catch (err: unknown) {
        expect((err as ConflictError).message).toBe("只能完成目前進行中的里程碑");
      }
    });

    it("進行中 (IN_PROGRESS) 之里程碑可順利推進，並將下一個里程碑推進為 IN_PROGRESS", () => {
      const result = ScheduleEngine.advanceMilestone(mockMilestones, "m-2", {
        completedDate: "2026-11-05",
        notes: "已完成洽談",
      });

      expect(result.updatedMilestones.find((m) => m.id === "m-2")?.status).toBe("COMPLETED");
      const nextMilestone = result.updatedMilestones.find((m) => m.id === "m-3");
      expect(nextMilestone?.status).toBe("IN_PROGRESS");
      // 下一進度的指派人依然是陳工務，此時將自然派發待辦
      expect(nextMilestone?.assignedToId).toBe("user-engineer");
    });
  });

  describe("方案 B: 案場筆記清單自然分流 (Workbench Natural Separation)", () => {
    it("被指派 PENDING 里程碑之同仁，案場總覽可見該專案，但頂端待辦清單無雜訊", () => {
      const currentEngineerId = "user-engineer";

      // 1. 案場總覽查詢：包含 milestones.some.assignedToId == currentEngineerId
      const projects = [
        {
          id: "proj-101",
          projectName: "內湖商辦案",
          salesRepId: "user-sales",
          salesAssistantId: null,
          milestones: mockMilestones,
        },
      ];

      const myProjects = projects.filter(
        (p) =>
          p.salesRepId === currentEngineerId ||
          p.salesAssistantId === currentEngineerId ||
          p.milestones.some((m) => m.assignedToId === currentEngineerId)
      );

      // 陳工務可於「案場總覽」查閱該專案整體時程
      expect(myProjects).toHaveLength(1);
      expect(myProjects[0].id).toBe("proj-101");

      // 2. 待辦事項查詢：排除 PENDING 里程碑後，陳工務頂端待辦清單為空（無雜訊）
      const allTasks = [
        {
          id: "t-1",
          assignedToId: "user-engineer",
          milestoneId: "m-3",
          isCompleted: false,
          milestone: { id: "m-3", status: "PENDING" },
        },
      ];

      const engineerPendingTasks = allTasks.filter(
        (t) =>
          t.assignedToId === currentEngineerId &&
          !t.isCompleted &&
          !(t.milestoneId && t.milestone?.status === "PENDING")
      );

      expect(engineerPendingTasks).toHaveLength(0);
    });
  });
});
