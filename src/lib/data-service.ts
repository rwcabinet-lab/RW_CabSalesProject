import { CustomerType, MilestoneStatus, PaymentTerms, Prisma, ProjectStage, Role, TaskPriority, TaskType } from "@prisma/client";
import { prisma } from "./prisma";
import type {
  CustomerCreateDTO,
  CustomerDTO as CustomerItem,
  CustomerTypeDTO,
  CustomerUpdateDTO,
  MilestoneDTO as ProjectMilestoneItem,
  MilestonePhaseDTO,
  MilestoneStageCodeDTO as MilestoneStageCode,
  ProjectDTO as ProjectDetail,
  QuoteVersionCreateDTO,
  TaskDTO as SalesTaskItem,
} from "@/types/dto";
import {
  MasterBoardItem, MasterHardwareItem, MasterProcessingItem, QuotationData,
  MILESTONE_STAGE_LABELS, STAGE_CODE_TO_PHASE, MILESTONE_DEFAULT_DAYS
} from "./mock-data";
import { ScheduleEngine, STAGE_CODE_TO_PROJECT_STAGE } from "./schedule-engine";

const dateValue = (value: Date | null | undefined) => value?.toISOString() || undefined;
const dateOnlyValue = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) || null;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const projectInclude = {
  customer: { include: { salesRep: true } },
  salesRep: true,
  salesAssistant: true,
} as const;
const milestoneInclude = {
  assignedTo: true,
  project: {
    select: {
      customer: {
        select: {
          salesRepId: true,
          salesRep: { select: { name: true } },
        },
      },
    },
  },
} as const;
const customerTypeFromDatabase = (type: CustomerType): CustomerItem["customerType"] => type === "CONTRACTOR" ? "PR" : type;
const customerTypeForDatabase = (type: CustomerTypeDTO): CustomerType => type === "PR" ? CustomerType.CONTRACTOR : type as CustomerType;

export const DataService = {
  async getCatalog(): Promise<{ boards: MasterBoardItem[]; hardware: MasterHardwareItem[]; processing: MasterProcessingItem[] }> {
    const [boards, hardware, processing] = await Promise.all([
      prisma.masterBoard.findMany({ orderBy: { brand: "asc" } }),
      prisma.masterHardware.findMany({ orderBy: { brand: "asc" } }),
      prisma.masterProcessing.findMany({ orderBy: { processName: "asc" } }),
    ]);
    return {
      boards: boards.map(item => ({ ...item, retailPrice: Number(item.retailPrice), colorCode: item.colorCode, thicknessMm: item.thicknessMm })),
      hardware: hardware.map(item => ({ ...item, retailPrice: Number(item.retailPrice), modelName: item.modelName })),
      processing: processing.map(item => ({ ...item, retailPrice: Number(item.retailPrice), processName: item.processName })),
    };
  },

  async getCustomers(): Promise<CustomerItem[]> {
    const customers = await prisma.customer.findMany({ include: { salesRep: true }, orderBy: { createdAt: "desc" } });
    return customers.map(c => ({
      id: c.id, customerType: customerTypeFromDatabase(c.customerType), name: c.name, taxId: c.taxId || undefined,
      phone: c.phone, address: c.address || undefined, defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms, salesRepId: c.salesRepId, salesRepName: c.salesRep.name
    }));
  },

  async getCustomerById(id: string): Promise<CustomerItem | undefined> {
    const c = await prisma.customer.findUnique({ where: { id }, include: { salesRep: true } });
    if (!c) return undefined;
    return {
      id: c.id, customerType: customerTypeFromDatabase(c.customerType), name: c.name, taxId: c.taxId || undefined,
      phone: c.phone, address: c.address || undefined, defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms, salesRepId: c.salesRepId, salesRepName: c.salesRep.name
    };
  },

  async getUserById(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    return user?.email.startsWith("preview-") ? null : user;
  },

  async getLoginUsers() {
    return prisma.user.findMany({
      where: { NOT: { email: { startsWith: "preview-" } } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
  },

  async getProjects(): Promise<ProjectDetail[]> {
    const projects = await prisma.project.findMany({
      relationLoadStrategy: "join",
      include: projectInclude,
      orderBy: { createdAt: "desc" }
    });
    return projects.map(p => ({
      id: p.id, projectName: p.projectName, customerId: p.customerId, customerName: p.customer.name,
      customerType: customerTypeFromDatabase(p.customer.customerType), defaultDiscount: Number(p.customer.defaultDiscount),
      siteAddress: p.siteAddress, siteCondition: p.siteCondition || undefined,
      salesRepId: p.salesRepId, salesRepName: p.salesRep.name,
      customerSalesRepId: p.customer.salesRepId,
      customerSalesRepName: p.customer.salesRep.name,
      salesAssistantId: p.salesAssistantId || undefined, salesAssistantName: p.salesAssistant?.name,
      currentStage: p.currentStage, isDelayed: p.isDelayed,
      expectedDate: dateValue(p.expectedDate),
      estimatedBudget: p.estimatedBudget ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount || undefined, cost: p.cost ? Number(p.cost) : undefined, quoteAmount: p.quoteAmount ? Number(p.quoteAmount) : undefined
    }));
  },

  async getProjectById(
    id: string,
    options?: { evaluateSchedule?: boolean }
  ): Promise<ProjectDetail | undefined> {
    const p = await prisma.project.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      include: projectInclude,
    });
    if (!p) return undefined;
    const project = {
      id: p.id, projectName: p.projectName, customerId: p.customerId, customerName: p.customer.name,
      customerType: customerTypeFromDatabase(p.customer.customerType), defaultDiscount: Number(p.customer.defaultDiscount),
      siteAddress: p.siteAddress, siteCondition: p.siteCondition || undefined,
      salesRepId: p.salesRepId, salesRepName: p.salesRep.name,
      customerSalesRepId: p.customer.salesRepId,
      customerSalesRepName: p.customer.salesRep.name,
      salesAssistantId: p.salesAssistantId || undefined, salesAssistantName: p.salesAssistant?.name,
      currentStage: p.currentStage, isDelayed: p.isDelayed,
      expectedDate: dateValue(p.expectedDate),
      estimatedBudget: p.estimatedBudget ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount || undefined, cost: p.cost ? Number(p.cost) : undefined, quoteAmount: p.quoteAmount ? Number(p.quoteAmount) : undefined
    };
    if (options?.evaluateSchedule === false) return project;
    const milestones = await this.getMilestonesByProjectId(id);
    const evaluated = ScheduleEngine.evaluateMilestones(milestones);
    return { ...project, isDelayed: project.isDelayed || evaluated.isDelayed };
  },

  async addProject(data: {
    projectName: string; customerId: string; siteAddress: string; siteCondition?: string;
    expectedDate?: string; unitCount?: number; cost?: number; quoteAmount?: number;
  }): Promise<ProjectDetail | undefined> {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) return undefined;

    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          projectName: data.projectName, customerId: data.customerId, siteAddress: data.siteAddress,
          siteCondition: data.siteCondition, salesRepId: customer.salesRepId,
          currentStage: ProjectStage.CONTACT, expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
          unitCount: data.unitCount, cost: data.cost, quoteAmount: data.quoteAmount, estimatedBudget: data.quoteAmount || data.cost,
        },
      });
      const allCodes: MilestoneStageCode[] = ["1-1","1-2","1-3","1-4","1-5","2-1","2-2","2-3","2-4","3-1","3-2","3-3","3-4","3-5"];
      let cursorDate = new Date();
      await tx.projectMilestone.createMany({
        data: allCodes.map((code, index) => {
          const planned = new Date(cursorDate);
          planned.setDate(planned.getDate() + MILESTONE_DEFAULT_DAYS[code]);
          cursorDate = planned;
          return {
            projectId: p.id, stageCode: code, phase: STAGE_CODE_TO_PHASE[code], stageOrder: index + 1,
            plannedDueDate: planned, status: index === 0 ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING, assignedToId: p.salesRepId,
          };
        }),
      });
      return p;
    });
    return this.getProjectById(created.id);
  },

  async updateProject(id: string, data: {
    projectName?: string; customerId?: string; siteAddress?: string; siteCondition?: string;
    expectedDate?: string; unitCount?: number; cost?: number; quoteAmount?: number;
  }): Promise<ProjectDetail | undefined> {
    await prisma.project.update({
      where: { id },
      data: {
        projectName: data.projectName, customerId: data.customerId, siteAddress: data.siteAddress,
        siteCondition: data.siteCondition || null, expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        unitCount: data.unitCount, cost: data.cost, quoteAmount: data.quoteAmount,
      },
    });
    return this.getProjectById(id);
  },

  async getQuotesByProjectId(projectId: string): Promise<QuotationData[]> {
    const quotes = await prisma.quotation.findMany({ where: { projectId }, orderBy: [{ createdAt: "desc" }, { version: "desc" }] });
    return quotes.map(q => ({
      id: q.id, projectId: q.projectId, version: q.version, externalQuoteNo: q.externalQuoteNo || undefined, quoteFileUrl: q.quoteFileUrl || undefined,
      notes: q.notes || undefined, totalAmount: Number(q.totalAmount), status: q.status as QuotationData["status"],
      createdAt: q.createdAt.toISOString(), updatedAt: q.updatedAt.toISOString(),
    }));
  },

  async getLatestQuotesByProjectIds(projectIds: string[]): Promise<Record<string, QuotationData>> {
    const quotes = await prisma.quotation.findMany({ where: { projectId: { in: projectIds } }, orderBy: [{ createdAt: "desc" }, { version: "desc" }] });
    const result: Record<string, QuotationData> = {};
    for (const q of quotes) {
      if (!result[q.projectId]) result[q.projectId] = {
        id: q.id, projectId: q.projectId, version: q.version, externalQuoteNo: q.externalQuoteNo || undefined, quoteFileUrl: q.quoteFileUrl || undefined,
        notes: q.notes || undefined, totalAmount: Number(q.totalAmount), status: q.status as QuotationData["status"],
        createdAt: q.createdAt.toISOString(), updatedAt: q.updatedAt.toISOString(),
      };
    }
    return result;
  },

  async getMilestonesByProjectIds(projectIds: string[]): Promise<Record<string, ProjectMilestoneItem[]>> {
    if (projectIds.length === 0) return {};
    const ms = await prisma.projectMilestone.findMany({
      where: { projectId: { in: projectIds } },
      relationLoadStrategy: "join",
      include: milestoneInclude,
      orderBy: { stageOrder: "asc" },
    });
    const result: Record<string, ProjectMilestoneItem[]> = {};
    for (const m of ms) {
      const list = result[m.projectId] || [];
      list.push({
        id: m.id, projectId: m.projectId, stageCode: m.stageCode as MilestoneStageCode, phase: m.phase as MilestonePhaseDTO, stageOrder: m.stageOrder,
        plannedDueDate: dateOnlyValue(m.plannedDueDate), actualDueDate: dateOnlyValue(m.actualDueDate), status: m.status,
        priority: m.priority,
        assignedToId: m.assignedToId || m.project.customer.salesRepId,
        assignedToName: m.assignedTo?.name || m.project.customer.salesRep.name,
        attachments: m.attachments, notes: m.notes,
      });
      result[m.projectId] = list;
    }
    return Object.fromEntries(Object.entries(result).map(([pid, list]) => [pid, ScheduleEngine.evaluateMilestones(list).milestones]));
  },

  async getMilestonesByProjectId(projectId: string): Promise<ProjectMilestoneItem[]> {
    const result = await this.getMilestonesByProjectIds([projectId]);
    return result[projectId] || [];
  },

  async updateMilestone(projectId: string, milestoneId: string, updates: Partial<ProjectMilestoneItem>) {
    await prisma.$transaction(async (tx) => {
      const milestone = await tx.projectMilestone.update({
        where: { id: milestoneId, projectId },
        data: {
          plannedDueDate: updates.plannedDueDate ? new Date(updates.plannedDueDate) : updates.plannedDueDate === null ? null : undefined,
          actualDueDate: updates.actualDueDate ? new Date(updates.actualDueDate) : updates.actualDueDate === null ? null : undefined,
          status: updates.status,
          priority: updates.priority,
          assignedToId: updates.assignedToId,
          attachments: updates.attachments,
          notes: updates.notes,
        },
      });

      if (updates.assignedToId !== undefined) {
        if (!updates.assignedToId) {
          await tx.salesTask.deleteMany({ where: { milestoneId } });
        } else {
          const existingTask = await tx.salesTask.findUnique({ where: { milestoneId } });
          const isCompleted = milestone.status === MilestoneStatus.COMPLETED;
          const assigneeChanged = existingTask && existingTask.assignedToId !== updates.assignedToId;
          await tx.salesTask.upsert({
            where: { milestoneId },
            create: {
              projectId,
              milestoneId,
              assignedToId: updates.assignedToId,
              taskType: milestone.phase === "DESIGN" ? TaskType.DRAWING : TaskType.SITE_VISIT,
              subject: MILESTONE_STAGE_LABELS[milestone.stageCode as MilestoneStageCode],
              dueDatetime: milestone.plannedDueDate || new Date(),
              priority: milestone.priority,
              isCompleted,
              completedAt: isCompleted ? milestone.actualDueDate || new Date() : null,
            },
            update: {
              assignedToId: updates.assignedToId,
              taskType: milestone.phase === "DESIGN" ? TaskType.DRAWING : TaskType.SITE_VISIT,
              subject: MILESTONE_STAGE_LABELS[milestone.stageCode as MilestoneStageCode],
              dueDatetime: milestone.plannedDueDate || new Date(),
              priority: milestone.priority,
              isCompleted: isCompleted || (
                existingTask?.isCompleted === true &&
                existingTask.assignedToId === updates.assignedToId
              ),
              ...(isCompleted
                ? { completedAt: milestone.actualDueDate || new Date() }
                : assigneeChanged
                  ? { completedAt: null, resultNotes: null }
                  : {}),
            },
          });
        }
      }
      if (updates.priority !== undefined) {
        await tx.salesTask.updateMany({
          where: { milestoneId },
          data: { priority: updates.priority as TaskPriority },
        });
      }
    });
    return (await this.getMilestonesByProjectId(projectId)).find(m => m.id === milestoneId);
  },

  async advanceMilestone(projectId: string, milestoneId: string, options?: { notes?: string; attachments?: string; completedDate?: string }) {
    const list = await this.getMilestonesByProjectId(projectId);
    const result = ScheduleEngine.advanceMilestone(list, milestoneId, options);
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    for (const milestone of result.updatedMilestones) {
      operations.push(prisma.projectMilestone.update({
        where: { id: milestone.id },
        data: {
          status: milestone.status,
          actualDueDate: milestone.actualDueDate ? new Date(milestone.actualDueDate) : null,
          notes: milestone.notes,
          attachments: milestone.attachments,
        },
      }));
      if (milestone.id === milestoneId) {
        operations.push(prisma.salesTask.updateMany({
          where: { milestoneId },
          data: {
            isCompleted: true,
            completedAt: milestone.actualDueDate ? new Date(milestone.actualDueDate) : new Date(),
            resultNotes: milestone.notes || null,
          },
        }));
      }
    }
    operations.push(prisma.project.update({
      where: { id: projectId },
      data: { currentStage: result.newCurrentStage as ProjectStage, isDelayed: result.isProjectDelayed },
    }));
    await prisma.$transaction(operations);
    return { updatedMilestones: result.updatedMilestones, newStage: result.newCurrentStage, isDelayed: result.isProjectDelayed };
  },

  async rollbackMilestone(projectId: string, milestoneId: string) {
    const milestones = await this.getMilestonesByProjectId(projectId);
    const targetIndex = milestones.findIndex((milestone) => milestone.id === milestoneId);
    if (targetIndex < 0 || milestones[targetIndex].status !== "COMPLETED") {
      throw new Error("找不到已完成的里程碑");
    }
    if (milestones.slice(targetIndex + 1).some((milestone) => milestone.status === "COMPLETED")) {
      throw new Error("請由最後一個已完成的里程碑開始回退");
    }
    const target = milestones[targetIndex];
    const next = milestones[targetIndex + 1];
    const stage = STAGE_CODE_TO_PROJECT_STAGE[target.stageCode] as ProjectStage;

    await prisma.$transaction(async (tx) => {
      await tx.projectMilestone.update({
        where: { id: target.id },
        data: { status: MilestoneStatus.IN_PROGRESS, actualDueDate: null },
      });
      if (next && next.status !== "COMPLETED") {
        await tx.projectMilestone.update({
          where: { id: next.id },
          data: { status: MilestoneStatus.PENDING },
        });
      }
      await tx.salesTask.updateMany({
        where: { milestoneId: target.id },
        data: { isCompleted: false, completedAt: null },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { currentStage: stage, isDelayed: false },
      });
    });

    const updatedMilestones = await this.getMilestonesByProjectId(projectId);
    const { isDelayed } = ScheduleEngine.evaluateMilestones(updatedMilestones);
    await prisma.project.update({ where: { id: projectId }, data: { isDelayed } });
    return updatedMilestones;
  },

  async advanceProjectToSpecialStage(projectId: string, stageCode: "X-1" | "X-2", reason: string) {
    const currentStage = STAGE_CODE_TO_PROJECT_STAGE[stageCode] as ProjectStage;
    const actualDueDate = new Date();
    const plannedDueDate = new Date(actualDueDate);
    plannedDueDate.setDate(plannedDueDate.getDate() + MILESTONE_DEFAULT_DAYS[stageCode]);
    const isWrapUp = stageCode === "X-1";

    await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { customer: { select: { salesRepId: true } } },
      });
      if (!project) throw new Error("查無此案場資料");

      const existingMilestone = await tx.projectMilestone.findFirst({
        where: { projectId, stageCode },
      });
      const stageOrder = existingMilestone
        ? existingMilestone.stageOrder
        : ((await tx.projectMilestone.aggregate({
            where: { projectId },
            _max: { stageOrder: true },
          }))._max.stageOrder || 0) + 1;

      if (existingMilestone) {
        await tx.projectMilestone.update({
          where: { id: existingMilestone.id },
          data: {
            status: isWrapUp ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.COMPLETED,
            plannedDueDate: isWrapUp ? plannedDueDate : undefined,
            actualDueDate: isWrapUp ? null : actualDueDate,
            notes: reason,
            assignedToId: existingMilestone.assignedToId || project.customer.salesRepId,
          },
        });
      } else {
        await tx.projectMilestone.create({
          data: {
            projectId,
            stageCode,
            phase: STAGE_CODE_TO_PHASE[stageCode],
            stageOrder,
            status: isWrapUp ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.COMPLETED,
            plannedDueDate: isWrapUp ? plannedDueDate : null,
            actualDueDate: isWrapUp ? null : actualDueDate,
            notes: reason,
            assignedToId: project.customer.salesRepId,
          },
        });
      }

      await tx.project.update({ where: { id: projectId }, data: { currentStage } });
      if (stageCode === "X-2") {
        await tx.salesTask.updateMany({
          where: { projectId, isCompleted: false },
          data: { isCompleted: true, completedAt: actualDueDate, resultNotes: "流標" },
        });
      }
    });

    return this.getMilestonesByProjectId(projectId);
  },

  async activateLegacyWrapUpMilestone(projectId: string) {
    await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { currentStage: true },
      });
      if (project?.currentStage !== ProjectStage.WRAP_UP) return;

      const milestone = await tx.projectMilestone.findFirst({
        where: { projectId, stageCode: "X-1", status: MilestoneStatus.COMPLETED, plannedDueDate: null },
      });
      if (!milestone) return;

      const plannedDueDate = new Date();
      plannedDueDate.setDate(plannedDueDate.getDate() + MILESTONE_DEFAULT_DAYS["X-1"]);
      await tx.projectMilestone.update({
        where: { id: milestone.id },
        data: {
          status: MilestoneStatus.IN_PROGRESS,
          plannedDueDate,
          actualDueDate: null,
        },
      });
    });

    return this.getMilestonesByProjectId(projectId);
  },

  async completeWrapUpMilestone(
    projectId: string,
    milestoneId: string,
    options: { notes?: string; completedDate: string }
  ) {
    await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { currentStage: true },
      });
      if (!project) {
        throw new Error("查無此案場資料");
      }
      if (project.currentStage !== ProjectStage.WRAP_UP) {
        throw new Error("案件已離開收尾階段");
      }

      const milestone = await tx.projectMilestone.findFirst({
        where: {
          id: milestoneId,
          projectId,
          stageCode: "X-1",
          status: { in: [MilestoneStatus.IN_PROGRESS, MilestoneStatus.OVERDUE] },
        },
      });
      if (!milestone) {
        throw new Error("只能完成目前進行中的收尾項目");
      }

      await tx.projectMilestone.update({
        where: { id: milestone.id },
        data: {
          status: MilestoneStatus.COMPLETED,
          actualDueDate: new Date(options.completedDate),
          notes: options.notes?.trim() || milestone.notes,
        },
      });
    });

    const updatedMilestones = await this.getMilestonesByProjectId(projectId);
    const { isDelayed } = ScheduleEngine.evaluateMilestones(updatedMilestones);
    await prisma.project.update({ where: { id: projectId }, data: { isDelayed } });
    return updatedMilestones;
  },

  async returnProjectToProduction(projectId: string) {
    await prisma.$transaction(async (tx) => {
      const productionMilestones = await tx.projectMilestone.findMany({
        where: { projectId, phase: "PRODUCTION" },
        orderBy: { stageOrder: "asc" },
      });

      const firstIncomplete = productionMilestones.find((milestone) => milestone.status !== MilestoneStatus.COMPLETED);
      const targetMilestone = firstIncomplete || productionMilestones[productionMilestones.length - 1];
      if (!targetMilestone) {
        throw new Error(`Project ${projectId} has no production milestones to resume`);
      }

      for (const milestone of productionMilestones) {
        if (milestone.status === MilestoneStatus.COMPLETED && milestone.id !== targetMilestone?.id) continue;
        await tx.projectMilestone.update({
          where: { id: milestone.id },
          data: {
            status: milestone.id === targetMilestone?.id ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING,
            ...(milestone.id === targetMilestone?.id && milestone.status === MilestoneStatus.COMPLETED
              ? { actualDueDate: null }
              : {}),
          },
        });
      }

      await tx.project.update({
        where: { id: projectId },
        data: { currentStage: ProjectStage.PRODUCTION, isDelayed: false },
      });
    });

    return this.getMilestonesByProjectId(projectId);
  },

  async getTasks(filter?: { projectId?: string; assignedToId?: string; isCompleted?: boolean }): Promise<SalesTaskItem[]> {
    const tasks = await prisma.salesTask.findMany({
      where: {
        ...(filter?.projectId ? { projectId: filter.projectId } : {}),
        ...(filter?.assignedToId ? { assignedToId: filter.assignedToId } : {}),
        ...(filter?.isCompleted !== undefined ? { isCompleted: filter.isCompleted } : {}),
      },
      relationLoadStrategy: "join",
      include: { project: true, assignedTo: true, assignedBy: true }, orderBy: { dueDatetime: "asc" }
    });
    return tasks.map(t => ({
      id: t.id, projectId: t.projectId, projectName: t.project.projectName, assignedToId: t.assignedToId, assignedToName: t.assignedTo.name,
      assignedByName: t.assignedBy?.name || null, milestoneId: t.milestoneId,
      taskType: t.taskType, subject: t.subject, dueDatetime: t.dueDatetime.toISOString(), priority: t.priority,
      isCompleted: t.isCompleted, resultNotes: t.resultNotes, completedAt: dateValue(t.completedAt) || null,
    }));
  },

  async getLatestTasksByProjectIds(projectIds: string[]): Promise<Record<string, SalesTaskItem>> {
    if (projectIds.length === 0) return {};
    const tasks = await prisma.salesTask.findMany({
      where: { projectId: { in: projectIds }, milestoneId: null, isCompleted: false },
      relationLoadStrategy: "join",
      include: { project: true, assignedTo: true, assignedBy: true },
      orderBy: { createdAt: "desc" },
    });
    const result: Record<string, SalesTaskItem> = {};
    for (const task of tasks) {
      if (!result[task.projectId]) {
        result[task.projectId] = {
          id: task.id, projectId: task.projectId, projectName: task.project.projectName,
          assignedToId: task.assignedToId, assignedToName: task.assignedTo.name,
          assignedByName: task.assignedBy?.name || null, milestoneId: task.milestoneId,
          taskType: task.taskType, subject: task.subject, dueDatetime: task.dueDatetime.toISOString(),
          priority: task.priority, isCompleted: task.isCompleted, resultNotes: task.resultNotes,
          completedAt: dateValue(task.completedAt) || null,
        };
      }
    }
    return result;
  },

  async updateTask(id: string, data: { assignedToId: string; subject: string; priority: TaskPriority; dueDatetime: string }): Promise<SalesTaskItem | null> {
    const existing = await prisma.salesTask.findUnique({ where: { id } });
    if (!existing || existing.milestoneId) return null;
    const task = await prisma.salesTask.update({
      where: { id },
      data: { assignedToId: data.assignedToId, subject: data.subject, priority: data.priority, dueDatetime: new Date(data.dueDatetime) },
      include: { project: true, assignedTo: true, assignedBy: true },
    });
    return {
      id: task.id, projectId: task.projectId, projectName: task.project.projectName,
      assignedToId: task.assignedToId, assignedToName: task.assignedTo.name,
      assignedByName: task.assignedBy?.name || null, milestoneId: task.milestoneId,
      taskType: task.taskType, subject: task.subject, dueDatetime: task.dueDatetime.toISOString(),
      priority: task.priority, isCompleted: task.isCompleted, resultNotes: task.resultNotes,
      completedAt: dateValue(task.completedAt) || null,
    };
  },

  async addTask(data: Omit<SalesTaskItem, "id" | "projectName" | "assignedToName" | "assignedByName" | "milestoneId"> & { assignedToName?: string; assignedById?: string }): Promise<SalesTaskItem> {
    const task = await prisma.salesTask.create({
      data: {
        projectId: data.projectId, assignedToId: data.assignedToId, assignedById: data.assignedById, taskType: data.taskType as TaskType, subject: data.subject,
        dueDatetime: new Date(data.dueDatetime), priority: data.priority as TaskPriority, isCompleted: data.isCompleted,
        resultNotes: data.resultNotes, completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      },
      include: { project: true, assignedTo: true, assignedBy: true },
    });
    return {
      id: task.id, projectId: task.projectId, projectName: task.project.projectName, assignedToId: task.assignedToId, assignedToName: task.assignedTo.name,
      assignedByName: task.assignedBy?.name || null, milestoneId: task.milestoneId,
      taskType: task.taskType, subject: task.subject, dueDatetime: task.dueDatetime.toISOString(), priority: task.priority,
      isCompleted: task.isCompleted, resultNotes: task.resultNotes, completedAt: dateValue(task.completedAt) || null,
    };
  },

  async addCustomer(data: CustomerCreateDTO) {
    const c = await prisma.customer.create({ data: { ...data, paymentTerms: data.paymentTerms || "MONTHLY_30", customerType: customerTypeForDatabase(data.customerType || "DESIGNER") } });
    return this.getCustomerById(c.id);
  },

  async updateCustomer(id: string, data: CustomerUpdateDTO) {
    await prisma.customer.update({
      where: { id },
      data: {
        name: data.name, customerType: customerTypeForDatabase(data.customerType), taxId: data.taxId || null,
        phone: data.phone, address: data.address || null, defaultDiscount: data.defaultDiscount,
        paymentTerms: data.paymentTerms as PaymentTerms, salesRepId: data.salesRepId,
      },
    });
    return this.getCustomerById(id);
  },

  async addQuoteVersion(projectId: string, data: QuoteVersionCreateDTO) {
    return prisma.quotation.create({ data: { projectId, ...data } });
  },

  async updateProjectStage(projectId: string, currentStage: ProjectStage) {
    return prisma.project.update({ where: { id: projectId }, data: { currentStage } });
  },

  async evaluateAllSchedules() {
    return { alerts: [] }; // Mock for now
  },

  async toggleTaskComplete(taskId: string, isCompleted: boolean, resultNotes?: string, completedAt?: string) {
    const taskBeforeUpdate = await prisma.salesTask.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, milestoneId: true, isCompleted: true },
    });
    if (!taskBeforeUpdate) return null;

    if (taskBeforeUpdate.milestoneId) {
      if (!isCompleted) {
        throw new Error("里程碑待辦請由案件細節執行回退");
      }
      if (!taskBeforeUpdate.isCompleted) {
        const project = await prisma.project.findUnique({
          where: { id: taskBeforeUpdate.projectId },
          select: { currentStage: true },
        });
        if (project?.currentStage === "WRAP_UP" || project?.currentStage === "LOST") {
          throw new Error("案件已進入額外階段，無法完成一般里程碑");
        }
        await this.advanceMilestone(taskBeforeUpdate.projectId, taskBeforeUpdate.milestoneId, {
          notes: resultNotes,
          completedDate: completedAt,
        });
      }
      return prisma.salesTask.findUnique({ where: { id: taskId } });
    }

    return prisma.salesTask.update({
      where: { id: taskId },
      data: {
        isCompleted,
        completedAt: isCompleted
          ? completedAt ? new Date(`${completedAt}T00:00:00.000Z`) : new Date()
          : null,
        resultNotes: resultNotes || undefined,
      },
    });
  }
};
