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
  MILESTONE_DEFAULT_DAYS,
  MILESTONE_STAGE_LABELS,
  STAGE_CODE_TO_PHASE,
  STANDARD_MILESTONE_STAGE_CODES,
} from "../constants";
import { ScheduleEngine } from "../schedule-engine";
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
  }): Promise<ProjectDetail | undefined> {
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, salesRepId: true },
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
    const allCodes = STANDARD_MILESTONE_STAGE_CODES;
    let cursorDate = new Date();
    const milestoneRows = allCodes.map((code, index) => {
      const planned = new Date(cursorDate);
      const days = Number(defaultDays[code]) || MILESTONE_DEFAULT_DAYS[code] || 3;
      planned.setDate(planned.getDate() + days);
      cursorDate = planned;
      return {
        stageCode: code,
        phase: STAGE_CODE_TO_PHASE[code] || "DEVELOP",
        stageOrder: index + 1,
        plannedDueDate: planned,
        status: index === 0 ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING,
        assignedToId: assignedSalesRepId,
      };
    });

    return await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          projectName: data.projectName,
          customerId: data.customerId,
          siteAddress: data.siteAddress,
          siteCondition: data.siteCondition,
          salesRepId: assignedSalesRepId,
          currentStage: ProjectStage.DEVELOP,
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

      const firstMilestone = await tx.projectMilestone.findFirst({
        where: { projectId: p.id, stageCode: "1-1" },
      });
      if (firstMilestone) {
        await tx.salesTask.create({
          data: {
            projectId: p.id,
            milestoneId: firstMilestone.id,
            assignedToId: assignedSalesRepId,
            taskType: TaskType.SITE_VISIT,
            subject: MILESTONE_STAGE_LABELS["1-1"] || "客源開發",
            dueDatetime: firstMilestone.plannedDueDate || new Date(),
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
