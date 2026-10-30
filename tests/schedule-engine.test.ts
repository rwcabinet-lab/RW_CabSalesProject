import { describe, it, expect } from "vitest";
import {
  ScheduleEngine,
  getTaiwanDateString,
  STAGE_CODE_TO_PROJECT_STAGE,
} from "@/lib/schedule-engine";
import { ProjectMilestoneItem } from "@/lib/constants";
import { ConflictError } from "@/lib/errors";

function createMockMilestone(
  id: string,
  stageCode: any,
  stageOrder: number,
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE",
  plannedDueDate: string | null = null,
  actualDueDate: string | null = null
): ProjectMilestoneItem {
  return {
    id,
    projectId: "proj-test",
    stageCode,
    stageOrder,
    status,
    plannedDueDate,
    actualDueDate,
    notes: null,
    attachments: null,
    assignedToId: "user-1",
    assignedTo: { id: "user-1", name: "王業務", role: "SALES" },
  };
}

describe("ScheduleEngine (核心時程與燈號評估引擎)", () => {
  describe("getTaiwanDateString (台灣 UTC+8 時區換日計算)", () => {
    it("正確將 UTC 時間轉換為 Asia/Taipei 之 YYYY-MM-DD", () => {
      // UTC 2026-10-30 00:00:00 -> 台灣時間 2026-10-30 08:00:00
      const utcMorning = new Date("2026-10-30T00:00:00Z");
      expect(getTaiwanDateString(utcMorning)).toBe("2026-10-30");

      // UTC 2026-10-29 20:00:00 -> 台灣時間 2026-10-30 04:00:00 (跨日換算)
      const utcPrevDayNight = new Date("2026-10-29T20:00:00Z");
      expect(getTaiwanDateString(utcPrevDayNight)).toBe("2026-10-30");
    });
  });

  describe("getTrafficLight (四色時程燈號評估)", () => {
    const fixedCurrentDate = new Date("2026-10-30T10:00:00+08:00");

    it("逾期應顯示紅燈 (RED) 並計算逾期天數", () => {
      const milestone = createMockMilestone(
        "m-1",
        "2-1",
        1,
        "IN_PROGRESS",
        "2026-10-25"
      );
      const light = ScheduleEngine.getTrafficLight(milestone, fixedCurrentDate);
      expect(light.color).toBe("RED");
      expect(light.daysDiff).toBe(-5);
      expect(light.label).toBe("逾期 5 天");
    });

    it("當天到期應顯示紅燈 (RED) 並標記已到期", () => {
      const milestone = createMockMilestone(
        "m-2",
        "2-1",
        1,
        "IN_PROGRESS",
        "2026-10-30"
      );
      const light = ScheduleEngine.getTrafficLight(milestone, fixedCurrentDate);
      expect(light.color).toBe("RED");
      expect(light.daysDiff).toBe(0);
      expect(light.label).toBe("已到期");
    });

    it("剩餘 1 ~ 3 天內到期應顯示黃燈 (YELLOW)", () => {
      const m1 = createMockMilestone("m-3", "2-1", 1, "IN_PROGRESS", "2026-10-31");
      const light1 = ScheduleEngine.getTrafficLight(m1, fixedCurrentDate);
      expect(light1.color).toBe("YELLOW");
      expect(light1.daysDiff).toBe(1);
      expect(light1.label).toBe("剩 1 天");

      const m3 = createMockMilestone("m-4", "2-1", 1, "IN_PROGRESS", "2026-11-02");
      const light3 = ScheduleEngine.getTrafficLight(m3, fixedCurrentDate);
      expect(light3.color).toBe("YELLOW");
      expect(light3.daysDiff).toBe(3);
      expect(light3.label).toBe("剩 3 天");
    });

    it("剩餘 4 天以上應顯示綠燈 (GREEN)", () => {
      const milestone = createMockMilestone(
        "m-5",
        "2-1",
        1,
        "IN_PROGRESS",
        "2026-11-05"
      );
      const light = ScheduleEngine.getTrafficLight(milestone, fixedCurrentDate);
      expect(light.color).toBe("GREEN");
      expect(light.daysDiff).toBe(6);
      expect(light.label).toBe("剩 6 天");
    });

    it("已完成里程碑應顯示灰燈 (GRAY) 並標記已完成", () => {
      const milestone = createMockMilestone(
        "m-6",
        "2-1",
        1,
        "COMPLETED",
        "2026-10-20"
      );
      const light = ScheduleEngine.getTrafficLight(milestone, fixedCurrentDate);
      expect(light.color).toBe("GRAY");
      expect(light.daysDiff).toBe(0);
      expect(light.label).toBe("已完成");
    });

    it("流標案件或 X-2 里程碑應顯示灰燈 (GRAY) 並標記流標", () => {
      const milestone = createMockMilestone("m-7", "X-2", 99, "IN_PROGRESS", null);
      const light = ScheduleEngine.getTrafficLight(milestone, fixedCurrentDate, true);
      expect(light.color).toBe("GRAY");
      expect(light.label).toBe("流標");
    });

    it("進行中但無預定到期日應標示為暫緩", () => {
      const milestone = createMockMilestone("m-8", "2-1", 1, "IN_PROGRESS", null);
      const light = ScheduleEngine.getTrafficLight(milestone, fixedCurrentDate);
      expect(light.color).toBe("GRAY");
      expect(light.label).toBe("暫緩");
    });
  });

  describe("isProjectClosed (專案結案狀態判定)", () => {
    it("當專案 currentStage 為 BILLED, CLOSED, DONE 時視為已結案", () => {
      expect(ScheduleEngine.isProjectClosed({ currentStage: "BILLED" })).toBe(true);
      expect(ScheduleEngine.isProjectClosed({ currentStage: "CLOSED" })).toBe(true);
      expect(ScheduleEngine.isProjectClosed({ currentStage: "DONE" })).toBe(true);
    });

    it("當 7-2 (請款) 里程碑已完成時應視為已結案", () => {
      const milestones = [
        createMockMilestone("m-72", "7-2", 10, "COMPLETED", "2026-10-15"),
      ];
      expect(
        ScheduleEngine.isProjectClosed({ currentStage: "INSTALL" }, milestones)
      ).toBe(true);
    });

    it("未完成請款之進行中案場應判定為未結案", () => {
      const milestones = [
        createMockMilestone("m-72", "7-2", 10, "IN_PROGRESS", "2026-11-15"),
      ];
      expect(
        ScheduleEngine.isProjectClosed({ currentStage: "PROPOSAL" }, milestones)
      ).toBe(false);
    });
  });

  describe("isProjectDelayed (專案逾期卡關整體評估)", () => {
    const fixedDate = new Date("2026-10-30T10:00:00+08:00");

    it("已結案或已流標專案一律免除逾期警示", () => {
      const milestones = [
        createMockMilestone("m-overdue", "2-1", 1, "OVERDUE", "2026-10-01"),
      ];
      expect(
        ScheduleEngine.isProjectDelayed(
          { currentStage: "LOST", isDelayed: true },
          milestones,
          fixedDate
        )
      ).toBe(false);
      expect(
        ScheduleEngine.isProjectDelayed(
          { currentStage: "BILLED", isDelayed: true },
          milestones,
          fixedDate
        )
      ).toBe(false);
    });

    it("當活躍里程碑逾期時應判定專案逾期 (isDelayed = true)", () => {
      const milestones = [
        createMockMilestone("m-1", "2-1", 1, "COMPLETED", "2026-10-10"),
        createMockMilestone("m-2", "2-2", 2, "IN_PROGRESS", "2026-10-25"), // 逾期 5 天
      ];
      expect(
        ScheduleEngine.isProjectDelayed(
          { currentStage: "REQUIREMENT" },
          milestones,
          fixedDate
        )
      ).toBe(true);
    });

    it("當活躍里程碑未逾期時應判定正常 (isDelayed = false)", () => {
      const milestones = [
        createMockMilestone("m-1", "2-1", 1, "IN_PROGRESS", "2026-11-10"),
      ];
      expect(
        ScheduleEngine.isProjectDelayed(
          { currentStage: "REQUIREMENT" },
          milestones,
          fixedDate
        )
      ).toBe(false);
    });
  });

  describe("evaluateMilestones (整份里程碑狀態刷新與逾期洗淨)", () => {
    const fixedDate = new Date("2026-10-30T10:00:00+08:00");

    it("自動將到期日早於今日之未完成進度標記為 OVERDUE", () => {
      const milestones = [
        createMockMilestone("m-1", "1-1", 1, "IN_PROGRESS", "2026-10-20"),
        createMockMilestone("m-2", "1-2", 2, "PENDING", "2026-11-05"),
      ];
      const result = ScheduleEngine.evaluateMilestones(milestones, fixedDate);
      expect(result.isDelayed).toBe(true);
      expect(result.milestones[0].status).toBe("OVERDUE");
      expect(result.milestones[1].status).toBe("PENDING");
    });

    it("流標專案自動洗淨逾期狀態，不留誤報紅燈", () => {
      const milestones = [
        createMockMilestone("m-1", "1-1", 1, "OVERDUE", "2026-10-10"),
        createMockMilestone("m-lost", "X-2", 99, "COMPLETED", "2026-10-15"),
      ];
      const result = ScheduleEngine.evaluateMilestones(milestones, fixedDate, true);
      expect(result.isDelayed).toBe(false);
      expect(result.milestones[0].status).toBe("IN_PROGRESS");
    });
  });

  describe("advanceMilestone (里程碑狀態機推進與大階段聯動)", () => {
    it("正常依序完成進行中進度，並自動啟動下一進度", () => {
      const m1 = createMockMilestone("m-1", "1-1", 1, "IN_PROGRESS");
      const m2 = createMockMilestone("m-2", "1-2", 2, "PENDING");
      const m3 = createMockMilestone("m-3", "2-1", 3, "PENDING");

      const result = ScheduleEngine.advanceMilestone([m1, m2, m3], "m-1", {
        completedDate: "2026-10-30",
        notes: "初步聯繫成功",
      });

      expect(result.updatedMilestones[0].status).toBe("COMPLETED");
      expect(result.updatedMilestones[0].actualDueDate).toBe("2026-10-30");
      expect(result.updatedMilestones[0].notes).toBe("初步聯繫成功");

      // 下一步自動啟動
      expect(result.updatedMilestones[1].status).toBe("IN_PROGRESS");
      expect(result.updatedMilestones[2].status).toBe("PENDING");
      expect(result.newCurrentStage).toBe(STAGE_CODE_TO_PROJECT_STAGE["1-2"]);
    });

    it("企圖跳級完成後續進度時，應拋出 ConflictError 拒絕操作", () => {
      const m1 = createMockMilestone("m-1", "1-1", 1, "IN_PROGRESS");
      const m2 = createMockMilestone("m-2", "1-2", 2, "PENDING");

      expect(() =>
        ScheduleEngine.advanceMilestone([m1, m2], "m-2")
      ).toThrow(ConflictError);
    });

    it("最後一個進度完成時，專案大階段自動轉為 DONE", () => {
      const mFinal = createMockMilestone("m-final", "7-4", 10, "IN_PROGRESS");
      const result = ScheduleEngine.advanceMilestone([mFinal], "m-final");
      expect(result.updatedMilestones[0].status).toBe("COMPLETED");
      expect(result.newCurrentStage).toBe("DONE");
    });
  });
});
