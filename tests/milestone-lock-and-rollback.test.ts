import { describe, it, expect, vi, beforeEach } from "vitest";
import { MilestoneService } from "@/lib/services/milestone-service";
import { BadRequestError, ConflictError } from "@/lib/errors";
import { MilestoneStatus, TaskPriority } from "@prisma/client";

const mockTx = {
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

describe("防撞車鎖定與回退徹底清理機制", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.$queryRaw.mockResolvedValue([{ id: "proj-1" }]);
    mockTx.project.findUnique.mockResolvedValue({ salesRepId: "user-rep" });
    mockTx.project.update.mockResolvedValue({});
    mockTx.projectMilestone.update.mockResolvedValue({});
    mockTx.projectMilestone.updateMany.mockResolvedValue({ count: 1 });
    mockTx.salesTask.upsert.mockResolvedValue({});
    mockTx.salesTask.updateMany.mockResolvedValue({ count: 1 });
    mockTx.salesTask.deleteMany.mockResolvedValue({ count: 1 });
  });

  describe("回退徹底清理 (rollbackMilestone)", () => {
    it("當後續存在跳過造成的錯位進行中項目時，回退前置已完成項目會重置所有後續未完成常規進度與待辦", async () => {
      const dbRows = [
        {
          id: "m-25",
          projectId: "proj-1",
          stageCode: "2-5",
          phase: "REQUIREMENT",
          stageOrder: 7,
          plannedDueDate: new Date("2026-11-25"),
          actualDueDate: new Date("2026-11-20"),
          status: MilestoneStatus.COMPLETED,
          priority: TaskPriority.MEDIUM,
          assignedToId: "user-rep",
          assignedTo: { name: "王業務" },
          attachments: null,
          notes: null,
          salesTask: { subject: "場勘", isCompleted: true },
        },
        {
          id: "m-31",
          projectId: "proj-1",
          stageCode: "3-1",
          phase: "PROPOSAL",
          stageOrder: 8,
          plannedDueDate: new Date("2026-12-01"),
          actualDueDate: null,
          status: MilestoneStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          assignedToId: "user-rep",
          assignedTo: { name: "王業務" },
          attachments: null,
          notes: null,
          salesTask: null,
        },
        {
          id: "m-32",
          projectId: "proj-1",
          stageCode: "3-2",
          phase: "PROPOSAL",
          stageOrder: 9,
          plannedDueDate: new Date("2026-12-06"),
          actualDueDate: null,
          status: MilestoneStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH,
          assignedToId: "user-asst",
          assignedTo: { name: "林業助" },
          attachments: null,
          notes: null,
          salesTask: { subject: "報價單", isCompleted: false },
        },
        {
          id: "m-33",
          projectId: "proj-1",
          stageCode: "3-3",
          phase: "PROPOSAL",
          stageOrder: 10,
          plannedDueDate: new Date("2026-12-09"),
          actualDueDate: null,
          status: MilestoneStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          assignedToId: "user-rep",
          assignedTo: { name: "王業務" },
          attachments: null,
          notes: null,
          salesTask: null,
        },
      ];

      mockTx.projectMilestone.findMany.mockResolvedValueOnce(dbRows);

      const evaluated = await MilestoneService.rollbackMilestone("proj-1", "m-25");

      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(evaluated.find((m) => m.id === "m-25")?.status).toBe(MilestoneStatus.IN_PROGRESS);
      expect(evaluated.find((m) => m.id === "m-31")?.status).toBe(MilestoneStatus.PENDING);
      expect(evaluated.find((m) => m.id === "m-32")?.status).toBe(MilestoneStatus.PENDING);
      expect(evaluated.find((m) => m.id === "m-33")?.status).toBe(MilestoneStatus.PENDING);

      // 不只重置緊鄰的 3-1，更遠端錯位處於 IN_PROGRESS 的 3-2 也會一併重置為 PENDING
      expect(mockTx.projectMilestone.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["m-32"] } },
        data: { status: MilestoneStatus.PENDING },
      });

      // 所有目標之後的未完成常規進度（3-1, 3-2, 3-3）若有殘留未完成待辦一律清理
      expect(mockTx.salesTask.deleteMany).toHaveBeenCalledWith({
        where: { milestoneId: { in: ["m-31", "m-32", "m-33"] }, isCompleted: false },
      });
    });
  });

  describe("防撞車鎖定 (reorderMilestones & advanceMilestone)", () => {
    const existingRows = [
      {
        id: "m-25",
        stageCode: "2-5",
        phase: "REQUIREMENT",
        stageOrder: 7,
        status: MilestoneStatus.IN_PROGRESS,
        plannedDueDate: new Date("2026-11-25"),
      },
      {
        id: "m-31",
        stageCode: "3-1",
        phase: "PROPOSAL",
        stageOrder: 8,
        status: MilestoneStatus.PENDING,
        plannedDueDate: new Date("2026-11-30"),
      },
      {
        id: "m-32",
        stageCode: "3-2",
        phase: "PROPOSAL",
        stageOrder: 9,
        status: MilestoneStatus.PENDING,
        plannedDueDate: new Date("2026-12-05"),
      },
      {
        id: "m-41",
        stageCode: "4-1",
        phase: "PRE_PROD",
        stageOrder: 14,
        status: MilestoneStatus.PENDING,
        plannedDueDate: new Date("2026-12-10"),
      },
    ];

    it("reorderMilestones 應拒絕重複的里程碑 ID", async () => {
      mockTx.projectMilestone.findMany.mockResolvedValueOnce(existingRows);

      await expect(
        MilestoneService.reorderMilestones("proj-1", ["m-25", "m-31", "m-31", "m-41"])
      ).rejects.toThrowError(BadRequestError);
    });

    it("reorderMilestones 應拒絕將 PENDING 項目移動到進行中項目之前或移動進行中項目", async () => {
      mockTx.projectMilestone.findMany.mockResolvedValueOnce(existingRows);

      await expect(
        MilestoneService.reorderMilestones("proj-1", ["m-31", "m-25", "m-32", "m-41"])
      ).rejects.toThrowError(ConflictError);
    });

    it("reorderMilestones 應拒絕跨大階段移動 PENDING 項目", async () => {
      mockTx.projectMilestone.findMany.mockResolvedValueOnce(existingRows);

      await expect(
        MilestoneService.reorderMilestones("proj-1", ["m-25", "m-41", "m-32", "m-31"])
      ).rejects.toThrowError(ConflictError);
    });

    it("reorderMilestones 允許同一階段內調整 PENDING 項目順序，並於交易內加鎖", async () => {
      mockTx.projectMilestone.findMany
        .mockResolvedValueOnce(existingRows)
        .mockResolvedValueOnce([
          { ...existingRows[0], projectId: "proj-1", actualDueDate: null, priority: TaskPriority.MEDIUM, assignedToId: "u1", assignedTo: { name: "王" }, attachments: null, notes: null, salesTask: null },
          { ...existingRows[2], stageOrder: 2, projectId: "proj-1", actualDueDate: null, priority: TaskPriority.MEDIUM, assignedToId: "u1", assignedTo: { name: "王" }, attachments: null, notes: null, salesTask: null },
          { ...existingRows[1], stageOrder: 3, projectId: "proj-1", actualDueDate: null, priority: TaskPriority.MEDIUM, assignedToId: "u1", assignedTo: { name: "王" }, attachments: null, notes: null, salesTask: null },
          { ...existingRows[3], stageOrder: 4, projectId: "proj-1", actualDueDate: null, priority: TaskPriority.MEDIUM, assignedToId: "u1", assignedTo: { name: "王" }, attachments: null, notes: null, salesTask: null },
        ]);

      const updated = await MilestoneService.reorderMilestones("proj-1", ["m-25", "m-32", "m-31", "m-41"]);

      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(updated.map((m) => m.id)).toEqual(["m-25", "m-32", "m-31", "m-41"]);
    });

    it("advanceMilestone 應於交易鎖內重讀最新順序，即使傳入舊快照也不會跳過最新排在前面的項目", async () => {
      const staleSnapshot = [
        {
          id: "m-42",
          projectId: "proj-1",
          stageCode: "4-2",
          phase: "PRE_PROD",
          stageOrder: 15,
          status: "IN_PROGRESS",
          priority: "MEDIUM",
          plannedDueDate: "2026-12-01",
          actualDueDate: null,
          notes: null,
          attachments: null,
          assignedToId: "user-rep",
        },
        {
          id: "m-43",
          projectId: "proj-1",
          stageCode: "4-3",
          phase: "PRE_PROD",
          stageOrder: 16,
          status: "PENDING",
          priority: "MEDIUM",
          plannedDueDate: "2026-12-03",
          actualDueDate: null,
          notes: null,
          attachments: null,
          assignedToId: "user-rep",
        },
        {
          id: "m-44",
          projectId: "proj-1",
          stageCode: "4-4",
          phase: "PRE_PROD",
          stageOrder: 17,
          status: "PENDING",
          priority: "MEDIUM",
          plannedDueDate: "2026-12-08",
          actualDueDate: null,
          notes: null,
          attachments: null,
          assignedToId: "user-rep",
        },
      ];

      // 交易取得鎖後，資料庫已由前一筆 reorder 將 m-44 排到 order 16、m-43 到 order 17
      mockTx.projectMilestone.findMany.mockResolvedValueOnce([
        {
          id: "m-42",
          projectId: "proj-1",
          stageCode: "4-2",
          phase: "PRE_PROD",
          stageOrder: 15,
          status: MilestoneStatus.IN_PROGRESS,
          priority: TaskPriority.MEDIUM,
          plannedDueDate: new Date("2026-12-01"),
          actualDueDate: null,
          notes: null,
          attachments: null,
          assignedToId: "user-rep",
          assignedTo: { name: "王業務" },
          salesTask: { subject: "二次場勘", isCompleted: false },
        },
        {
          id: "m-44",
          projectId: "proj-1",
          stageCode: "4-4",
          phase: "PRE_PROD",
          stageOrder: 16,
          status: MilestoneStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          plannedDueDate: new Date("2026-12-08"),
          actualDueDate: null,
          notes: null,
          attachments: null,
          assignedToId: "user-rep",
          assignedTo: { name: "王業務" },
          salesTask: null,
        },
        {
          id: "m-43",
          projectId: "proj-1",
          stageCode: "4-3",
          phase: "PRE_PROD",
          stageOrder: 17,
          status: MilestoneStatus.PENDING,
          priority: TaskPriority.MEDIUM,
          plannedDueDate: new Date("2026-12-03"),
          actualDueDate: null,
          notes: null,
          attachments: null,
          assignedToId: "user-rep",
          assignedTo: { name: "王業務" },
          salesTask: null,
        },
      ]);

      const result = await MilestoneService.advanceMilestone(
        "proj-1",
        "m-42",
        { completedDate: "2026-11-23" },
        staleSnapshot as any
      );

      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result.updatedMilestones.find((m) => m.id === "m-44")?.status).toBe("IN_PROGRESS");
      expect(result.updatedMilestones.find((m) => m.id === "m-43")?.status).toBe("PENDING");
    });
  });
});
