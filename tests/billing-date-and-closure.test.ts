import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_PROJECT_COLUMNS,
  MILESTONE_STAGE_LABELS,
  isClosureStageCode,
  normalizeProjectColumns,
  resolveBillingInfoFromMilestones,
} from "@/lib/constants";
import {
  ScheduleEngine,
  computeIsSubsequentToPaused,
  getPausedScheduleOrder,
} from "@/lib/schedule-engine";
import type { ProjectMilestoneItem } from "@/lib/constants";
import { ConflictError } from "@/lib/errors";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { useManagerStore } from "@/stores/useManagerStore";

function makeMilestone(
  id: string,
  stageCode: ProjectMilestoneItem["stageCode"],
  stageOrder: number,
  status: ProjectMilestoneItem["status"],
  plannedDueDate: string | null = null,
  actualDueDate: string | null = null,
): ProjectMilestoneItem {
  return {
    id,
    projectId: "proj-billing-test",
    stageCode,
    phase: stageCode.startsWith("7-") ? "CLOSURE" : "INSTALL",
    stageOrder,
    status,
    plannedDueDate,
    actualDueDate,
    notes: null,
    attachments: null,
    assignedToId: "user-1",
    assignedToName: "測試人員",
  };
}

describe("立帳日期與第七階段【立帳/結案】全手動排程規範", () => {
  describe("isClosureStageCode 與 resolveBillingInfoFromMilestones", () => {
    it("正確識別 7-1 / 7-2 / 7-3 / 7-4 屬於第七階段【立帳/結案】", () => {
      expect(isClosureStageCode("7-1")).toBe(true);
      expect(isClosureStageCode("7-2")).toBe(true);
      expect(isClosureStageCode("7-3")).toBe(true);
      expect(isClosureStageCode("7-4")).toBe(true);
      expect(isClosureStageCode("6-5")).toBe(false);
      expect(isClosureStageCode("X-1")).toBe(false);
      expect(isClosureStageCode("X-2")).toBe(false);
    });

    it("7-2 未完成時採用預定立帳日（可空白），完成後同步為實際完成日，回退時還原", () => {
      expect(
        resolveBillingInfoFromMilestones([
          { stageCode: "7-2", status: "PENDING", plannedDueDate: null, actualDueDate: null },
        ]),
      ).toEqual({ billingDate: null, isBillingCompleted: false });

      expect(
        resolveBillingInfoFromMilestones([
          { stageCode: "7-2", status: "IN_PROGRESS", plannedDueDate: "2026-12-15", actualDueDate: null },
        ]),
      ).toEqual({ billingDate: "2026-12-15", isBillingCompleted: false });

      expect(
        resolveBillingInfoFromMilestones([
          {
            stageCode: "7-2",
            status: "COMPLETED",
            plannedDueDate: "2026-12-15",
            actualDueDate: "2026-12-22",
          },
        ]),
      ).toEqual({ billingDate: "2026-12-22", isBillingCompleted: true });

      expect(
        resolveBillingInfoFromMilestones([
          {
            stageCode: "7-2",
            status: "IN_PROGRESS",
            plannedDueDate: "2026-12-15",
            actualDueDate: null,
          },
        ]),
      ).toEqual({ billingDate: "2026-12-15", isBillingCompleted: false });
    });
  });

  describe("ScheduleEngine 對第七階段手動日期與暫停傳播之處理", () => {
    const fixedDate = new Date("2026-11-23T10:00:00+08:00");

    it("7-1 空白未設日期時，不觸發需追蹤連鎖暫停，亦不遮蔽手動設定的 7-2 立帳日期", () => {
      const m65 = makeMilestone("m65", "6-5", 25, "COMPLETED", "2026-11-20", "2026-11-20");
      const m71 = makeMilestone("m71", "7-1", 26, "IN_PROGRESS", null);
      const m72 = makeMilestone("m72", "7-2", 27, "PENDING", "2026-12-20");
      const m73 = makeMilestone("m73", "7-3", 28, "PENDING", null);

      const evaluated = ScheduleEngine.evaluateMilestones([m65, m71, m72, m73], fixedDate);
      const pausedOrder = getPausedScheduleOrder(evaluated.milestones);
      expect(pausedOrder).toBeNull();

      const res72 = evaluated.milestones.find((m) => m.id === "m72")!;
      expect(res72.isSubsequentToPaused).toBe(false);
      expect(computeIsSubsequentToPaused(res72, pausedOrder)).toBe(false);
      expect(res72.plannedDueDate).toBe("2026-12-20");

      const tl71 = ScheduleEngine.getTrafficLight(evaluated.milestones.find((m) => m.id === "m71")!, fixedDate);
      expect(tl71.label).toBe("需追蹤");
      expect(evaluated.isDelayed).toBe(false);
    });

    it("前置階段（如 2-1）需追蹤暫停時，不影響第七階段手動設定之 7-2 立帳日期", () => {
      const m21 = makeMilestone("m21", "2-1", 3, "IN_PROGRESS", null);
      const m22 = makeMilestone("m22", "2-2", 4, "PENDING", "2026-12-05");
      const m72 = makeMilestone("m72", "7-2", 27, "PENDING", "2026-12-28");

      const evaluated = ScheduleEngine.evaluateMilestones([m21, m22, m72], fixedDate);
      const res22 = evaluated.milestones.find((m) => m.id === "m22")!;
      const res72 = evaluated.milestones.find((m) => m.id === "m72")!;

      expect(res22.isSubsequentToPaused).toBe(true);
      expect(res72.isSubsequentToPaused).toBe(false);
    });

    it("第七階段仍維持循序推進，禁止未完成 7-1 直接完成 7-2", () => {
      const m71 = makeMilestone("m71", "7-1", 26, "IN_PROGRESS", null);
      const m72 = makeMilestone("m72", "7-2", 27, "PENDING", "2026-12-20");

      expect(() => ScheduleEngine.advanceMilestone([m71, m72], "m72")).toThrow(ConflictError);
    });
  });

  describe("預設欄位與列表雙日期互斥排序狀態", () => {
    beforeEach(() => {
      useWorkbenchStore.getState().resetFilters();
      useManagerStore.getState().resetFilters();
    });

    it("DEFAULT_PROJECT_COLUMNS 包含「立帳日期」且舊配置正規化時自動補齊於「預定進場」後方", () => {
      const billingCol = DEFAULT_PROJECT_COLUMNS.find((c) => c.key === "billingDate");
      expect(billingCol).toBeDefined();
      expect(billingCol?.label).toBe("立帳日期");
      expect(MILESTONE_STAGE_LABELS["7-2"]).toBe("立帳");

      const legacyCols = [
        { key: "trafficLight", label: "狀態燈號", visible: true, order: 0 },
        { key: "expectedDate", label: "預定進場", visible: true, order: 1 },
        { key: "actions", label: "操作", visible: true, order: 2 },
      ];
      const normalized = normalizeProjectColumns(legacyCols);
      const keys = normalized.map((c) => c.key);
      expect(keys.indexOf("billingDate")).toBe(keys.indexOf("expectedDate") + 1);
      expect(keys.indexOf("billingDate")).toBeLessThan(keys.indexOf("actions"));
    });

    it("useWorkbenchStore 與 useManagerStore 支援「預定進場」與「立帳日期」互斥切換排序與重置", () => {
      const wb = useWorkbenchStore.getState();
      wb.toggleDateSort("billingDate");
      expect(useWorkbenchStore.getState().dateSortField).toBe("billingDate");
      expect(useWorkbenchStore.getState().dateSort).toBe("ASC");

      wb.toggleDateSort("billingDate");
      expect(useWorkbenchStore.getState().dateSort).toBe("DESC");

      wb.toggleDateSort("expectedDate");
      expect(useWorkbenchStore.getState().dateSortField).toBe("expectedDate");
      expect(useWorkbenchStore.getState().dateSort).toBe("ASC");

      wb.resetFilters();
      expect(useWorkbenchStore.getState().dateSortField).toBe("expectedDate");
      expect(useWorkbenchStore.getState().dateSort).toBe("NONE");

      const mgr = useManagerStore.getState();
      mgr.toggleDateSort("billingDate");
      expect(useManagerStore.getState().dateSortField).toBe("billingDate");
      expect(useManagerStore.getState().dateSort).toBe("ASC");
      mgr.resetFilters();
      expect(useManagerStore.getState().dateSortField).toBe("expectedDate");
      expect(useManagerStore.getState().dateSort).toBe("NONE");
    });
  });
});
