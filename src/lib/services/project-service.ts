import { prisma } from "@/lib/prisma";
import {
  Prisma,
  MilestoneStatus,
  ProjectStage,
  TaskPriority,
  TaskType,
} from "@prisma/client";
import { BadRequestError } from "../errors";
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPE_START_STAGE_CODES,
  MILESTONE_DEFAULT_DAYS,
  MILESTONE_STAGE_LABELS,
  STAGE_CODE_TO_PHASE,
  STANDARD_MILESTONE_STAGE_CODES,
} from "../constants";
import { ScheduleEngine, STAGE_CODE_TO_PROJECT_STAGE } from "../schedule-engine";
import type {
  MilestonePhaseDTO,
  MilestoneStageCode,
  ProjectDetail,
  ProjectMilestoneItem,
} from "@/types/dto";
import {
  customerTypeFromDatabase,
  dateOnlyValue,
  dateValue,
  projectInclude,
} from "./shared";
import { ConfigService } from "./config-service";
import { MilestoneService } from "./milestone-service";

export const ProjectService = {
  async getProjects(filter?: { where?: Prisma.ProjectWhereInput }): Promise<ProjectDetail[]> {
    const projects = await prisma.project.findMany({
      where: filter?.where,
      include: projectInclude,
      orderBy: { createdAt: "desc" },
    });
    return projects.map((p) => ({
      id: p.id,
      projectName: p.projectName,
      customerId: p.customerId,
      customerName: p.customer.name,
      customerType: customerTypeFromDatabase(p.customer.customerType),
      defaultDiscount: Number(p.customer.defaultDiscount),
      siteAddress: p.siteAddress,
      siteCondition: p.siteCondition || undefined,
      salesRepId: p.salesRepId,
      salesRepName: p.salesRep.name,
      customerSalesRepId: p.customer.salesRepId,
      customerSalesRepName: p.customer.salesRep.name,
      salesAssistantId: p.salesAssistantId || undefined,
      salesAssistantName: p.salesAssistant?.name,
      currentStage: p.currentStage,
      isDelayed: p.isDelayed,
      expectedDate: dateValue(p.expectedDate),
      estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount ?? undefined,
      cost: p.cost != null ? Number(p.cost) : undefined,
      quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
    }));
  },

  async getProjectById(
    id: string,
    options?: { evaluateSchedule?: boolean }
  ): Promise<ProjectDetail | undefined> {
    if (options?.evaluateSchedule !== false) {
      const combined = await ProjectService.getProjectWithMilestones(id);
      return combined?.project;
    }
    const p = await prisma.project.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      include: projectInclude,
    });
    if (!p) return undefined;
    return {
      id: p.id,
      projectName: p.projectName,
      customerId: p.customerId,
      customerName: p.customer.name,
      customerType: customerTypeFromDatabase(p.customer.customerType),
      defaultDiscount: Number(p.customer.defaultDiscount),
      siteAddress: p.siteAddress,
      siteCondition: p.siteCondition || undefined,
      salesRepId: p.salesRepId,
      salesRepName: p.salesRep.name,
      customerSalesRepId: p.customer.salesRepId,
      customerSalesRepName: p.customer.salesRep.name,
      salesAssistantId: p.salesAssistantId || undefined,
      salesAssistantName: p.salesAssistant?.name,
      currentStage: p.currentStage,
      isDelayed: p.isDelayed,
      expectedDate: dateValue(p.expectedDate),
      estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount ?? undefined,
      cost: p.cost != null ? Number(p.cost) : undefined,
      quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
    };
  },

  async getProjectWithMilestones(
    id: string
  ): Promise<{ project: ProjectDetail; milestones: ProjectMilestoneItem[] } | undefined> {
    const p = await prisma.project.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      include: {
        ...projectInclude,
        milestones: {
          include: {
            assignedTo: { select: { name: true } },
            salesTask: { select: { id: true, subject: true, isCompleted: true } },
          },
          orderBy: { stageOrder: "asc" },
        },
      },
    });
    if (!p) return undefined;
    const rawMilestones: ProjectMilestoneItem[] = p.milestones.map((m) => {
      const isAuditSubmitted = Boolean(
        m.salesTask?.subject.startsWith("【需審核】") &&
        !m.salesTask?.isCompleted &&
        m.status !== "COMPLETED"
      );
      return {
        id: m.id,
        projectId: m.projectId,
        stageCode: m.stageCode as MilestoneStageCode,
        phase: m.phase as MilestonePhaseDTO,
        stageOrder: m.stageOrder,
        plannedDueDate: dateOnlyValue(m.plannedDueDate),
        actualDueDate: dateOnlyValue(m.actualDueDate),
        status: m.status,
        priority: m.priority,
        assignedToId: m.assignedToId || p.customer.salesRepId,
        assignedToName: m.assignedTo?.name || p.customer.salesRep.name,
        attachments: m.attachments,
        notes: m.notes,
        auditSubmitted: isAuditSubmitted,
      };
    });
    const evaluated = ScheduleEngine.evaluateMilestones(rawMilestones);
    const correctIsDelayed = p.currentStage === "LOST" ? false : evaluated.isDelayed;

    if (p.isDelayed !== correctIsDelayed) {
      prisma.project
        .update({
          where: { id },
          data: { isDelayed: correctIsDelayed },
        })
        .catch((err) => console.error("Failed to auto-sync project isDelayed:", err));
    }
    const statusChanged = evaluated.milestones.filter((m) => {
      const orig = rawMilestones.find((r) => r.id === m.id);
      return orig && orig.status !== m.status;
    });
    if (statusChanged.length > 0) {
      Promise.all(
        statusChanged.map((m) =>
          prisma.projectMilestone.update({
            where: { id: m.id },
            data: { status: m.status },
          })
        )
      ).catch((err) => console.error("Failed to auto-sync milestone status:", err));
    }

    const project: ProjectDetail = {
      id: p.id,
      projectName: p.projectName,
      customerId: p.customerId,
      customerName: p.customer.name,
      customerType: customerTypeFromDatabase(p.customer.customerType),
      defaultDiscount: Number(p.customer.defaultDiscount),
      siteAddress: p.siteAddress,
      siteCondition: p.siteCondition || undefined,
      salesRepId: p.salesRepId,
      salesRepName: p.salesRep.name,
      customerSalesRepId: p.customer.salesRepId,
      customerSalesRepName: p.customer.salesRep.name,
      salesAssistantId: p.salesAssistantId || undefined,
      salesAssistantName: p.salesAssistant?.name,
      currentStage: p.currentStage,
      isDelayed: correctIsDelayed,
      expectedDate: dateValue(p.expectedDate),
      estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount ?? undefined,
      cost: p.cost != null ? Number(p.cost) : undefined,
      quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
    };
    return { project, milestones: evaluated.milestones };
  },

  async addProject(data: {
    projectName: string;
    customerId: string;
    siteAddress: string;
    siteCondition?: string;
    expectedDate?: string;
    unitCount?: number;
    cost?: number;
    quoteAmount?: number;
    salesRepId?: string;
    startStageCode?: string;
  }): Promise<ProjectDetail | undefined> {
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, salesRepId: true, customerType: true },
    });
    if (!customer) return undefined;

    if (data.salesRepId) {
      const rep = await prisma.user.findUnique({
        where: { id: data.salesRepId },
        select: { role: true },
      });
      if (rep && (rep.role === "ADMIN" || rep.role === "LEVEL_MANAGER")) {
        throw new BadRequestError("不可指派管理者或理級主管為主責業務");
      }
    }

    const assignedSalesRepId = data.salesRepId || customer.salesRepId;

    const defaultDays = await ConfigService.getMilestoneDefaultDays();
    const dynamicTypeStages = await ConfigService.getCustomerTypeStartStages();
    const allCodes = STANDARD_MILESTONE_STAGE_CODES;

    // 依客戶類型或指定參數決定起始進度（方案一：自動批次略過前置進度）
    const targetStartCode =
      (data.startStageCode && allCodes.includes(data.startStageCode as MilestoneStageCode)
        ? (data.startStageCode as MilestoneStageCode)
        : undefined) ||
      dynamicTypeStages[customer.customerType] ||
      CUSTOMER_TYPE_START_STAGE_CODES[customer.customerType] ||
      "1-1";

    const targetIndex = allCodes.indexOf(targetStartCode);
    const validTargetIndex = targetIndex !== -1 ? targetIndex : 0;
    const finalStartCode = allCodes[validTargetIndex];
    const customerTypeLabel = CUSTOMER_TYPE_LABELS[customer.customerType] || customer.customerType;

    const today = new Date();
    let cursorDate = new Date(today);

    const milestoneRows = allCodes.map((code, index) => {
      const isSkipped = index < validTargetIndex;
      const isActive = index === validTargetIndex;

      let plannedDueDate: Date;
      let actualDueDate: Date | null = null;
      let status: MilestoneStatus;
      let notes: string | null = null;

      if (isSkipped) {
        status = MilestoneStatus.COMPLETED;
        plannedDueDate = new Date(today);
        actualDueDate = new Date(today);
        notes = `【系統自動略過：依客戶類型（${customerTypeLabel}）跳轉】`;
      } else if (code === "6-1" && data.expectedDate) {
        status = isActive ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING;
        const dateStr = data.expectedDate.slice(0, 10);
        plannedDueDate = new Date(`${dateStr}T00:00:00.000Z`);
        cursorDate = new Date(plannedDueDate);
      } else if (isActive) {
        status = MilestoneStatus.IN_PROGRESS;
        const days = Number(defaultDays[code]) || MILESTONE_DEFAULT_DAYS[code] || 3;
        plannedDueDate = new Date(today);
        plannedDueDate.setDate(plannedDueDate.getDate() + days);
        cursorDate = new Date(plannedDueDate);
      } else {
        status = MilestoneStatus.PENDING;
        const days = Number(defaultDays[code]) || MILESTONE_DEFAULT_DAYS[code] || 3;
        plannedDueDate = new Date(cursorDate);
        plannedDueDate.setDate(plannedDueDate.getDate() + days);
        cursorDate = new Date(plannedDueDate);
      }

      return {
        stageCode: code,
        phase: STAGE_CODE_TO_PHASE[code] || "DEVELOP",
        stageOrder: index + 1,
        plannedDueDate,
        actualDueDate,
        status,
        notes,
        assignedToId: assignedSalesRepId,
      };
    });

    const initialProjectStage = (STAGE_CODE_TO_PROJECT_STAGE[finalStartCode] || ProjectStage.DEVELOP) as ProjectStage;

    return await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          projectName: data.projectName,
          customerId: data.customerId,
          siteAddress: data.siteAddress,
          siteCondition: data.siteCondition,
          salesRepId: assignedSalesRepId,
          currentStage: initialProjectStage,
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
          unitCount: data.unitCount,
          cost: data.cost,
          quoteAmount: data.quoteAmount,
          estimatedBudget: data.quoteAmount || data.cost,
          milestones: {
            createMany: {
              data: milestoneRows,
            },
          },
        },
        relationLoadStrategy: "join",
        include: projectInclude,
      });

      const activeMilestone = await tx.projectMilestone.findFirst({
        where: { projectId: p.id, stageCode: finalStartCode },
      });
      if (activeMilestone) {
        const isDrawing =
          activeMilestone.phase === "PROPOSAL" ||
          activeMilestone.phase === "PRE_PROD" ||
          finalStartCode.startsWith("3-") ||
          finalStartCode.startsWith("4-");

        await tx.salesTask.create({
          data: {
            projectId: p.id,
            milestoneId: activeMilestone.id,
            assignedToId: assignedSalesRepId,
            taskType: isDrawing ? TaskType.DRAWING : TaskType.SITE_VISIT,
            subject: MILESTONE_STAGE_LABELS[finalStartCode as MilestoneStageCode] || "里程碑任務",
            dueDatetime: activeMilestone.plannedDueDate || new Date(),
            priority: TaskPriority.MEDIUM,
            isCompleted: false,
          },
        });
      }

      return {
        id: p.id,
        projectName: p.projectName,
        customerId: p.customerId,
        customerName: p.customer.name,
        customerType: customerTypeFromDatabase(p.customer.customerType),
        defaultDiscount: Number(p.customer.defaultDiscount),
        siteAddress: p.siteAddress,
        siteCondition: p.siteCondition || undefined,
        salesRepId: p.salesRepId,
        salesRepName: p.salesRep.name,
        customerSalesRepId: p.customer.salesRepId,
        customerSalesRepName: p.customer.salesRep.name,
        salesAssistantId: p.salesAssistantId || undefined,
        salesAssistantName: p.salesAssistant?.name,
        currentStage: p.currentStage,
        isDelayed: p.isDelayed,
        expectedDate: dateValue(p.expectedDate),
        estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
        unitCount: p.unitCount ?? undefined,
        cost: p.cost != null ? Number(p.cost) : undefined,
        quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
      };
    });
  },

  async updateProject(id: string, data: {
    projectName?: string;
    customerId?: string;
    siteAddress?: string;
    siteCondition?: string;
    expectedDate?: string;
    unitCount?: number | null;
    cost?: number | null;
    quoteAmount?: number | null;
    salesAssistantId?: string | null;
    salesRepId?: string;
    estimatedBudget?: number | null;
  }): Promise<ProjectDetail | undefined> {
    if (data.salesRepId) {
      const rep = await prisma.user.findUnique({
        where: { id: data.salesRepId },
        select: { role: true },
      });
      if (rep && (rep.role === "ADMIN" || rep.role === "LEVEL_MANAGER")) {
        throw new BadRequestError("不可指派管理者或理級主管為主責業務");
      }
    }

    const existing = data.salesRepId
      ? await prisma.project.findUnique({
          where: { id },
          select: { salesRepId: true },
        })
      : null;

    const updateData: Prisma.ProjectUncheckedUpdateInput = {
      ...(data.projectName !== undefined ? { projectName: data.projectName } : {}),
      ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
      ...(data.siteAddress !== undefined ? { siteAddress: data.siteAddress } : {}),
      ...(data.siteCondition !== undefined ? { siteCondition: data.siteCondition || null } : {}),
      ...(data.expectedDate !== undefined ? { expectedDate: data.expectedDate ? new Date(data.expectedDate) : null } : {}),
      ...(data.unitCount !== undefined ? { unitCount: data.unitCount } : {}),
      ...(data.cost !== undefined ? { cost: data.cost } : {}),
      ...(data.quoteAmount !== undefined ? { quoteAmount: data.quoteAmount } : {}),
      ...(data.estimatedBudget !== undefined ? { estimatedBudget: data.estimatedBudget } : {}),
      ...(data.salesAssistantId !== undefined ? { salesAssistantId: data.salesAssistantId || null } : {}),
      ...(data.salesRepId ? { salesRepId: data.salesRepId } : {}),
    };

    return await prisma.$transaction(async (tx) => {
      if (data.salesRepId && existing && existing.salesRepId !== data.salesRepId) {
        const oldSalesRepId = existing.salesRepId;
        const newSalesRepId = data.salesRepId;

        // 連動未進行項目（PENDING）或原主責業務尚未完成的里程碑負責人
        await tx.projectMilestone.updateMany({
          where: {
            projectId: id,
            status: { not: MilestoneStatus.COMPLETED },
            OR: [
              { status: MilestoneStatus.PENDING },
              { assignedToId: oldSalesRepId },
              { assignedToId: null },
            ],
          },
          data: { assignedToId: newSalesRepId },
        });

        // 連動未完成且原屬舊業務之待辦任務
        await tx.salesTask.updateMany({
          where: {
            projectId: id,
            isCompleted: false,
            assignedToId: oldSalesRepId,
          },
          data: { assignedToId: newSalesRepId },
        });
      }

      const p = await tx.project.update({
        where: { id },
        data: updateData,
        relationLoadStrategy: "join",
        include: projectInclude,
      });

      // 雙向同步：若更新案件主檔之 expectedDate，同步更新未完成之 6-1 進場安裝預定日
      if (data.expectedDate !== undefined) {
        const newExpectedDate = data.expectedDate
          ? new Date(`${data.expectedDate.slice(0, 10)}T00:00:00.000Z`)
          : null;
        const m61 = await tx.projectMilestone.findFirst({
          where: { projectId: id, stageCode: "6-1" },
          select: { id: true, status: true },
        });
        if (m61 && m61.status !== MilestoneStatus.COMPLETED) {
          await tx.projectMilestone.update({
            where: { id: m61.id },
            data: { plannedDueDate: newExpectedDate },
          });
          if (newExpectedDate) {
            await tx.salesTask.updateMany({
              where: { milestoneId: m61.id, isCompleted: false },
              data: { dueDatetime: newExpectedDate },
            });
          }
        }
      }

      return {
        id: p.id,
        projectName: p.projectName,
        customerId: p.customerId,
        customerName: p.customer.name,
        customerType: customerTypeFromDatabase(p.customer.customerType),
        defaultDiscount: Number(p.customer.defaultDiscount),
        siteAddress: p.siteAddress,
        siteCondition: p.siteCondition || undefined,
        salesRepId: p.salesRepId,
        salesRepName: p.salesRep.name,
        customerSalesRepId: p.customer.salesRepId,
        customerSalesRepName: p.customer.salesRep.name,
        salesAssistantId: p.salesAssistantId || undefined,
        salesAssistantName: p.salesAssistant?.name,
        currentStage: p.currentStage,
        isDelayed: p.isDelayed,
        expectedDate: dateValue(p.expectedDate),
        estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
        unitCount: p.unitCount ?? undefined,
        cost: p.cost != null ? Number(p.cost) : undefined,
        quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
      };
    });
  },

  async deleteProject(id: string): Promise<boolean> {
    const result = await prisma.project.deleteMany({ where: { id } });
    return result.count > 0;
  },

  async evaluateAllSchedules(currentDate: Date = new Date()) {
    const [projects, milestonesByProject] = await Promise.all([
      ProjectService.getProjects(),
      MilestoneService.getMilestonesByProjectIds(),
    ]);

    const updates: Prisma.PrismaPromise<unknown>[] = [];
    let delayedCount = 0;

    for (const p of projects) {
      const ms = milestonesByProject[p.id] || [];
      const evaluatedDelayed = ScheduleEngine.isProjectDelayed(p, ms, currentDate);
      if (evaluatedDelayed) delayedCount++;

      if (p.isDelayed !== evaluatedDelayed) {
        updates.push(
          prisma.project.update({
            where: { id: p.id },
            data: { isDelayed: evaluatedDelayed },
          })
        );
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return {
      totalProjects: projects.length,
      delayedCount,
      updatedCount: updates.length,
    };
  },
};
