import { CustomerType, MilestoneStatus, PaymentTerms, Prisma, ProjectStage, Role, TaskPriority, TaskType } from "@prisma/client";
import { prisma } from "./prisma";
import { getUserByIdCached } from "./access-control";
import type {
  CustomerCreateDTO,
  CustomerDTO as CustomerItem,
  CustomerTypeDTO,
  CustomerUpdateDTO,
  MilestoneDTO as ProjectMilestoneItem,
  MilestonePhaseDTO,
  MilestoneStageCodeDTO as MilestoneStageCode,
  ProjectDTO as ProjectDetail,
  TaskDTO as SalesTaskItem,
} from "@/types/dto";
import {
  AUDIT_STAGE_CODES, MILESTONE_DEFAULT_DAYS, MILESTONE_STAGE_LABELS,
  STANDARD_MILESTONE_STAGE_CODES, STAGE_CODE_TO_PHASE
} from "./constants";
import { ScheduleEngine, STAGE_CODE_TO_PROJECT_STAGE } from "./schedule-engine";
import { NotFoundError, BadRequestError, ConflictError } from "./errors";

const dateValue = (value: Date | null | undefined) => value?.toISOString() || undefined;
const dateOnlyValue = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) || null;

const LOGIN_USERS_TTL_MS = 5 * 60_000;
const APP_CONFIG_TTL_MS = 10 * 60_000;
const globalForDataService = globalThis as unknown as {
  loginUsersCache?: { data: Array<{ id: string; name: string; role: Role }>; expiresAt: number };
  appConfigCache?: Map<string, { value: unknown; expiresAt: number }>;
};
const appConfigCache =
  globalForDataService.appConfigCache ??
  (globalForDataService.appConfigCache = new Map<string, { value: unknown; expiresAt: number }>());

export function invalidateLoginUsersCache() {
  globalForDataService.loginUsersCache = undefined;
}

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
  assignedTo: { select: { name: true } },
  salesTask: { select: { id: true, subject: true, isCompleted: true } },
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

  async getCustomers(): Promise<CustomerItem[]> {
    const customers = await prisma.customer.findMany({
      relationLoadStrategy: "join",
      include: { salesRep: true },
      orderBy: { createdAt: "desc" },
    });
    return customers.map(c => ({
      id: c.id, customerType: customerTypeFromDatabase(c.customerType), name: c.name, taxId: c.taxId || undefined,
      phone: c.phone, address: c.address || undefined, defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms, salesRepId: c.salesRepId, salesRepName: c.salesRep.name
    }));
  },

  async getCustomerById(id: string): Promise<CustomerItem | undefined> {
    const c = await prisma.customer.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      include: { salesRep: true },
    });
    if (!c) return undefined;
    return {
      id: c.id, customerType: customerTypeFromDatabase(c.customerType), name: c.name, taxId: c.taxId || undefined,
      phone: c.phone, address: c.address || undefined, defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms, salesRepId: c.salesRepId, salesRepName: c.salesRep.name
    };
  },

  async getUserById(id: string) {
    return getUserByIdCached(id);
  },

  async getLoginUsers() {
    const cached = globalForDataService.loginUsersCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const users = await prisma.user.findMany({
      where: { NOT: { email: { startsWith: "preview-" } } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    globalForDataService.loginUsersCache = {
      data: users,
      expiresAt: Date.now() + LOGIN_USERS_TTL_MS,
    };
    return users;
  },

  async getProjects(filter?: { where?: Prisma.ProjectWhereInput }): Promise<ProjectDetail[]> {
    const projects = await prisma.project.findMany({
      where: filter?.where,
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
      estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount ?? undefined, cost: p.cost != null ? Number(p.cost) : undefined, quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined
    }));
  },

  async getProjectById(
    id: string,
    options?: { evaluateSchedule?: boolean }
  ): Promise<ProjectDetail | undefined> {
    if (options?.evaluateSchedule !== false) {
      const combined = await this.getProjectWithMilestones(id);
      return combined?.project;
    }
    const p = await prisma.project.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      include: projectInclude,
    });
    if (!p) return undefined;
    return {
      id: p.id, projectName: p.projectName, customerId: p.customerId, customerName: p.customer.name,
      customerType: customerTypeFromDatabase(p.customer.customerType), defaultDiscount: Number(p.customer.defaultDiscount),
      siteAddress: p.siteAddress, siteCondition: p.siteCondition || undefined,
      salesRepId: p.salesRepId, salesRepName: p.salesRep.name,
      customerSalesRepId: p.customer.salesRepId,
      customerSalesRepName: p.customer.salesRep.name,
      salesAssistantId: p.salesAssistantId || undefined, salesAssistantName: p.salesAssistant?.name,
      currentStage: p.currentStage, isDelayed: p.isDelayed,
      expectedDate: dateValue(p.expectedDate),
      estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount ?? undefined, cost: p.cost != null ? Number(p.cost) : undefined, quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined
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
      isDelayed: p.isDelayed || evaluated.isDelayed,
      expectedDate: dateValue(p.expectedDate),
      estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount ?? undefined,
      cost: p.cost != null ? Number(p.cost) : undefined,
      quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
    };
    return { project, milestones: evaluated.milestones };
  },

  async getMilestoneDefaultDays(): Promise<Record<string, number>> {
    return this.getAppConfig<Record<string, number>>("milestone_default_days", MILESTONE_DEFAULT_DAYS);
  },

  async addProject(data: {
    projectName: string; customerId: string; siteAddress: string; siteCondition?: string;
    expectedDate?: string; unitCount?: number; cost?: number; quoteAmount?: number;
  }): Promise<ProjectDetail | undefined> {
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, salesRepId: true },
    });
    if (!customer) return undefined;

    const defaultDays = await this.getMilestoneDefaultDays();
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
        assignedToId: customer.salesRepId,
      };
    });

    const p = await prisma.project.create({
      data: {
        projectName: data.projectName,
        customerId: data.customerId,
        siteAddress: data.siteAddress,
        siteCondition: data.siteCondition,
        salesRepId: customer.salesRepId,
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

  async updateProject(id: string, data: {
    projectName?: string; customerId?: string; siteAddress?: string; siteCondition?: string;
    expectedDate?: string; unitCount?: number | null; cost?: number | null; quoteAmount?: number | null;
    salesAssistantId?: string | null; salesRepId?: string; estimatedBudget?: number | null;
  }): Promise<ProjectDetail | undefined> {
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
    const p = await prisma.project.update({
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
  },


  async getMilestonesByProjectIds(projectIds?: string[]): Promise<Record<string, ProjectMilestoneItem[]>> {
    if (projectIds && projectIds.length === 0) return {};
    const ms = await prisma.projectMilestone.findMany({
      ...(projectIds ? { where: { projectId: { in: projectIds } } } : {}),
      relationLoadStrategy: "join",
      include: milestoneInclude,
      orderBy: { stageOrder: "asc" },
    });
    const result: Record<string, ProjectMilestoneItem[]> = {};
    for (const m of ms) {
      const list = result[m.projectId] || [];
      const isAuditSubmitted = Boolean(
        m.salesTask?.subject.startsWith("【需審核】") &&
        !m.salesTask?.isCompleted &&
        m.status !== "COMPLETED"
      );
      list.push({
        id: m.id, projectId: m.projectId, stageCode: m.stageCode as MilestoneStageCode, phase: m.phase as MilestonePhaseDTO, stageOrder: m.stageOrder,
        plannedDueDate: dateOnlyValue(m.plannedDueDate), actualDueDate: dateOnlyValue(m.actualDueDate), status: m.status,
        priority: m.priority,
        assignedToId: m.assignedToId || m.project.customer.salesRepId,
        assignedToName: m.assignedTo?.name || m.project.customer.salesRep.name,
        attachments: m.attachments, notes: m.notes,
        auditSubmitted: isAuditSubmitted,
      });
      result[m.projectId] = list;
    }
    return Object.fromEntries(Object.entries(result).map(([pid, list]) => [pid, ScheduleEngine.evaluateMilestones(list).milestones]));
  },

  async getMilestonesByProjectId(projectId: string): Promise<ProjectMilestoneItem[]> {
    const result = await this.getMilestonesByProjectIds([projectId]);
    return result[projectId] || [];
  },

  async ensureProjectMilestones(projectId: string) {
    const existing = await prisma.projectMilestone.findMany({
      where: { projectId },
      select: { id: true, stageCode: true, stageOrder: true, phase: true, plannedDueDate: true },
    });
    const existingCodes = new Set(existing.map((milestone) => milestone.stageCode));
    const missingCodes = STANDARD_MILESTONE_STAGE_CODES.filter((code) => !existingCodes.has(code));
    if (missingCodes.length === 0) return;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { salesRepId: true },
    });
    if (!project) throw new Error("查無此案場資料");

    const defaultDays = await this.getMilestoneDefaultDays();

    // 建立現有子進度之預定完成日對照表
    const dateByCode = new Map<string, Date>();
    for (const m of existing) {
      if (m.plannedDueDate) {
        dateByCode.set(m.stageCode, new Date(m.plannedDueDate));
      }
    }

    // 依 STANDARD_MILESTONE_STAGE_CODES 標準順序推算缺失進度的預定完成日（以前置項目的預定日為基準累加）
    for (let i = 0; i < STANDARD_MILESTONE_STAGE_CODES.length; i++) {
      const code = STANDARD_MILESTONE_STAGE_CODES[i];
      if (!dateByCode.has(code)) {
        let prevDate: Date | null = null;
        for (let j = i - 1; j >= 0; j--) {
          const prevCode = STANDARD_MILESTONE_STAGE_CODES[j];
          if (dateByCode.has(prevCode)) {
            prevDate = new Date(dateByCode.get(prevCode)!);
            break;
          }
        }
        const baseDate = prevDate || new Date();
        const days = Number(defaultDays[code]) || MILESTONE_DEFAULT_DAYS[code] || 3;
        const targetDate = new Date(baseDate);
        targetDate.setDate(targetDate.getDate() + days);
        dateByCode.set(code, targetDate);
      }
    }

    const newRows = missingCodes.map((code) => {
      const stdIndex = STANDARD_MILESTONE_STAGE_CODES.indexOf(code);
      return {
        projectId,
        stageCode: code,
        phase: STAGE_CODE_TO_PHASE[code] || "DEVELOP",
        stageOrder: stdIndex !== -1 ? stdIndex + 1 : 99,
        plannedDueDate: dateByCode.get(code) || new Date(),
        status: MilestoneStatus.PENDING,
        assignedToId: project.salesRepId,
      };
    });

    await prisma.projectMilestone.createMany({
      data: newRows,
      skipDuplicates: true,
    });

    // 重新依標準順序排列，僅針對順序或階段不符的項目進行批次更新
    const all = await prisma.projectMilestone.findMany({
      where: { projectId },
      select: { id: true, stageCode: true, stageOrder: true, phase: true },
    });
    all.sort((a, b) => {
      const idxA = STANDARD_MILESTONE_STAGE_CODES.indexOf(a.stageCode as MilestoneStageCode);
      const idxB = STANDARD_MILESTONE_STAGE_CODES.indexOf(b.stageCode as MilestoneStageCode);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return a.stageOrder - b.stageOrder;
    });

    const updates = all
      .map((item, idx) => {
        const targetOrder = idx + 1;
        const targetPhase = STAGE_CODE_TO_PHASE[item.stageCode as MilestoneStageCode] || "DEVELOP";
        if (item.stageOrder !== targetOrder || item.phase !== targetPhase) {
          return prisma.projectMilestone.update({
            where: { id: item.id },
            data: { stageOrder: targetOrder, phase: targetPhase },
          });
        }
        return null;
      })
      .filter((op): op is ReturnType<typeof prisma.projectMilestone.update> => op !== null);

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }
  },

  async submitMilestoneForReview(
    projectId: string,
    milestoneId: string,
    submittedById: string,
    reviewerId: string,
    notes?: string,
    existingMilestones?: ProjectMilestoneItem[],
  ) {
    const milestone = existingMilestones
      ? existingMilestones.find((m) => m.id === milestoneId)
      : await prisma.projectMilestone.findFirst({
          where: { id: milestoneId, projectId },
          select: { stageCode: true, status: true, priority: true, plannedDueDate: true },
        });
    if (!milestone) throw new NotFoundError("找不到此里程碑");
    if (!AUDIT_STAGE_CODES.has(milestone.stageCode)) {
      throw new BadRequestError("此里程碑不需要審核");
    }
    if (
      milestone.status !== MilestoneStatus.IN_PROGRESS &&
      milestone.status !== MilestoneStatus.OVERDUE
    ) {
      throw new ConflictError("只能提交目前進行中的審核項目");
    }

    const dueDatetime = milestone.plannedDueDate
      ? new Date(milestone.plannedDueDate)
      : new Date(Date.now() + 2 * 86400000);

    await prisma.salesTask.upsert({
      where: { milestoneId },
      create: {
        projectId,
        milestoneId,
        assignedToId: reviewerId,
        assignedById: submittedById,
        taskType: TaskType.DRAWING,
        subject: `【需審核】${MILESTONE_STAGE_LABELS[milestone.stageCode as MilestoneStageCode]}`,
        dueDatetime,
        priority: TaskPriority.HIGH,
        isCompleted: false,
        resultNotes: notes || null,
      },
      update: {
        assignedToId: reviewerId,
        assignedById: submittedById,
        subject: `【需審核】${MILESTONE_STAGE_LABELS[milestone.stageCode as MilestoneStageCode]}`,
        dueDatetime,
        priority: TaskPriority.HIGH,
        isCompleted: false,
        completedAt: null,
        resultNotes: notes || null,
      },
    });
  },

  async getMilestoneStageCode(projectId: string, milestoneId: string) {
    const milestone = await prisma.projectMilestone.findFirst({
      where: { projectId, id: milestoneId },
      select: { stageCode: true },
    });
    return milestone?.stageCode;
  },

  async updateMilestone(
    projectId: string,
    milestoneId: string,
    updates: Partial<ProjectMilestoneItem>,
    existingMilestones?: ProjectMilestoneItem[],
    customerSalesRep?: { id: string; name: string },
  ) {
    const currentMilestone = existingMilestones
      ? existingMilestones.find((m) => m.id === milestoneId)
      : await prisma.projectMilestone.findFirst({
          where: { id: milestoneId, projectId },
          select: { status: true, stageCode: true, phase: true, plannedDueDate: true, actualDueDate: true, priority: true, assignedToId: true },
        });
    if (!currentMilestone) {
      throw new NotFoundError("找不到此里程碑");
    }
    if (currentMilestone.status === MilestoneStatus.COMPLETED) {
      throw new ConflictError("已完成的里程碑不可編輯");
    }

    const milestonePromise = prisma.projectMilestone.update({
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
      include: {
        assignedTo: { select: { name: true } },
        salesTask: { select: { id: true, subject: true, isCompleted: true } },
      },
    });

    const taskPromise = (async () => {
      if (updates.assignedToId !== undefined) {
        if (!updates.assignedToId) {
          await prisma.salesTask.deleteMany({ where: { milestoneId } });
          return;
        }
        const auditSubmissionPending = Boolean(
          existingMilestones &&
          "auditSubmitted" in currentMilestone &&
          currentMilestone.auditSubmitted
        );
        if (!auditSubmissionPending) {
          const nextDue =
            updates.plannedDueDate !== undefined
              ? updates.plannedDueDate
                ? new Date(updates.plannedDueDate)
                : new Date()
              : currentMilestone.plannedDueDate
                ? new Date(currentMilestone.plannedDueDate)
                : new Date();
          const nextPriority = (updates.priority ?? currentMilestone.priority) as TaskPriority;
          const assigneeChanged = currentMilestone.assignedToId !== updates.assignedToId;
          await prisma.salesTask.upsert({
            where: { milestoneId },
            create: {
              projectId,
              milestoneId,
              assignedToId: updates.assignedToId,
              taskType: currentMilestone.phase === "DESIGN" ? TaskType.DRAWING : TaskType.SITE_VISIT,
              subject: MILESTONE_STAGE_LABELS[currentMilestone.stageCode as MilestoneStageCode],
              dueDatetime: nextDue,
              priority: nextPriority,
              isCompleted: false,
              completedAt: null,
            },
            update: {
              assignedToId: updates.assignedToId,
              taskType: currentMilestone.phase === "DESIGN" ? TaskType.DRAWING : TaskType.SITE_VISIT,
              subject: MILESTONE_STAGE_LABELS[currentMilestone.stageCode as MilestoneStageCode],
              dueDatetime: nextDue,
              priority: nextPriority,
              ...(assigneeChanged ? { isCompleted: false, completedAt: null, resultNotes: null } : {}),
            },
          });
          return;
        }
      }
      if (updates.priority !== undefined) {
        await prisma.salesTask.updateMany({
          where: { milestoneId },
          data: { priority: updates.priority as TaskPriority },
        });
      }
    })();

    const [updatedRow] = await Promise.all([milestonePromise, taskPromise]);

    if (existingMilestones && customerSalesRep) {
      const updatedList = existingMilestones.map((m) =>
        m.id === milestoneId
          ? {
              ...m,
              plannedDueDate: dateOnlyValue(updatedRow.plannedDueDate),
              actualDueDate: dateOnlyValue(updatedRow.actualDueDate),
              status: updatedRow.status,
              priority: updatedRow.priority,
              assignedToId: updatedRow.assignedToId || customerSalesRep.id,
              assignedToName: updatedRow.assignedTo?.name || customerSalesRep.name,
              attachments: updatedRow.attachments,
              notes: updatedRow.notes,
            }
          : m
      );
      const evaluated = ScheduleEngine.evaluateMilestones(updatedList).milestones;
      return evaluated.find((m) => m.id === milestoneId);
    }

    return (await this.getMilestonesByProjectId(projectId)).find(m => m.id === milestoneId);
  },

  async advanceMilestone(
    projectId: string,
    milestoneId: string,
    options?: { notes?: string; attachments?: string; completedDate?: string },
    existingMilestones?: ProjectMilestoneItem[]
  ) {
    const list = existingMilestones ?? await this.getMilestonesByProjectId(projectId);
    const originalById = new Map(list.map((m) => [m.id, m]));
    const result = ScheduleEngine.advanceMilestone(list, milestoneId, options);
    const operations: Promise<unknown>[] = [];
    for (const milestone of result.updatedMilestones) {
      const orig = originalById.get(milestone.id);
      const hasChanged =
        !orig ||
        orig.status !== milestone.status ||
        orig.actualDueDate !== milestone.actualDueDate ||
        orig.plannedDueDate !== milestone.plannedDueDate ||
        orig.notes !== milestone.notes ||
        orig.attachments !== milestone.attachments;
      if (hasChanged) {
        operations.push(prisma.projectMilestone.update({
          where: { id: milestone.id },
          data: {
            status: milestone.status,
            plannedDueDate: milestone.plannedDueDate ? new Date(`${milestone.plannedDueDate.slice(0, 10)}T00:00:00.000Z`) : null,
            actualDueDate: milestone.actualDueDate ? new Date(milestone.actualDueDate) : null,
            notes: milestone.notes,
            attachments: milestone.attachments,
          },
        }));
        if (orig && orig.plannedDueDate !== milestone.plannedDueDate && milestone.plannedDueDate) {
          operations.push(prisma.salesTask.updateMany({
            where: { milestoneId: milestone.id, isCompleted: false },
            data: {
              dueDatetime: new Date(`${milestone.plannedDueDate.slice(0, 10)}T00:00:00.000Z`),
            },
          }));
        }
      }
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
    await Promise.all(operations);
    return { updatedMilestones: result.updatedMilestones, newStage: result.newCurrentStage, isDelayed: result.isProjectDelayed };
  },

  async setMilestoneCompletion(
    projectId: string,
    milestoneId: string,
    isCompleted: boolean,
    completedDate: string,
    notes?: string,
    existingMilestones?: ProjectMilestoneItem[]
  ) {
    const milestones = existingMilestones ?? await this.getMilestonesByProjectId(projectId);
    const targetIndex = milestones.findIndex((milestone) => milestone.id === milestoneId);
    if (targetIndex < 0) {
      throw new NotFoundError("找不到此里程碑");
    }
    const target = milestones[targetIndex];

    const targetStatus = isCompleted ? MilestoneStatus.COMPLETED : MilestoneStatus.IN_PROGRESS;
    const targetChanged = target.status !== targetStatus;
    const nextNotes = isCompleted && notes?.trim() ? notes.trim() : target.notes;

    // 若正規進度實際完成日早於預定完成日，計算提前天數；若取消完成則還原天數
    const isRegularStage = !["X-1", "X-2"].includes(target.stageCode);
    let daysSaved = 0;
    if (isCompleted && targetChanged && isRegularStage && target.plannedDueDate && completedDate) {
      const [py, pm, pd] = target.plannedDueDate.slice(0, 10).split("-").map(Number);
      const [ay, am, ad] = completedDate.slice(0, 10).split("-").map(Number);
      const diffDays = Math.round((Date.UTC(py, pm - 1, pd) - Date.UTC(ay, am - 1, ad)) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        daysSaved = diffDays;
      }
    } else if (!isCompleted && targetChanged && isRegularStage && target.plannedDueDate && target.actualDueDate) {
      const [py, pm, pd] = target.plannedDueDate.slice(0, 10).split("-").map(Number);
      const [ay, am, ad] = target.actualDueDate.slice(0, 10).split("-").map(Number);
      const diffDays = Math.round((Date.UTC(py, pm - 1, pd) - Date.UTC(ay, am - 1, ad)) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        daysSaved = -diffDays;
      }
    }

    const nextMilestones = milestones.map((milestone, idx) => {
      if (milestone.id === milestoneId) {
        return {
          ...milestone,
          actualDueDate: targetChanged
            ? isCompleted
              ? completedDate
              : null
            : milestone.actualDueDate,
          status: targetStatus,
          notes: nextNotes,
        };
      }
      if (
        daysSaved !== 0 &&
        idx > targetIndex &&
        milestone.status !== MilestoneStatus.COMPLETED &&
        !["X-1", "X-2"].includes(milestone.stageCode) &&
        milestone.plannedDueDate
      ) {
        const [iy, im, id] = milestone.plannedDueDate.slice(0, 10).split("-").map(Number);
        const nextPlanned = new Date(Date.UTC(iy, im - 1, id));
        nextPlanned.setUTCDate(nextPlanned.getUTCDate() - daysSaved);
        return {
          ...milestone,
          plannedDueDate: nextPlanned.toISOString().slice(0, 10),
        };
      }
      return milestone;
    });

    const firstIncomplete = nextMilestones.find((milestone) => milestone.status !== MilestoneStatus.COMPLETED);
    const currentStage = firstIncomplete
      ? STAGE_CODE_TO_PROJECT_STAGE[firstIncomplete.stageCode] as ProjectStage
      : target.stageCode === "X-1" ? ProjectStage.WRAP_UP : ProjectStage.DONE;
    const evaluated = ScheduleEngine.evaluateMilestones(nextMilestones);

    const operations: Promise<unknown>[] = [
      prisma.project.update({
        where: { id: projectId },
        data: { currentStage, isDelayed: evaluated.isDelayed },
      }),
    ];
    if (targetChanged) {
      operations.push(
        prisma.projectMilestone.update({
          where: { id: milestoneId, projectId },
          data: {
            status: targetStatus,
            actualDueDate: isCompleted ? new Date(`${completedDate}T00:00:00.000Z`) : null,
            ...(isCompleted && notes?.trim() ? { notes: notes.trim() } : {}),
          },
        }),
        prisma.salesTask.updateMany({
          where: { milestoneId },
          data: {
            isCompleted,
            completedAt: isCompleted ? new Date(`${completedDate}T00:00:00.000Z`) : null,
            ...(isCompleted && notes?.trim() ? { resultNotes: notes.trim() } : {}),
          },
        })
      );
      if (daysSaved !== 0) {
        for (let i = targetIndex + 1; i < nextMilestones.length; i++) {
          const m = nextMilestones[i];
          const orig = milestones[i];
          if (m.plannedDueDate !== orig.plannedDueDate && m.plannedDueDate) {
            operations.push(
              prisma.projectMilestone.update({
                where: { id: m.id, projectId },
                data: {
                  plannedDueDate: new Date(`${m.plannedDueDate}T00:00:00.000Z`),
                },
              }),
              prisma.salesTask.updateMany({
                where: { milestoneId: m.id, isCompleted: false },
                data: {
                  dueDatetime: new Date(`${m.plannedDueDate}T00:00:00.000Z`),
                },
              })
            );
          }
        }
      }
    }

    await Promise.all(operations);
    return evaluated.milestones;
  },

  async rollbackMilestone(projectId: string, milestoneId: string, existingMilestones?: ProjectMilestoneItem[]) {
    const milestones = existingMilestones ?? await this.getMilestonesByProjectId(projectId);
    const targetIndex = milestones.findIndex((milestone) => milestone.id === milestoneId);
    if (targetIndex < 0 || milestones[targetIndex].status !== "COMPLETED") {
      throw new NotFoundError("找不到已完成的里程碑");
    }
    if (milestones.slice(targetIndex + 1).some((milestone) => milestone.status === "COMPLETED")) {
      throw new ConflictError("請由最後一個已完成的里程碑開始回退");
    }
    const target = milestones[targetIndex];
    const next = milestones[targetIndex + 1];
    const stage = STAGE_CODE_TO_PROJECT_STAGE[target.stageCode] as ProjectStage;

    const isRegularStage = !["X-1", "X-2"].includes(target.stageCode);
    let daysToRestore = 0;
    if (isRegularStage && target.plannedDueDate && target.actualDueDate) {
      const [py, pm, pd] = target.plannedDueDate.slice(0, 10).split("-").map(Number);
      const [ay, am, ad] = target.actualDueDate.slice(0, 10).split("-").map(Number);
      const diffDays = Math.round((Date.UTC(py, pm - 1, pd) - Date.UTC(ay, am - 1, ad)) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        daysToRestore = diffDays;
      }
    }

    const updatedList = milestones.map((m, idx) => {
      let updated = { ...m };
      if (idx === targetIndex) {
        updated.status = MilestoneStatus.IN_PROGRESS;
        updated.actualDueDate = null;
      } else if (idx === targetIndex + 1 && m.status !== "COMPLETED") {
        updated.status = MilestoneStatus.PENDING;
      }
      if (
        daysToRestore > 0 &&
        idx > targetIndex &&
        m.status !== "COMPLETED" &&
        !["X-1", "X-2"].includes(m.stageCode) &&
        m.plannedDueDate
      ) {
        const [iy, im, id] = m.plannedDueDate.slice(0, 10).split("-").map(Number);
        const nextPlanned = new Date(Date.UTC(iy, im - 1, id));
        nextPlanned.setUTCDate(nextPlanned.getUTCDate() + daysToRestore);
        updated.plannedDueDate = nextPlanned.toISOString().slice(0, 10);
      }
      return updated;
    });
    const { milestones: evaluatedMilestones, isDelayed } = ScheduleEngine.evaluateMilestones(updatedList);
    const evaluatedTarget = evaluatedMilestones[targetIndex];

    const operations: Promise<unknown>[] = [
      prisma.projectMilestone.update({
        where: { id: target.id },
        data: { status: evaluatedTarget.status, actualDueDate: null },
      }),
      prisma.salesTask.updateMany({
        where: { milestoneId: target.id },
        data: { isCompleted: false, completedAt: null },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: { currentStage: stage, isDelayed },
      }),
    ];

    for (let i = targetIndex + 1; i < updatedList.length; i++) {
      const m = updatedList[i];
      const orig = milestones[i];
      const statusChanged = m.status !== orig.status;
      const dateChanged = m.plannedDueDate !== orig.plannedDueDate && Boolean(m.plannedDueDate);

      if (statusChanged || dateChanged) {
        operations.push(
          prisma.projectMilestone.update({
            where: { id: m.id },
            data: {
              ...(statusChanged ? { status: m.status } : {}),
              ...(dateChanged ? { plannedDueDate: new Date(`${m.plannedDueDate}T00:00:00.000Z`) } : {}),
            },
          })
        );
      }
      if (dateChanged) {
        operations.push(
          prisma.salesTask.updateMany({
            where: { milestoneId: m.id, isCompleted: false },
            data: {
              dueDatetime: new Date(`${m.plannedDueDate}T00:00:00.000Z`),
            },
          })
        );
      }
    }

    await Promise.all(operations);
    return evaluatedMilestones;
  },

  async advanceProjectToSpecialStage(
    projectId: string,
    stageCode: "X-1" | "X-2",
    reason: string,
    existingProject?: ProjectDetail,
    existingMilestones?: ProjectMilestoneItem[],
  ) {
    const defaultDays = await this.getMilestoneDefaultDays();
    const currentStage = STAGE_CODE_TO_PROJECT_STAGE[stageCode] as ProjectStage;
    const actualDueDate = new Date();
    const plannedDueDate = new Date(actualDueDate);
    const days = Number(defaultDays[stageCode]) || MILESTONE_DEFAULT_DAYS[stageCode] || (stageCode === "X-1" ? 14 : 0);
    plannedDueDate.setDate(plannedDueDate.getDate() + days);
    const isWrapUp = stageCode === "X-1";

    if (existingProject && existingMilestones) {
      const existingMilestone = existingMilestones.find((m) => m.stageCode === stageCode);
      const maxOrder = existingMilestones.reduce((max, m) => Math.max(max, m.stageOrder), 0);
      const stageOrder = existingMilestone ? existingMilestone.stageOrder : maxOrder + 1;

      const milestoneOp = existingMilestone
        ? prisma.projectMilestone.update({
            where: { id: existingMilestone.id },
            data: {
              status: isWrapUp ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.COMPLETED,
              plannedDueDate: isWrapUp ? plannedDueDate : undefined,
              actualDueDate: isWrapUp ? null : actualDueDate,
              notes: reason,
              assignedToId: existingMilestone.assignedToId || existingProject.customerSalesRepId,
            },
          })
        : prisma.projectMilestone.create({
            data: {
              projectId,
              stageCode,
              phase: STAGE_CODE_TO_PHASE[stageCode],
              stageOrder,
              status: isWrapUp ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.COMPLETED,
              plannedDueDate: isWrapUp ? plannedDueDate : null,
              actualDueDate: isWrapUp ? null : actualDueDate,
              notes: reason,
              assignedToId: existingProject.customerSalesRepId,
            },
          });

      const ops: Promise<unknown>[] = [
        milestoneOp,
        prisma.project.update({
          where: { id: projectId },
          data: { currentStage, ...(stageCode === "X-2" ? { isDelayed: false } : {}) },
        }),
      ];
      if (stageCode === "X-2") {
        ops.push(
          prisma.salesTask.updateMany({
            where: { projectId, isCompleted: false },
            data: { isCompleted: true, completedAt: actualDueDate, resultNotes: "流標" },
          })
        );
      }
      const [savedMs] = await Promise.all(ops) as [{ id: string }, ...unknown[]];

      const updatedItem: ProjectMilestoneItem = existingMilestone
        ? {
            ...existingMilestone,
            status: isWrapUp ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.COMPLETED,
            plannedDueDate: isWrapUp ? dateOnlyValue(plannedDueDate) : existingMilestone.plannedDueDate,
            actualDueDate: isWrapUp ? null : dateOnlyValue(actualDueDate),
            notes: reason,
            assignedToId: existingMilestone.assignedToId || existingProject.customerSalesRepId || null,
            assignedToName: existingMilestone.assignedToName || existingProject.customerSalesRepName,
          }
        : {
            id: savedMs.id,
            projectId,
            stageCode,
            phase: STAGE_CODE_TO_PHASE[stageCode] as MilestonePhaseDTO,
            stageOrder,
            status: isWrapUp ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.COMPLETED,
            priority: "MEDIUM",
            plannedDueDate: isWrapUp ? dateOnlyValue(plannedDueDate) : null,
            actualDueDate: isWrapUp ? null : dateOnlyValue(actualDueDate),
            notes: reason,
            attachments: null,
            assignedToId: existingProject.customerSalesRepId || null,
            assignedToName: existingProject.customerSalesRepName,
          };

      const nextList = existingMilestone
        ? existingMilestones.map((m) => (m.id === existingMilestone.id ? updatedItem : m))
        : [...existingMilestones, updatedItem];

      return ScheduleEngine.evaluateMilestones(nextList).milestones;
    }

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

      await tx.project.update({
        where: { id: projectId },
        data: { currentStage, ...(stageCode === "X-2" ? { isDelayed: false } : {}) },
      });
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

      const defaultDays = await this.getMilestoneDefaultDays();
      const plannedDueDate = new Date();
      const days = Number(defaultDays["X-1"]) || MILESTONE_DEFAULT_DAYS["X-1"] || 14;
      plannedDueDate.setDate(plannedDueDate.getDate() + days);
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

  async cancelLostStatus(projectId: string) {
    return await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true, currentStage: true },
      });
      if (!project) throw new Error("查無此案場資料");
      if (project.currentStage !== ProjectStage.LOST) {
        throw new Error("此案件非流標狀態，無法取消流標");
      }

      // 1. 刪除 X-2 里程碑紀錄 (流標進度)
      await tx.projectMilestone.deleteMany({
        where: { projectId, stageCode: "X-2" },
      });

      // 2. 取得剩下的常規里程碑
      const remainingMilestones = await tx.projectMilestone.findMany({
        where: { projectId },
        orderBy: { stageOrder: "asc" },
      });

      // 3. 找出未完成的第一個常規進度
      const firstIncomplete = remainingMilestones
        .filter((m) => m.stageCode !== "X-1" && m.stageCode !== "X-2")
        .find((m) => m.status !== MilestoneStatus.COMPLETED);

      const hasActive = remainingMilestones.some(
        (m) => m.status === MilestoneStatus.IN_PROGRESS || m.status === MilestoneStatus.OVERDUE
      );
      if (firstIncomplete && !hasActive) {
        await tx.projectMilestone.update({
          where: { id: firstIncomplete.id },
          data: { status: MilestoneStatus.IN_PROGRESS },
        });
        firstIncomplete.status = MilestoneStatus.IN_PROGRESS;
      }

      // 4. 計算還原後的案場階段
      let restoredStage: ProjectStage = ProjectStage.DEVELOP;
      if (firstIncomplete) {
        restoredStage =
          (STAGE_CODE_TO_PROJECT_STAGE[firstIncomplete.stageCode as keyof typeof STAGE_CODE_TO_PROJECT_STAGE] as ProjectStage) ||
          ProjectStage.DEVELOP;
      } else {
        const hasWrapUp = remainingMilestones.some((m) => m.stageCode === "X-1");
        restoredStage = hasWrapUp ? ProjectStage.WRAP_UP : ProjectStage.DONE;
      }

      // 5. 重新評估時程延誤
      const updatedMilestones = await this.getMilestonesByProjectId(projectId);
      const { isDelayed } = ScheduleEngine.evaluateMilestones(updatedMilestones, new Date(), false);

      await tx.project.update({
        where: { id: projectId },
        data: { currentStage: restoredStage, isDelayed },
      });

      return { restoredStage, isDelayed };
    });
  },

  async completeWrapUpMilestone(
    projectId: string,
    milestoneId: string,
    options: { notes?: string; completedDate: string },
    existingProject?: ProjectDetail,
    existingMilestones?: ProjectMilestoneItem[],
  ) {
    if (existingProject && existingMilestones) {
      if (existingProject.currentStage !== ProjectStage.WRAP_UP) {
        throw new ConflictError("案件已離開收尾階段");
      }
      const milestone = existingMilestones.find(
        (m) =>
          m.id === milestoneId &&
          m.stageCode === "X-1" &&
          (m.status === MilestoneStatus.IN_PROGRESS || m.status === MilestoneStatus.OVERDUE)
      );
      if (!milestone) {
        throw new ConflictError("只能完成目前進行中的收尾項目");
      }

      const nextNotes = options.notes?.trim() || milestone.notes;
      const updatedList = existingMilestones.map((m) =>
        m.id === milestoneId
          ? {
              ...m,
              status: MilestoneStatus.COMPLETED,
              actualDueDate: options.completedDate.slice(0, 10),
              notes: nextNotes,
            }
          : m
      );
      const evaluated = ScheduleEngine.evaluateMilestones(updatedList);

      await Promise.all([
        prisma.projectMilestone.update({
          where: { id: milestone.id },
          data: {
            status: MilestoneStatus.COMPLETED,
            actualDueDate: new Date(options.completedDate),
            notes: nextNotes,
          },
        }),
        prisma.project.update({
          where: { id: projectId },
          data: { isDelayed: evaluated.isDelayed },
        }),
      ]);

      return evaluated.milestones;
    }

    await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { currentStage: true },
      });
      if (!project) {
        throw new NotFoundError("查無此案場資料");
      }
      if (project.currentStage !== ProjectStage.WRAP_UP) {
        throw new ConflictError("案件已離開收尾階段");
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
        throw new ConflictError("只能完成目前進行中的收尾項目");
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

  async getTaskById(id: string): Promise<SalesTaskItem | null> {
    const task = await prisma.salesTask.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      include: { project: true, assignedTo: true, assignedBy: true },
    });
    if (!task) return null;
    return {
      id: task.id, projectId: task.projectId, projectName: task.project.projectName, assignedToId: task.assignedToId, assignedToName: task.assignedTo.name,
      assignedById: task.assignedById, assignedByName: task.assignedBy?.name || null, milestoneId: task.milestoneId,
      taskType: task.taskType, subject: task.subject, dueDatetime: task.dueDatetime.toISOString(), priority: task.priority,
      isCompleted: task.isCompleted, resultNotes: task.resultNotes, completedAt: dateValue(task.completedAt) || null,
    };
  },

  async getTasks(filter?: { projectId?: string; assignedToId?: string; assignedById?: string; isCompleted?: boolean }): Promise<SalesTaskItem[]> {
    const whereClause = {
      ...(filter?.projectId ? { projectId: filter.projectId } : {}),
      ...(filter?.assignedToId ? { assignedToId: filter.assignedToId } : {}),
      ...(filter?.assignedById ? { assignedById: filter.assignedById } : {}),
      ...(filter?.isCompleted !== undefined ? { isCompleted: filter.isCompleted } : {}),
    };

    const fetchTasksList = () =>
      prisma.salesTask.findMany({
        where: whereClause,
        relationLoadStrategy: "join",
        include: { project: true, assignedTo: true, assignedBy: true },
        orderBy: { dueDatetime: "asc" },
      });

    // 確保被指派的進行中/逾期正規里程碑，若尚未建立待辦，也能自動補建並出現在被指派人員待辦清單中（與主查詢平行執行）
    if (filter?.assignedToId && filter?.isCompleted !== true) {
      const assignedToId = filter.assignedToId;
      const [activeMilestones, initialTasks] = await Promise.all([
        prisma.projectMilestone.findMany({
          where: {
            assignedToId,
            status: { in: [MilestoneStatus.IN_PROGRESS, MilestoneStatus.OVERDUE] },
            project: { currentStage: { notIn: [ProjectStage.LOST, ProjectStage.WRAP_UP] } },
            salesTask: { is: null },
          },
          select: {
            id: true,
            projectId: true,
            phase: true,
            stageCode: true,
            plannedDueDate: true,
            priority: true,
          },
        }).catch(() => []),
        fetchTasksList(),
      ]);

      if (activeMilestones.length > 0) {
        try {
          await prisma.salesTask.createMany({
            data: activeMilestones.map((am) => {
              const isDrawing =
                am.phase === "PROPOSAL" ||
                am.phase === "PRE_PROD" ||
                am.stageCode.startsWith("3-") ||
                am.stageCode.startsWith("4-");
              return {
                projectId: am.projectId,
                milestoneId: am.id,
                assignedToId,
                taskType: isDrawing ? TaskType.DRAWING : TaskType.SITE_VISIT,
                subject: MILESTONE_STAGE_LABELS[am.stageCode as MilestoneStageCode] || "里程碑任務",
                dueDatetime: am.plannedDueDate || new Date(),
                priority: am.priority,
                isCompleted: false,
              };
            }),
            skipDuplicates: true,
          });
          const refreshedTasks = await fetchTasksList();
          return refreshedTasks.map((t) => ({
            id: t.id, projectId: t.projectId, projectName: t.project.projectName, assignedToId: t.assignedToId, assignedToName: t.assignedTo.name,
            assignedById: t.assignedById, assignedByName: t.assignedBy?.name || null, milestoneId: t.milestoneId,
            taskType: t.taskType, subject: t.subject, dueDatetime: t.dueDatetime.toISOString(), priority: t.priority,
            isCompleted: t.isCompleted, resultNotes: t.resultNotes, completedAt: dateValue(t.completedAt) || null,
          }));
        } catch (err) {
          console.error("Failed to sync milestone tasks:", err);
        }
      }

      return initialTasks.map((t) => ({
        id: t.id, projectId: t.projectId, projectName: t.project.projectName, assignedToId: t.assignedToId, assignedToName: t.assignedTo.name,
        assignedById: t.assignedById, assignedByName: t.assignedBy?.name || null, milestoneId: t.milestoneId,
        taskType: t.taskType, subject: t.subject, dueDatetime: t.dueDatetime.toISOString(), priority: t.priority,
        isCompleted: t.isCompleted, resultNotes: t.resultNotes, completedAt: dateValue(t.completedAt) || null,
      }));
    }

    const tasks = await fetchTasksList();
    return tasks.map(t => ({
      id: t.id, projectId: t.projectId, projectName: t.project.projectName, assignedToId: t.assignedToId, assignedToName: t.assignedTo.name,
      assignedById: t.assignedById, assignedByName: t.assignedBy?.name || null, milestoneId: t.milestoneId,
      taskType: t.taskType, subject: t.subject, dueDatetime: t.dueDatetime.toISOString(), priority: t.priority,
      isCompleted: t.isCompleted, resultNotes: t.resultNotes, completedAt: dateValue(t.completedAt) || null,
    }));
  },

  async updateTask(id: string, data: { assignedToId: string; subject: string; priority: TaskPriority; dueDatetime: string }): Promise<SalesTaskItem | null> {
    const existing = await prisma.salesTask.findUnique({ where: { id }, select: { id: true, milestoneId: true } });
    if (!existing || existing.milestoneId) return null;
    const task = await prisma.salesTask.update({
      where: { id },
      data: { assignedToId: data.assignedToId, subject: data.subject, priority: data.priority, dueDatetime: new Date(data.dueDatetime) },
      relationLoadStrategy: "join",
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
      relationLoadStrategy: "join",
      include: { project: true, assignedTo: true, assignedBy: true },
    });
    return {
      id: task.id, projectId: task.projectId, projectName: task.project.projectName, assignedToId: task.assignedToId, assignedToName: task.assignedTo.name,
      assignedByName: task.assignedBy?.name || null, milestoneId: task.milestoneId,
      taskType: task.taskType, subject: task.subject, dueDatetime: task.dueDatetime.toISOString(), priority: task.priority,
      isCompleted: task.isCompleted, resultNotes: task.resultNotes, completedAt: dateValue(task.completedAt) || null,
    };
  },

  async addCustomer(data: CustomerCreateDTO): Promise<CustomerItem> {
    const c = await prisma.customer.create({
      data: {
        ...data,
        paymentTerms: data.paymentTerms || "MONTHLY_30",
        customerType: customerTypeForDatabase(data.customerType || "DESIGNER"),
      },
      relationLoadStrategy: "join",
      include: { salesRep: true },
    });
    return {
      id: c.id,
      customerType: customerTypeFromDatabase(c.customerType),
      name: c.name,
      taxId: c.taxId || undefined,
      phone: c.phone,
      address: c.address || undefined,
      defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms,
      salesRepId: c.salesRepId,
      salesRepName: c.salesRep.name,
    };
  },

  async updateCustomer(id: string, data: CustomerUpdateDTO): Promise<CustomerItem> {
    const c = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        customerType: customerTypeForDatabase(data.customerType),
        taxId: data.taxId || null,
        phone: data.phone,
        address: data.address || null,
        defaultDiscount: data.defaultDiscount,
        paymentTerms: data.paymentTerms as PaymentTerms,
        salesRepId: data.salesRepId,
      },
      relationLoadStrategy: "join",
      include: { salesRep: true },
    });
    return {
      id: c.id,
      customerType: customerTypeFromDatabase(c.customerType),
      name: c.name,
      taxId: c.taxId || undefined,
      phone: c.phone,
      address: c.address || undefined,
      defaultDiscount: Number(c.defaultDiscount),
      paymentTerms: c.paymentTerms,
      salesRepId: c.salesRepId,
      salesRepName: c.salesRep.name,
    };
  },

  async deleteCustomer(id: string): Promise<"DELETED" | "NOT_FOUND" | "HAS_PROJECTS"> {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id },
        select: { _count: { select: { projects: true } } },
      });
      if (!customer) return "NOT_FOUND";
      if (customer._count.projects > 0) return "HAS_PROJECTS";
      await tx.customer.delete({ where: { id } });
      return "DELETED";
    });
  },

  async deleteProject(id: string): Promise<boolean> {
    const result = await prisma.project.deleteMany({ where: { id } });
    return result.count > 0;
  },

  async deleteTask(id: string): Promise<boolean> {
    const result = await prisma.salesTask.deleteMany({ where: { id } });
    return result.count > 0;
  },


  async updateProjectStage(projectId: string, currentStage: ProjectStage) {
    return prisma.project.update({ where: { id: projectId }, data: { currentStage } });
  },

  async evaluateAllSchedules() {
    return { alerts: [] }; // Mock for now
  },

  async toggleTaskComplete(
    taskId: string,
    isCompleted: boolean,
    resultNotes?: string,
    completedAt?: string,
    existingTask?: { id: string; projectId: string; milestoneId?: string | null; isCompleted: boolean },
    existingProject?: ProjectDetail,
    existingMilestones?: ProjectMilestoneItem[],
  ) {
    const taskBeforeUpdate = existingTask ?? await prisma.salesTask.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, milestoneId: true, isCompleted: true },
    });
    if (!taskBeforeUpdate) return null;

    if (taskBeforeUpdate.milestoneId) {
      if (!isCompleted) {
        throw new BadRequestError("里程碑待辦請由案件細節執行回退");
      }
      if (!taskBeforeUpdate.isCompleted) {
        const combined = (existingProject && existingMilestones)
          ? { project: existingProject, milestones: existingMilestones }
          : await this.getProjectWithMilestones(taskBeforeUpdate.projectId);
        if (combined?.project.currentStage === "WRAP_UP" || combined?.project.currentStage === "LOST") {
          throw new ConflictError("案件已進入額外階段，無法完成一般里程碑");
        }
        await this.advanceMilestone(
          taskBeforeUpdate.projectId,
          taskBeforeUpdate.milestoneId,
          {
            notes: resultNotes,
            completedDate: completedAt,
          },
          combined?.milestones,
        );
      }
      return {
        ...taskBeforeUpdate,
        isCompleted: true,
        completedAt: completedAt ? new Date(`${completedAt}T00:00:00.000Z`) : new Date(),
        resultNotes: resultNotes || null,
      };
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
  },

  // -------------------------------------------------------------
  // 里程碑拖曳重新排序
  // -------------------------------------------------------------
  async reorderMilestones(
    projectId: string,
    orderedMilestoneIds: string[],
    existingMilestones?: ProjectMilestoneItem[]
  ) {
    const currentMilestones = existingMilestones ?? await this.getMilestonesByProjectId(projectId);
    if (
      orderedMilestoneIds.length !== currentMilestones.length ||
      new Set(orderedMilestoneIds).size !== currentMilestones.length ||
      currentMilestones.some(({ id }) => !orderedMilestoneIds.includes(id))
    ) {
      throw new BadRequestError("排序清單必須包含此案件的所有里程碑且不可重複");
    }

    // 方案 A 防護：鎖定已完成、進行中與已逾期進度，禁止變更其先後順序
    const sortedCurrent = [...currentMilestones].sort((a, b) => a.stageOrder - b.stageOrder);
    for (let i = 0; i < sortedCurrent.length; i++) {
      const currentItem = sortedCurrent[i];
      if (
        currentItem.status === MilestoneStatus.COMPLETED ||
        currentItem.status === MilestoneStatus.IN_PROGRESS ||
        currentItem.status === MilestoneStatus.OVERDUE
      ) {
        if (orderedMilestoneIds[i] !== currentItem.id) {
          throw new BadRequestError("已完成與進行中之進度不可調整順序，僅可調整尚未開始之進度");
        }
      }
    }

    const byId = new Map(currentMilestones.map((m) => [m.id, m]));
    const defaultDays = await this.getMilestoneDefaultDays();
    const updates: Promise<unknown>[] = [];
    const reordered: ProjectMilestoneItem[] = [];

    let prevPlanned: Date | null = null;

    orderedMilestoneIds.forEach((id, index) => {
      const item = byId.get(id)!;
      const newOrder = index + 1;

      if (
        item.status === MilestoneStatus.COMPLETED ||
        item.status === MilestoneStatus.IN_PROGRESS ||
        item.status === MilestoneStatus.OVERDUE
      ) {
        if (item.plannedDueDate) {
          prevPlanned = new Date(`${item.plannedDueDate.slice(0, 10)}T00:00:00.000Z`);
        }
        if (item.stageOrder !== newOrder) {
          updates.push(
            prisma.projectMilestone.update({
              where: { id },
              data: { stageOrder: newOrder },
            })
          );
        }
        reordered.push({ ...item, stageOrder: newOrder });
      } else {
        // PENDING 項目：依照新的排序重新計算預定完成日，確保間隔嚴格符合預設天數
        let newPlannedDate: Date | null = item.plannedDueDate
          ? new Date(`${item.plannedDueDate.slice(0, 10)}T00:00:00.000Z`)
          : null;
        if (prevPlanned) {
          const days =
            Number(defaultDays[item.stageCode]) ||
            MILESTONE_DEFAULT_DAYS[item.stageCode as MilestoneStageCode] ||
            3;
          const targetDate = new Date(prevPlanned);
          targetDate.setUTCDate(targetDate.getUTCDate() + days);
          newPlannedDate = targetDate;
          prevPlanned = targetDate;
        }

        const dateStr = newPlannedDate ? newPlannedDate.toISOString().slice(0, 10) : item.plannedDueDate;
        const dateChanged = dateStr !== item.plannedDueDate;
        const orderChanged = item.stageOrder !== newOrder;

        if (orderChanged || dateChanged) {
          updates.push(
            prisma.projectMilestone.update({
              where: { id },
              data: {
                stageOrder: newOrder,
                ...(dateChanged && newPlannedDate ? { plannedDueDate: newPlannedDate } : {}),
              },
            })
          );
          if (dateChanged && newPlannedDate) {
            updates.push(
              prisma.salesTask.updateMany({
                where: { milestoneId: id, isCompleted: false },
                data: { dueDatetime: newPlannedDate },
              })
            );
          }
        }

        reordered.push({
          ...item,
          stageOrder: newOrder,
          plannedDueDate: dateStr,
        });
      }
    });

    if (updates.length > 0) {
      await Promise.all(updates);
    }
    return ScheduleEngine.evaluateMilestones(reordered).milestones;
  },

  // -------------------------------------------------------------
  // 里程碑多次記錄 [+] 功能
  // -------------------------------------------------------------
  async getMilestoneRecords(milestoneId: string) {
    const records = await prisma.milestoneRecord.findMany({
      where: { milestoneId },
      relationLoadStrategy: "join",
      include: { assignedTo: { select: { id: true, name: true } } },
      orderBy: { recordOrder: "asc" },
    });
    return records.map((r) => ({
      id: r.id,
      milestoneId: r.milestoneId,
      recordOrder: r.recordOrder,
      plannedDueDate: dateOnlyValue(r.plannedDueDate),
      actualDueDate: dateOnlyValue(r.actualDueDate),
      amount: r.amount ? Number(r.amount) : null,
      notes: r.notes || "",
      assignedToId: r.assignedToId || null,
      assignedToName: r.assignedTo?.name || null,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  async addMilestoneRecord(milestoneId: string, data: {
    plannedDueDate?: string;
    actualDueDate?: string;
    amount?: number;
    notes?: string;
    assignedToId?: string;
  }) {
    const maxOrder = (await prisma.milestoneRecord.aggregate({
      where: { milestoneId },
      _max: { recordOrder: true },
    }))._max.recordOrder || 0;

    const [record] = await Promise.all([
      prisma.milestoneRecord.create({
        data: {
          milestoneId,
          recordOrder: maxOrder + 1,
          plannedDueDate: data.plannedDueDate ? new Date(data.plannedDueDate) : null,
          actualDueDate: data.actualDueDate ? new Date(data.actualDueDate) : null,
          amount: data.amount !== undefined ? data.amount : null,
          notes: data.notes || null,
          assignedToId: data.assignedToId || null,
        },
        relationLoadStrategy: "join",
        include: { assignedTo: { select: { id: true, name: true } } },
      }),
      ...(data.actualDueDate
        ? [
            prisma.projectMilestone.update({
              where: { id: milestoneId },
              data: { actualDueDate: new Date(data.actualDueDate) },
            }),
          ]
        : []),
    ]);

    return record;
  },

  async deleteMilestoneRecord(recordId: string) {
    return prisma.milestoneRecord.delete({ where: { id: recordId } });
  },

  // -------------------------------------------------------------
  // 全域設定 (案件清單自訂欄位 / 子進度預設天數)
  // -------------------------------------------------------------
  async getAppConfig<T>(key: string, defaultValue: T): Promise<T> {
    const cached = appConfigCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    try {
      const config = await prisma.appConfig.findUnique({ where: { key } });
      if (!config) {
        appConfigCache.set(key, { value: defaultValue, expiresAt: Date.now() + APP_CONFIG_TTL_MS });
        return defaultValue;
      }
      const parsed = JSON.parse(config.value) as T;
      appConfigCache.set(key, { value: parsed, expiresAt: Date.now() + APP_CONFIG_TTL_MS });
      return parsed;
    } catch {
      return defaultValue;
    }
  },

  async setAppConfig(key: string, value: unknown) {
    appConfigCache.set(key, { value, expiresAt: Date.now() + APP_CONFIG_TTL_MS });
    return prisma.appConfig.upsert({
      where: { key },
      create: { id: key, key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  },
};
