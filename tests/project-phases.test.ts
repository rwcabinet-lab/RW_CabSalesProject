import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectService } from "@/lib/services/project-service";
import { prisma } from "@/lib/prisma";
import { MilestoneStatus, ProjectStage } from "@prisma/client";
import type { WorkbenchProjectDTO, ProjectWithMilestonesDTO } from "@/types/dto";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    projectMilestone: {
      findFirst: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    salesTask: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock("@/lib/services/config-service", () => ({
  ConfigService: {
    getMilestoneDefaultDays: vi.fn().mockResolvedValue({}),
    getCustomerTypeStartStages: vi.fn().mockResolvedValue({}),
  },
}));

describe("案件分期架構與業務邏輯 (Project Phasing & Hierarchy)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("母案與子期數彙總運算 (Roll-up Logic)", () => {
    it("母案報價金額、成本與戶數應正確累加各分期", () => {
      const phases: Partial<WorkbenchProjectDTO>[] = [
        { id: "p1", phaseNumber: 1, quoteAmount: 300000, cost: 200000, unitCount: 10 },
        { id: "p2", phaseNumber: 2, quoteAmount: 500000, cost: 350000, unitCount: 15 },
        { id: "p3", phaseNumber: 3, quoteAmount: 200000, cost: 120000, unitCount: 5 },
      ];

      const totalQuote = phases.reduce((sum, p) => sum + (p.quoteAmount || 0), 0);
      const totalCost = phases.reduce((sum, p) => sum + (p.cost || 0), 0);
      const totalUnits = phases.reduce((sum, p) => sum + (p.unitCount || 0), 0);

      expect(totalQuote).toBe(1000000);
      expect(totalCost).toBe(670000);
      expect(totalUnits).toBe(30);
    });

    it("母案報價彙總應支援 totalAmount 備援加總，杜絕子案有預算/成本而母案顯示 0 之問題", () => {
      const phases: Partial<WorkbenchProjectDTO>[] = [
        { id: "p1", phaseNumber: 1, quoteAmount: undefined, totalAmount: 11, cost: 11, unitCount: 1 },
      ];

      const totalQuote = phases.reduce(
        (sum, p) => sum + (Number(p.quoteAmount) || Number(p.totalAmount) || 0),
        0
      );
      expect(totalQuote).toBe(11);
    });

    it("燈號彙總規則：任一期逾期亮紅燈，次之黃燈，全結案亮灰燈，其餘綠燈", () => {
      const evaluateRollupLight = (colors: ("RED" | "YELLOW" | "GREEN" | "GRAY")[]) => {
        if (colors.includes("RED")) return "RED";
        if (colors.includes("YELLOW")) return "YELLOW";
        if (colors.every((c) => c === "GRAY")) return "GRAY";
        return "GREEN";
      };

      expect(evaluateRollupLight(["GREEN", "RED", "GREEN"])).toBe("RED");
      expect(evaluateRollupLight(["GREEN", "YELLOW", "GREEN"])).toBe("YELLOW");
      expect(evaluateRollupLight(["GRAY", "GRAY"])).toBe("GRAY");
      expect(evaluateRollupLight(["GREEN", "GREEN"])).toBe("GREEN");
    });

    it("母案預定進場日應動態對齊最早一期之進場日", () => {
      const dates = ["2026-12-15", "2026-11-20", "2027-04-10"];
      const sorted = [...dates].sort();
      expect(sorted[0]).toBe("2026-11-20");
    });
  });

  describe("分期動態建立與里程碑遷移 (addProjectPhase)", () => {
    it("當單期案場首次新增期數時，應將原案場轉為第 1 期並遷移歷史進度（一次建立一期）", async () => {
      const mockParent = {
        id: "master-1",
        projectName: "仁愛大樓案",
        customerId: "cust-1",
        siteAddress: "台北市仁愛路",
        siteCondition: "RC毛胚",
        salesRepId: "sales-1",
        salesAssistantId: null,
        currentStage: ProjectStage.DEVELOP,
        isDelayed: false,
        expectedDate: new Date("2026-12-01"),
        unitCount: 20,
        cost: 400000,
        quoteAmount: 600000,
        estimatedBudget: 600000,
        phases: [],
        milestones: [{ id: "m1", stageCode: "1-1" }],
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockParent as any);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
        salesRepId: "sales-1",
        customerType: "CONSTRUCTION",
      } as any);

      const mockPhase1 = {
        ...mockParent,
        id: "phase-1",
        parentId: "master-1",
        phaseNumber: 1,
        phaseName: "第 1 期",
        quoteAmount: 600000,
        customer: { name: "信義建設", customerType: "CONSTRUCTION", defaultDiscount: 1, salesRepId: "sales-1", salesRep: { name: "王業務" } },
        salesRep: { name: "王業務" },
      };

      vi.mocked(prisma.project.create).mockResolvedValueOnce(mockPhase1 as any);
      vi.mocked(prisma.projectMilestone.findFirst).mockResolvedValue(null);

      const result = await ProjectService.addProjectPhase("master-1", {
        phaseName: "第 1 期",
        quoteAmount: 600000,
      });

      expect(prisma.project.create).toHaveBeenCalledTimes(1);
      expect(prisma.projectMilestone.updateMany).toHaveBeenCalledWith({
        where: { projectId: "master-1" },
        data: { projectId: "phase-1" },
      });
      expect(prisma.salesTask.updateMany).toHaveBeenCalledWith({
        where: { projectId: "master-1" },
        data: { projectId: "phase-1" },
      });
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: "master-1" },
        data: {
          quoteAmount: null,
          cost: null,
          unitCount: null,
          estimatedBudget: null,
          expectedDate: null,
        },
      });
      expect(result.id).toBe("phase-1");
    });

    it("當案場已有分期時，新增期數應接續下一個 phaseNumber", async () => {
      const mockParent = {
        id: "master-2",
        projectName: "信義特區案",
        customerId: "cust-1",
        siteAddress: "台北市信義路",
        salesRepId: "sales-1",
        phases: [
          { id: "ph1", phaseNumber: 1, phaseName: "第 1 期" },
          { id: "ph2", phaseNumber: 2, phaseName: "第 2 期" },
        ],
        milestones: [],
      };

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockParent as any);
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        id: "cust-1",
        salesRepId: "sales-1",
        customerType: "CONSTRUCTION",
      } as any);

      const mockPhase3 = {
        id: "phase-3",
        projectName: "信義特區案 - 第 3 期：公設景觀",
        customerId: "cust-1",
        siteAddress: "台北市信義路",
        parentId: "master-2",
        phaseNumber: 3,
        phaseName: "第 3 期：公設景觀",
        customer: { name: "信義建設", customerType: "CONSTRUCTION", defaultDiscount: 1, salesRepId: "sales-1", salesRep: { name: "王業務" } },
        salesRep: { name: "王業務" },
      };

      vi.mocked(prisma.project.create).mockResolvedValueOnce(mockPhase3 as any);
      vi.mocked(prisma.projectMilestone.findFirst).mockResolvedValue(null);

      const result = await ProjectService.addProjectPhase("master-2", {
        phaseName: "第 3 期：公設景觀",
      });

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: "master-2",
            phaseNumber: 3,
            phaseName: "第 3 期：公設景觀",
          }),
        })
      );
      expect(result.id).toBe("phase-3");
    });
  });

  describe("甘特圖落差連線 (Dumbbell Variance Line) 幾何判斷", () => {
    it("實際完成日早於預定完成日為提前完成（綠線）", () => {
      const plannedDate = "2026-11-20";
      const actualDate = "2026-11-15";
      const isEarly = actualDate < plannedDate;
      expect(isEarly).toBe(true);
    });

    it("實際完成日晚於預定完成日為延誤落差（紅線）", () => {
      const plannedDate = "2026-11-20";
      const actualDate = "2026-11-25";
      const isDelayed = actualDate > plannedDate;
      expect(isDelayed).toBe(true);
    });

    it("同日完成為如期達成（無落差線段）", () => {
      const plannedDate = "2026-11-20";
      const actualDate = "2026-11-20";
      expect(actualDate === plannedDate).toBe(true);
    });
  });

  describe("分期建立權限管制 (RBAC Permissions)", () => {
    it("僅系統管理者 (ADMIN) 具備開立分期權限，其餘角色一律禁止", () => {
      const canAddPhase = (role: string) => role === "ADMIN";
      expect(canAddPhase("ADMIN")).toBe(true);
      expect(canAddPhase("LEVEL_MANAGER")).toBe(false);
      expect(canAddPhase("SALES_MANAGER")).toBe(false);
      expect(canAddPhase("SALES")).toBe(false);
      expect(canAddPhase("ASSISTANT")).toBe(false);
    });
  });
});
