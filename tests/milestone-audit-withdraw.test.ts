import { describe, it, expect, vi, beforeEach } from "vitest";
import { MilestoneService } from "@/lib/services/milestone-service";
import { prisma } from "@/lib/prisma";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { MilestoneStatus, TaskPriority, TaskType } from "@prisma/client";

const mockTx = {
  projectMilestone: {
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  salesTask: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  project: {
    update: vi.fn(),
  },
  $executeRaw: vi.fn(),
};

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

describe("Milestone Audit Withdrawal Mechanism (里程碑審核撤回與駁回退回機制)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMilestone = {
    id: "m-audit-1",
    projectId: "proj-1",
    stageCode: "3-1", // 設計圖 (需審核節點)
    status: MilestoneStatus.IN_PROGRESS,
    phase: "PROPOSAL",
    priority: TaskPriority.HIGH,
    plannedDueDate: new Date("2026-11-20"),
    assignedToId: "user-assignee",
  };

  const mockAuditTask = {
    id: "task-audit-1",
    projectId: "proj-1",
    milestoneId: "m-audit-1",
    assignedToId: "user-manager",
    assignedById: "user-submitter",
    subject: "【需審核】設計圖",
    priority: TaskPriority.HIGH,
    isCompleted: false,
    dueDatetime: new Date("2026-11-20"),
    project: {
      salesRepId: "user-salesrep",
    },
  };

  it("若里程碑非需審核節點，執行撤回時應拋出 BadRequestError", async () => {
    const nonAuditMilestone = {
      ...mockMilestone,
      stageCode: "1-1", // 初洽 (非審核節點)
    };

    await expect(
      MilestoneService.withdrawMilestoneReview(
        "proj-1",
        "m-audit-1",
        "user-assignee",
        false,
        undefined,
        [nonAuditMilestone as any]
      )
    ).rejects.toThrowError(BadRequestError);
  });

  it("若里程碑已處於 COMPLETED 完成狀態，執行撤回時應拋出 ConflictError", async () => {
    const completedMilestone = {
      ...mockMilestone,
      status: MilestoneStatus.COMPLETED,
    };

    await expect(
      MilestoneService.withdrawMilestoneReview(
        "proj-1",
        "m-audit-1",
        "user-assignee",
        false,
        undefined,
        [completedMilestone as any]
      )
    ).rejects.toThrowError(ConflictError);
  });

  it("若任務未處於審核中 (無【需審核】前綴或已完成)，應拋出 ConflictError", async () => {
    vi.mocked(prisma.salesTask.findUnique).mockResolvedValueOnce({
      ...mockAuditTask,
      subject: "設計圖", // 已非審核任務
    } as any);

    await expect(
      MilestoneService.withdrawMilestoneReview(
        "proj-1",
        "m-audit-1",
        "user-assignee",
        false,
        undefined,
        [mockMilestone as any]
      )
    ).rejects.toThrowError(ConflictError);
  });

  it("非進度負責人、非提交者、非主責業務且非主管之第三方人員，無權執行撤回 (ForbiddenError)", async () => {
    vi.mocked(prisma.salesTask.findUnique).mockResolvedValueOnce(mockAuditTask as any);

    await expect(
      MilestoneService.withdrawMilestoneReview(
        "proj-1",
        "m-audit-1",
        "user-stranger",
        false, // 非主管
        undefined,
        [mockMilestone as any]
      )
    ).rejects.toThrowError(ForbiddenError);
  });

  it("進度負責人可成功執行撤回，待辦還原為常規任務且主旨移除【需審核】標記", async () => {
    vi.mocked(prisma.salesTask.findUnique).mockResolvedValueOnce(mockAuditTask as any);
    vi.mocked(prisma.salesTask.update).mockResolvedValueOnce({} as any);

    await MilestoneService.withdrawMilestoneReview(
      "proj-1",
      "m-audit-1",
      "user-assignee",
      false,
      "補充水電圖資",
      [mockMilestone as any]
    );

    expect(prisma.salesTask.update).toHaveBeenCalledWith({
      where: { milestoneId: "m-audit-1" },
      data: expect.objectContaining({
        assignedToId: "user-assignee",
        subject: "設計圖",
        isCompleted: false,
        resultNotes: "[已撤回審核] 補充水電圖資",
      }),
    });
  });

  it("主管身分可成功執行退件/撤回，將待辦派回給進度負責人", async () => {
    vi.mocked(prisma.salesTask.findUnique).mockResolvedValueOnce(mockAuditTask as any);
    vi.mocked(prisma.salesTask.update).mockResolvedValueOnce({} as any);

    await MilestoneService.withdrawMilestoneReview(
      "proj-1",
      "m-audit-1",
      "user-manager",
      true, // 主管
      "報價折率有誤退回重擬",
      [mockMilestone as any]
    );

    expect(prisma.salesTask.update).toHaveBeenCalledWith({
      where: { milestoneId: "m-audit-1" },
      data: expect.objectContaining({
        assignedToId: "user-assignee",
        subject: "設計圖",
        resultNotes: "[已撤回審核] 報價折率有誤退回重擬",
      }),
    });
  });

  describe("回退至「系統自動略過」項目與配套機制", () => {
    it("回退系統自動略過之里程碑時，成功回退且清空自動略過備註、自動展期並補建待辦任務", async () => {
      const mockMilestonesList = [
        {
          id: "m-skip-31",
          projectId: "proj-100",
          stageCode: "3-1",
          stageOrder: 1,
          phase: "PROPOSAL",
          status: MilestoneStatus.COMPLETED,
          plannedDueDate: "2026-11-01",
          actualDueDate: "2026-11-01",
          notes: "【系統自動略過：依客戶類型（經銷公司）跳轉】",
          assignedToId: "user-rep",
        },
        {
          id: "m-active-32",
          projectId: "proj-100",
          stageCode: "3-2",
          stageOrder: 2,
          phase: "PROPOSAL",
          status: MilestoneStatus.IN_PROGRESS,
          plannedDueDate: "2026-11-15",
          actualDueDate: null,
          notes: null,
          assignedToId: "user-rep",
        },
      ];

      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        salesRepId: "user-rep",
      } as any);

      const result = await MilestoneService.rollbackMilestone(
        "proj-100",
        "m-skip-31",
        mockMilestonesList as any
      );

      const rolledBack = result.find((m) => m.id === "m-skip-31");
      expect(rolledBack?.status).toBe(MilestoneStatus.IN_PROGRESS);
      // 配套 3: 清空自動略過備註
      expect(rolledBack?.notes).toBeNull();
      // 配套 2: 預定日展期，不應維持過去之建案日 2026-11-01
      expect(rolledBack?.plannedDueDate).not.toBe("2026-11-01");

      // 配套 1: 待辦任務自動 upsert 補建
      expect(mockTx.salesTask.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { milestoneId: "m-skip-31" },
          create: expect.objectContaining({
            milestoneId: "m-skip-31",
            assignedToId: "user-rep",
            subject: "設計圖",
            isCompleted: false,
          }),
        })
      );
    });

    it("回退一般手動推進之里程碑時，保留原使用者輸入之備註不被誤清", async () => {
      const mockMilestonesList = [
        {
          id: "m-normal-11",
          projectId: "proj-100",
          stageCode: "1-1",
          stageOrder: 1,
          phase: "DEVELOP",
          status: MilestoneStatus.COMPLETED,
          plannedDueDate: "2026-11-25",
          actualDueDate: "2026-11-20",
          notes: "業主現場確認尺寸，已手動填報",
          assignedToId: "user-rep",
        },
        {
          id: "m-active-12",
          projectId: "proj-100",
          stageCode: "1-2",
          stageOrder: 2,
          phase: "DEVELOP",
          status: MilestoneStatus.IN_PROGRESS,
          plannedDueDate: "2026-11-10",
          actualDueDate: null,
          notes: null,
          assignedToId: "user-rep",
        },
      ];

      vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
        salesRepId: "user-rep",
      } as any);

      const result = await MilestoneService.rollbackMilestone(
        "proj-100",
        "m-normal-11",
        mockMilestonesList as any
      );

      const rolledBack = result.find((m) => m.id === "m-normal-11");
      expect(rolledBack?.status).toBe(MilestoneStatus.IN_PROGRESS);
      // 保留原使用者輸入之備註
      expect(rolledBack?.notes).toBe("業主現場確認尺寸，已手動填報");
    });
  });
});
