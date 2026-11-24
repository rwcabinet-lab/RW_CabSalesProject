import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MilestoneStatus, TaskPriority } from "@prisma/client";
import {
  ScheduleEngine,
  getPausedScheduleOrders,
  computeIsSubsequentToPaused,
} from "@/lib/schedule-engine";
import {
  STANDARD_MILESTONE_STAGE_CODES,
  STAGE_CODE_TO_PHASE,
  isInstallStageCode,
  isJumpableStageCode,
  isMilestoneSkipped,
  isPreInstallStageCode,
} from "@/lib/constants";
import type { ProjectMilestoneItem } from "@/lib/constants";
import { BadRequestError, ConflictError } from "@/lib/errors";

const { mockTx, mockGetUserFromRequest, mockGetRolePages } = vi.hoisted(() => ({
  mockTx: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectMilestone: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    salesTask: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockGetUserFromRequest: vi.fn(),
  mockGetRolePages: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConfig: {
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectMilestone: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    salesTask: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => {
      if (typeof callback === "function") {
        return callback(mockTx);
      }
      return Promise.resolve(callback);
    }),
  },
}));

vi.mock("@/lib/access-control", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/access-control")>();
  return {
    ...actual,
    getUserFromRequest: mockGetUserFromRequest,
    getRolePages: mockGetRolePages,
  };
});

import { prisma } from "@/lib/prisma";
import { MilestoneService } from "@/lib/services/milestone-service";
import { PUT as putProjectMilestones } from "@/app/api/projects/[id]/milestones/route";

function buildFullMilestones(overrides: Partial<Record<string, Partial<ProjectMilestoneItem>>> = {}): ProjectMilestoneItem[] {
  return STANDARD_MILESTONE_STAGE_CODES.map((code, idx) => {
    const base: ProjectMilestoneItem = {
      id: `m-${code}`,
      projectId: "proj-jump-1",
      stageCode: code,
      phase: STAGE_CODE_TO_PHASE[code],
      stageOrder: idx + 1,
      status: idx === 0 ? "IN_PROGRESS" : "PENDING",
      priority: "MEDIUM",
      plannedDueDate: isPreInstallStageCode(code) ? "2026-11-10" : null,
      actualDueDate: null,
      notes: null,
      attachments: null,
      assignedToId: "user-rep",
      assignedToName: "王業務",
    };
    return { ...base, ...(overrides[code] || {}) };
  });
}

describe("一鍵跳轉、單項略過與進場日獨立時程機制", () => {
  const fixedToday = new Date("2026-11-24T10:00:00+08:00");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.project.update).mockResolvedValue({} as any);
    mockTx.$queryRaw.mockResolvedValue([{ id: "proj-jump-1" }]);
    mockTx.project.findUnique.mockResolvedValue({ salesRepId: "user-rep" });
    mockTx.project.update.mockResolvedValue({});
    mockTx.projectMilestone.update.mockResolvedValue({});
    mockTx.projectMilestone.updateMany.mockResolvedValue({ count: 1 });
    mockTx.salesTask.upsert.mockResolvedValue({});
    mockTx.salesTask.updateMany.mockResolvedValue({ count: 1 });
    mockTx.salesTask.deleteMany.mockResolvedValue({ count: 1 });
    mockGetRolePages.mockResolvedValue(["workbench", "projects", "milestone_reorder"]);
  });

  describe("1. 進場日與前段時程分區獨立 (ScheduleEngine)", () => {
    it("前段 (1-1~5-2) 設為需追蹤時，不遮蔽已手動設定的 6-1 進場日與 6-2~6-5 排程", () => {
      const list = buildFullMilestones({
        "1-1": { status: "IN_PROGRESS", plannedDueDate: null },
        "1-2": { status: "PENDING", plannedDueDate: "2026-12-01" },
        "6-1": { status: "PENDING", plannedDueDate: "2026-12-20" },
        "6-2": { status: "PENDING", plannedDueDate: "2026-12-23" },
        "6-3": { status: "PENDING", plannedDueDate: "2026-12-25" },
        "6-4": { status: "PENDING", plannedDueDate: "2026-12-27" },
        "6-5": { status: "PENDING", plannedDueDate: "2026-12-29" },
      });

      const evaluated = ScheduleEngine.evaluateMilestones(list, fixedToday);
      const orders = getPausedScheduleOrders(evaluated.milestones);
      expect(orders.preInstallPausedOrder).toBe(1);
      expect(orders.installPausedOrder).toBeNull();

      const m12 = evaluated.milestones.find((m) => m.stageCode === "1-2")!;
      const m61 = evaluated.milestones.find((m) => m.stageCode === "6-1")!;
      const m62 = evaluated.milestones.find((m) => m.stageCode === "6-2")!;

      expect(m12.isSubsequentToPaused).toBe(true);
      expect(m61.isSubsequentToPaused).toBe(false);
      expect(m62.isSubsequentToPaused).toBe(false);
      expect(computeIsSubsequentToPaused(m61, orders)).toBe(false);
    });

    it("6-1 空白未填進場日時，6-1 為需追蹤且 6-2~6-5 暫停，但不影響前段與第七階段", () => {
      const list = buildFullMilestones({
        "1-1": { status: "IN_PROGRESS", plannedDueDate: "2026-11-30" },
        "6-1": { status: "PENDING", plannedDueDate: null },
        "6-2": { status: "PENDING", plannedDueDate: null },
        "7-2": { status: "PENDING", plannedDueDate: "2027-01-15" },
      });

      const evaluated = ScheduleEngine.evaluateMilestones(list, fixedToday);
      const m11 = evaluated.milestones.find((m) => m.stageCode === "1-1")!;
      const m61 = evaluated.milestones.find((m) => m.stageCode === "6-1")!;
      const m62 = evaluated.milestones.find((m) => m.stageCode === "6-2")!;
      const m72 = evaluated.milestones.find((m) => m.stageCode === "7-2")!;

      expect(m11.isSubsequentToPaused).toBe(false);
      expect(ScheduleEngine.getTrafficLight(m61, fixedToday).label).toBe("需追蹤");
      expect(m62.isSubsequentToPaused).toBe(true);
      expect(m72.isSubsequentToPaused).toBe(false);
    });

    it("正常完成 4-3 派工設定進場日時，同步更新 6-1 並往後推算 6-2~6-5", () => {
      const list = buildFullMilestones();
      for (const m of list) {
        if (m.stageOrder < 16) {
          m.status = "COMPLETED";
          m.actualDueDate = "2026-11-20";
        } else if (m.stageCode === "4-3") {
          m.status = "IN_PROGRESS";
        }
      }

      const res = ScheduleEngine.advanceMilestone(list, "m-4-3", {
        installationDate: "2026-12-10",
        currentDate: fixedToday,
      });

      expect(res.updatedMilestones.find((m) => m.stageCode === "6-1")?.plannedDueDate).toBe("2026-12-10");
      expect(res.updatedMilestones.find((m) => m.stageCode === "6-2")?.plannedDueDate).toBe("2026-12-13");
      expect(res.updatedMilestones.find((m) => m.stageCode === "6-3")?.plannedDueDate).toBe("2026-12-15");
      expect(res.updatedMilestones.find((m) => m.stageCode === "6-4")?.plannedDueDate).toBe("2026-12-17");
      expect(res.updatedMilestones.find((m) => m.stageCode === "6-5")?.plannedDueDate).toBe("2026-12-19");
    });
  });

  describe("2. 單項「此項略過」(advanceMilestone with skip: true)", () => {
    it("略過單一項目時，實際完成日留空、備註標示【已略過】，且不影響手動 6-1 與 7-2", () => {
      const list = buildFullMilestones({
        "6-1": { plannedDueDate: "2026-12-25" },
        "7-2": { plannedDueDate: "2027-01-20" },
      });

      const res = ScheduleEngine.advanceMilestone(list, "m-1-1", {
        skip: true,
        notes: "客戶自備來源",
        currentDate: fixedToday,
      });

      const m11 = res.updatedMilestones.find((m) => m.stageCode === "1-1")!;
      const m12 = res.updatedMilestones.find((m) => m.stageCode === "1-2")!;
      const m61 = res.updatedMilestones.find((m) => m.stageCode === "6-1")!;
      const m72 = res.updatedMilestones.find((m) => m.stageCode === "7-2")!;

      expect(m11.status).toBe("COMPLETED");
      expect(m11.actualDueDate).toBeNull();
      expect(m11.notes).toBe("【已略過】客戶自備來源");
      expect(isMilestoneSkipped(m11)).toBe(true);
      expect(m12.status).toBe("IN_PROGRESS");
      // 1-2 自今日 2026-11-24 + 2天 = 2026-11-26
      expect(m12.plannedDueDate).toBe("2026-11-26");
      expect(m61.plannedDueDate).toBe("2026-12-25");
      expect(m72.plannedDueDate).toBe("2027-01-20");
    });

    it("略過 4-3 派工時免填進場日期，保留 6-1 空白", () => {
      const list = buildFullMilestones();
      for (const m of list) {
        if (m.stageOrder < 16) m.status = "COMPLETED";
        else if (m.stageCode === "4-3") m.status = "IN_PROGRESS";
      }

      const res = ScheduleEngine.advanceMilestone(list, "m-4-3", {
        skip: true,
        currentDate: fixedToday,
      });

      const m43 = res.updatedMilestones.find((m) => m.stageCode === "4-3")!;
      const m61 = res.updatedMilestones.find((m) => m.stageCode === "6-1")!;
      expect(m43.status).toBe("COMPLETED");
      expect(m43.actualDueDate).toBeNull();
      expect(m43.notes).toBe("【已略過】");
      expect(m61.plannedDueDate).toBeNull();
    });

    it("禁止略過第七階段 (7-1~7-3) 項目", () => {
      const list = buildFullMilestones();
      for (const m of list) {
        if (m.stageOrder < 26) m.status = "COMPLETED";
        else if (m.stageCode === "7-1") m.status = "IN_PROGRESS";
      }

      expect(() =>
        ScheduleEngine.advanceMilestone(list, "m-7-1", { skip: true, currentDate: fixedToday }),
      ).toThrow(BadRequestError);
    });
  });

  describe("3. 一鍵跳轉 (jumpToMilestone)", () => {
    it("預設「以上略過」跳轉至 5-1 生產：跨過審核與派工、實際完成日留空，重算 5-1~5-2 且不動 6-1 與 7-2", () => {
      const list = buildFullMilestones({
        "6-1": { plannedDueDate: "2026-12-30" },
        "7-2": { plannedDueDate: "2027-01-25" },
      });

      const res = ScheduleEngine.jumpToMilestone(list, "m-5-1", {
        skip: true,
        currentDate: fixedToday,
      });

      expect(res.newCurrentStage).toBe("PROD_SHIP");
      expect(res.jumpedCount).toBe(18); // 1-1 ~ 4-5 共 18 項

      const m31 = res.updatedMilestones.find((m) => m.stageCode === "3-1")!;
      const m43 = res.updatedMilestones.find((m) => m.stageCode === "4-3")!;
      const m51 = res.updatedMilestones.find((m) => m.stageCode === "5-1")!;
      const m52 = res.updatedMilestones.find((m) => m.stageCode === "5-2")!;
      const m61 = res.updatedMilestones.find((m) => m.stageCode === "6-1")!;
      const m72 = res.updatedMilestones.find((m) => m.stageCode === "7-2")!;

      expect(m31.status).toBe("COMPLETED");
      expect(m31.actualDueDate).toBeNull();
      expect(m31.notes).toBe("【已略過：一鍵跳轉】");
      expect(m43.status).toBe("COMPLETED");
      expect(m43.actualDueDate).toBeNull();

      expect(m51.status).toBe("IN_PROGRESS");
      expect(m51.plannedDueDate).toBe("2026-12-06"); // 2026-11-24 + 12天
      expect(m52.plannedDueDate).toBe("2026-12-07"); // + 1天
      expect(m61.plannedDueDate).toBe("2026-12-30"); // 保留手動進場日
      expect(m72.plannedDueDate).toBe("2027-01-25"); // 保留手動立帳日
    });

    it("取消勾選「以上略過」(skip: false) 跳轉時，寫入實際完成日與【一鍵跳轉完成】備註", () => {
      const list = buildFullMilestones();
      const res = ScheduleEngine.jumpToMilestone(list, "m-2-1", {
        skip: false,
        completedDate: "2026-11-22",
        notes: "舊案補登",
        currentDate: fixedToday,
      });

      const m11 = res.updatedMilestones.find((m) => m.stageCode === "1-1")!;
      expect(m11.status).toBe("COMPLETED");
      expect(m11.actualDueDate).toBe("2026-11-22");
      expect(m11.notes).toBe("【一鍵跳轉完成】舊案補登");
      expect(isMilestoneSkipped(m11)).toBe(false);
    });

    it("跨過 4-3 且未填進場日時，跳轉至 6-5 提交成果驗收維持進場日空白並顯示需追蹤", () => {
      const list = buildFullMilestones();
      const res = ScheduleEngine.jumpToMilestone(list, "m-6-5", {
        skip: true,
        currentDate: fixedToday,
      });

      const m61 = res.updatedMilestones.find((m) => m.stageCode === "6-1")!;
      const m65 = res.updatedMilestones.find((m) => m.stageCode === "6-5")!;
      expect(m61.status).toBe("COMPLETED");
      expect(m61.plannedDueDate).toBeNull();
      expect(m65.status).toBe("IN_PROGRESS");
      expect(m65.plannedDueDate).toBeNull();
      expect(ScheduleEngine.getTrafficLight(m65, fixedToday).label).toBe("需追蹤");
    });

    it("最多只能跳轉至 6-5，企圖跳轉至 7-1/7-2/7-3 應拋出 BadRequestError", () => {
      const list = buildFullMilestones();
      expect(isJumpableStageCode("6-5")).toBe(true);
      expect(isJumpableStageCode("7-1")).toBe(false);
      expect(isJumpableStageCode("7-2")).toBe(false);
      expect(() =>
        ScheduleEngine.jumpToMilestone(list, "m-7-1", { skip: true, currentDate: fixedToday }),
      ).toThrow(BadRequestError);
      expect(() =>
        ScheduleEngine.jumpToMilestone(list, "m-7-2", { skip: true, currentDate: fixedToday }),
      ).toThrow(BadRequestError);
    });
  });

  describe("4. MilestoneService 與 API 權限防護", () => {
    it("reorderMilestones 禁止將 6-2 拖曳至 6-1 進場安裝之前", async () => {
      mockTx.projectMilestone.findMany.mockResolvedValueOnce([
        { id: "m-61", stageCode: "6-1", phase: "INSTALL", stageOrder: 21, status: MilestoneStatus.PENDING, plannedDueDate: null },
        { id: "m-62", stageCode: "6-2", phase: "INSTALL", stageOrder: 22, status: MilestoneStatus.PENDING, plannedDueDate: null },
      ]);

      await expect(
        MilestoneService.reorderMilestones("proj-jump-1", ["m-62", "m-61"]),
      ).rejects.toThrowError(ConflictError);
    });

    it("非主管且非主責業務呼叫一鍵跳轉或此項略過 API 時應回傳 403 Forbidden", async () => {
      const dbMilestones = buildFullMilestones().map((m) => ({
        ...m,
        plannedDueDate: m.plannedDueDate ? new Date(`${m.plannedDueDate}T00:00:00.000Z`) : null,
        actualDueDate: null,
        priority: TaskPriority.MEDIUM,
        assignedTo: { name: "王業務" },
        salesTask: null,
      }));

      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "proj-jump-1",
        projectName: "測試案場",
        customerId: "cust-1",
        siteAddress: "台中市",
        siteCondition: null,
        salesRepId: "user-rep",
        salesAssistantId: "user-asst",
        currentStage: "DEVELOP",
        isDelayed: false,
        expectedDate: null,
        estimatedBudget: null,
        unitCount: null,
        cost: null,
        quoteAmount: null,
        parentId: null,
        phaseNumber: null,
        phaseName: null,
        customer: { name: "客戶A", customerType: "INDIVIDUAL", defaultDiscount: 1, salesRepId: "user-rep", salesRep: { name: "王業務" } },
        salesRep: { name: "王業務" },
        salesAssistant: { name: "林業助" },
        milestones: dbMilestones,
      } as any);

      // 業助雖與案場相關，但無一鍵跳轉與略過權限
      mockGetUserFromRequest.mockResolvedValue({ id: "user-asst", role: "ASSISTANT", name: "林業助" });

      const reqJump = new NextRequest("http://localhost/api/projects/proj-jump-1/milestones", {
        method: "PUT",
        body: JSON.stringify({ action: "jump", milestoneId: "m-3-1", skip: true }),
      });
      const resJump = await putProjectMilestones(reqJump, { params: { id: "proj-jump-1" } });
      expect(resJump.status).toBe(403);

      const reqSkip = new NextRequest("http://localhost/api/projects/proj-jump-1/milestones", {
        method: "PUT",
        body: JSON.stringify({ action: "advance", milestoneId: "m-1-1", skip: true }),
      });
      const resSkip = await putProjectMilestones(reqSkip, { params: { id: "proj-jump-1" } });
      expect(resSkip.status).toBe(403);
    });

    it("主責業務可成功執行一鍵跳轉至 4-5 對圖並回傳 200", async () => {
      const dbMilestones = buildFullMilestones().map((m) => ({
        ...m,
        plannedDueDate: m.plannedDueDate ? new Date(`${m.plannedDueDate}T00:00:00.000Z`) : null,
        actualDueDate: null,
        priority: TaskPriority.MEDIUM,
        assignedTo: { name: "王業務" },
        salesTask: null,
      }));

      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "proj-jump-1",
        projectName: "測試案場",
        customerId: "cust-1",
        siteAddress: "台中市",
        siteCondition: null,
        salesRepId: "user-rep",
        salesAssistantId: null,
        currentStage: "DEVELOP",
        isDelayed: false,
        expectedDate: null,
        estimatedBudget: null,
        unitCount: null,
        cost: null,
        quoteAmount: null,
        parentId: null,
        phaseNumber: null,
        phaseName: null,
        customer: { name: "客戶A", customerType: "INDIVIDUAL", defaultDiscount: 1, salesRepId: "user-rep", salesRep: { name: "王業務" } },
        salesRep: { name: "王業務" },
        salesAssistant: null,
        milestones: dbMilestones,
      } as any);
      mockTx.projectMilestone.findMany.mockResolvedValue(dbMilestones as any);
      mockGetUserFromRequest.mockResolvedValue({ id: "user-rep", role: "SALES", name: "王業務" });

      const req = new NextRequest("http://localhost/api/projects/proj-jump-1/milestones", {
        method: "PUT",
        body: JSON.stringify({ action: "jump", milestoneId: "m-4-5", skip: true }),
      });
      const res = await putProjectMilestones(req, { params: { id: "proj-jump-1" } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.project.currentStage).toBe("PRE_PROD");
      expect(body.milestones.find((m: any) => m.stageCode === "4-5")?.status).toBe("IN_PROGRESS");
      expect(body.milestones.find((m: any) => m.stageCode === "4-3")?.actualDueDate).toBeNull();
    });
  });
});
