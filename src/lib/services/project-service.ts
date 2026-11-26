import { prisma } from "@/lib/prisma";
import {
  Prisma,
  MilestoneStatus,
  ProjectStage,
  TaskPriority,
  TaskType,
} from "@prisma/client";
import { BadRequestError, ConflictError } from "../errors";
import {
  AUDIT_STAGE_CODES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPE_START_STAGE_CODES,
  INSTALL_STAGE_CODES,
  MILESTONE_DEFAULT_DAYS,
  MILESTONE_STAGE_LABELS,
  STAGE_CODE_TO_PHASE,
  STANDARD_MILESTONE_STAGE_CODES,
  extractAuditSubmittedAt,
  isClosureStageCode,
  isInstallStageCode,
  resolveBillingInfoFromMilestones,
} from "../constants";
import { ScheduleEngine, STAGE_CODE_TO_PROJECT_STAGE, addDaysToDateStr } from "../schedule-engine";
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

const TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 25000 } as const;

async function buildStandardMilestonesAndInitialStage(params: {
  customerType: string;
  assignedSalesRepId: string;
  expectedDate?: string | null;
  billingDate?: string | null;
  startStageCode?: string;
}) {
  const defaultDays = await ConfigService.getMilestoneDefaultDays();
  const dynamicTypeStages = await ConfigService.getCustomerTypeStartStages();
  const allCodes = STANDARD_MILESTONE_STAGE_CODES;

  // 依客戶類型或指定參數決定起始進度（方案一：自動批次略過前置進度）
  const targetStartCode =
    (params.startStageCode && allCodes.includes(params.startStageCode as MilestoneStageCode)
      ? (params.startStageCode as MilestoneStageCode)
      : undefined) ||
    dynamicTypeStages[params.customerType] ||
    CUSTOMER_TYPE_START_STAGE_CODES[params.customerType] ||
    "1-1";

  const targetIndex = allCodes.indexOf(targetStartCode);
  const validTargetIndex = targetIndex !== -1 ? targetIndex : 0;
  const finalStartCode = allCodes[validTargetIndex];
  const customerTypeLabel = CUSTOMER_TYPE_LABELS[params.customerType] || params.customerType;

  const today = new Date();
  let cursorDate = new Date(today);
  let installCursorDate: Date | null = params.expectedDate
    ? new Date(`${params.expectedDate.slice(0, 10)}T00:00:00.000Z`)
    : null;

  const milestoneRows = allCodes.map((code, index) => {
    const isSkipped = index < validTargetIndex;
    const isActive = index === validTargetIndex;

    let plannedDueDate: Date | null;
    const actualDueDate: Date | null = null;
    let status: MilestoneStatus;
    let notes: string | null = null;

    if (isSkipped) {
      status = MilestoneStatus.COMPLETED;
      plannedDueDate = isInstallStageCode(code)
        ? (code === "6-1" && params.expectedDate ? new Date(`${params.expectedDate.slice(0, 10)}T00:00:00.000Z`) : null)
        : new Date(today);
      notes = `【系統自動略過：依客戶類型（${customerTypeLabel}）跳轉】`;
    } else if (isClosureStageCode(code)) {
      // 第七階段【立帳/結案】採全手動設定日期與推進，不納入自動天數推算（僅 7-2 立帳承接表單選填之立帳日期）
      status = isActive ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING;
      if (code === "7-2" && params.billingDate) {
        const dateStr = params.billingDate.slice(0, 10);
        plannedDueDate = new Date(`${dateStr}T00:00:00.000Z`);
      } else {
        plannedDueDate = null;
      }
    } else if (isInstallStageCode(code)) {
      // 第六階段【安裝及驗收】未填寫進場日前一律空白；有填入進場日時才以 6-1 為基準推算 6-2 ~ 6-5
      status = isActive ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING;
      if (!installCursorDate) {
        plannedDueDate = null;
      } else if (code === "6-1") {
        plannedDueDate = new Date(installCursorDate);
      } else {
        const days = Number(defaultDays[code]) || MILESTONE_DEFAULT_DAYS[code] || 3;
        installCursorDate = new Date(installCursorDate);
        installCursorDate.setUTCDate(installCursorDate.getUTCDate() + days);
        plannedDueDate = new Date(installCursorDate);
      }
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
      assignedToId: params.assignedSalesRepId,
    };
  });

  const initialProjectStage = (STAGE_CODE_TO_PROJECT_STAGE[finalStartCode] || ProjectStage.DEVELOP) as ProjectStage;
  return { milestoneRows, finalStartCode, initialProjectStage, defaultDays };
}

async function createInitialSalesTask(
  tx: Prisma.TransactionClient,
  projectId: string,
  finalStartCode: MilestoneStageCode,
  assignedSalesRepId: string,
) {
  const activeMilestone = await tx.projectMilestone.findFirst({
    where: { projectId, stageCode: finalStartCode },
  });
  if (!activeMilestone) return;

  const isDrawing =
    activeMilestone.phase === "PROPOSAL" ||
    activeMilestone.phase === "PRE_PROD" ||
    finalStartCode.startsWith("3-") ||
    finalStartCode.startsWith("4-");

  await tx.salesTask.create({
    data: {
      projectId,
      milestoneId: activeMilestone.id,
      assignedToId: assignedSalesRepId,
      taskType: isDrawing ? TaskType.DRAWING : TaskType.SITE_VISIT,
      subject: MILESTONE_STAGE_LABELS[finalStartCode] || "里程碑任務",
      dueDatetime: activeMilestone.plannedDueDate || new Date(),
      priority: TaskPriority.MEDIUM,
      isCompleted: false,
    },
  });
}

async function syncInstallMilestonesByExpectedDate(
  tx: Prisma.TransactionClient | typeof prisma,
  projectId: string,
  expectedDate: string | null | undefined,
  defaultDays: Record<string, number>,
) {
  const installRows = await tx.projectMilestone.findMany({
    where: { projectId, stageCode: { in: Array.from(INSTALL_STAGE_CODES) } },
    select: { id: true, stageCode: true, status: true, stageOrder: true, plannedDueDate: true },
    orderBy: { stageOrder: "asc" },
  });
  if (installRows.length === 0) return;

  const baseDateStr = expectedDate ? expectedDate.slice(0, 10) : null;
  let cursor = baseDateStr;
  let m61Completed = false;

  for (const row of installRows) {
    if (row.stageCode === "6-1") {
      if (row.status === MilestoneStatus.COMPLETED) {
        m61Completed = true;
        if (row.plannedDueDate) {
          cursor = row.plannedDueDate.toISOString().slice(0, 10);
        }
        continue;
      }
      const nextDate = baseDateStr ? new Date(`${baseDateStr}T00:00:00.000Z`) : null;
      await tx.projectMilestone.update({
        where: { id: row.id },
        data: { plannedDueDate: nextDate },
      });
      if (nextDate) {
        await tx.salesTask.updateMany({
          where: { milestoneId: row.id, isCompleted: false },
          data: { dueDatetime: nextDate },
        });
      }
      continue;
    }

    if (m61Completed || row.status === MilestoneStatus.COMPLETED) continue;

    if (!cursor) {
      await tx.projectMilestone.update({
        where: { id: row.id },
        data: { plannedDueDate: null },
      });
    } else {
      const days = Number(defaultDays[row.stageCode]) || MILESTONE_DEFAULT_DAYS[row.stageCode as MilestoneStageCode] || 3;
      cursor = addDaysToDateStr(cursor, days);
      const nextDate = new Date(`${cursor}T00:00:00.000Z`);
      await tx.projectMilestone.update({
        where: { id: row.id },
        data: { plannedDueDate: nextDate },
      });
      await tx.salesTask.updateMany({
        where: { milestoneId: row.id, isCompleted: false },
        data: { dueDatetime: nextDate },
      });
    }
  }
}

export const ProjectService = {
  async getProjects(filter?: { where?: Prisma.ProjectWhereInput }): Promise<ProjectDetail[]> {
    const projects = await prisma.project.findMany({
      where: filter?.where,
      include: {
        ...projectInclude,
        milestones: {
          where: { stageCode: "7-2" },
          select: { stageCode: true, status: true, plannedDueDate: true, actualDueDate: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return projects.map((p) => {
      const billingInfo = resolveBillingInfoFromMilestones(p.milestones);
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
        billingDate: billingInfo.billingDate ?? undefined,
        isBillingCompleted: billingInfo.isBillingCompleted,
        estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
        unitCount: p.unitCount ?? undefined,
        cost: p.cost != null ? Number(p.cost) : undefined,
        quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
        parentId: p.parentId ?? undefined,
        phaseNumber: p.phaseNumber ?? undefined,
        phaseName: p.phaseName ?? undefined,
      };
    });
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
      include: {
        ...projectInclude,
        milestones: {
          where: { stageCode: "7-2" },
          select: { stageCode: true, status: true, plannedDueDate: true, actualDueDate: true },
          take: 1,
        },
      },
    });
    if (!p) return undefined;
    const billingInfo = resolveBillingInfoFromMilestones(p.milestones);
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
      billingDate: billingInfo.billingDate ?? undefined,
      isBillingCompleted: billingInfo.isBillingCompleted,
      estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount ?? undefined,
      cost: p.cost != null ? Number(p.cost) : undefined,
      quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
      parentId: p.parentId ?? undefined,
      phaseNumber: p.phaseNumber ?? undefined,
      phaseName: p.phaseName ?? undefined,
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
        auditSubmittedAt: AUDIT_STAGE_CODES.has(m.stageCode)
          ? extractAuditSubmittedAt(m.attachments)
          : null,
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

    const billingInfo = resolveBillingInfoFromMilestones(rawMilestones);
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
      billingDate: billingInfo.billingDate ?? undefined,
      isBillingCompleted: billingInfo.isBillingCompleted,
      estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
      unitCount: p.unitCount ?? undefined,
      cost: p.cost != null ? Number(p.cost) : undefined,
      quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
      parentId: p.parentId ?? undefined,
      phaseNumber: p.phaseNumber ?? undefined,
      phaseName: p.phaseName ?? undefined,
    };
    return { project, milestones: evaluated.milestones };
  },

  async addProject(data: {
    projectName: string;
    customerId: string;
    siteAddress: string;
    siteCondition?: string;
    expectedDate?: string;
    billingDate?: string;
    unitCount?: number;
    cost?: number;
    quoteAmount?: number;
    salesRepId?: string;
    startStageCode?: string;
    parentId?: string;
    phaseNumber?: number;
    phaseName?: string;
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
    const { milestoneRows, finalStartCode, initialProjectStage } =
      await buildStandardMilestonesAndInitialStage({
        customerType: customer.customerType,
        assignedSalesRepId,
        expectedDate: data.expectedDate,
        billingDate: data.billingDate,
        startStageCode: data.startStageCode,
      });

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
          parentId: data.parentId,
          phaseNumber: data.phaseNumber,
          phaseName: data.phaseName,
          milestones: {
            createMany: {
              data: milestoneRows,
            },
          },
        },
        relationLoadStrategy: "join",
        include: projectInclude,
      });

      await createInitialSalesTask(tx, p.id, finalStartCode, assignedSalesRepId);

      const billingInfo = resolveBillingInfoFromMilestones(milestoneRows);
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
        billingDate: billingInfo.billingDate ?? undefined,
        isBillingCompleted: billingInfo.isBillingCompleted,
        estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
        unitCount: p.unitCount ?? undefined,
        cost: p.cost != null ? Number(p.cost) : undefined,
        quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
        parentId: p.parentId ?? undefined,
        phaseNumber: p.phaseNumber ?? undefined,
        phaseName: p.phaseName ?? undefined,
      };
    }, TRANSACTION_OPTIONS);
  },

  async addProjectPhase(
    parentProjectId: string,
    data: {
      phaseName: string;
      expectedDate?: string;
      billingDate?: string;
      unitCount?: number;
      cost?: number;
      quoteAmount?: number;
      salesRepId?: string;
      startStageCode?: string;
    }
  ): Promise<ProjectDetail> {
    const parent = await prisma.project.findUnique({
      where: { id: parentProjectId },
      include: {
        phases: {
          orderBy: { phaseNumber: "asc" },
        },
        milestones: true,
      },
    });
    if (!parent) {
      throw new BadRequestError("找不到母案場");
    }

    if (parent.phases.length === 0) {
      const phase1Name = data.phaseName.trim() || "第 1 期";
      const phase1ProjectName =
        phase1Name === "第 1 期"
          ? parent.projectName
          : `${parent.projectName} - ${phase1Name}`;

      const phase1 = await prisma.project.create({
        data: {
          projectName: phase1ProjectName,
          customerId: parent.customerId,
          siteAddress: parent.siteAddress,
          siteCondition: parent.siteCondition,
          salesRepId: data.salesRepId || parent.salesRepId,
          salesAssistantId: parent.salesAssistantId,
          currentStage: parent.currentStage,
          isDelayed: parent.isDelayed,
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : parent.expectedDate,
          unitCount: data.unitCount !== undefined ? data.unitCount : parent.unitCount,
          cost: data.cost !== undefined ? data.cost : parent.cost,
          quoteAmount: data.quoteAmount !== undefined ? data.quoteAmount : parent.quoteAmount,
          estimatedBudget:
            (data.quoteAmount !== undefined ? data.quoteAmount : parent.quoteAmount) ||
            (data.cost !== undefined ? data.cost : parent.cost) ||
            parent.estimatedBudget,
          parentId: parent.id,
          phaseNumber: 1,
          phaseName: phase1Name,
        },
        relationLoadStrategy: "join",
        include: projectInclude,
      });

      await prisma.projectMilestone.updateMany({
        where: { projectId: parent.id },
        data: { projectId: phase1.id },
      });
      await prisma.salesTask.updateMany({
        where: { projectId: parent.id },
        data: { projectId: phase1.id },
      });

      // 若有指定預定進場日，連動同步 phase1 的 6-1 ~ 6-5 里程碑
      if (data.expectedDate) {
        const defaultDays = await ConfigService.getMilestoneDefaultDays();
        await syncInstallMilestonesByExpectedDate(prisma, phase1.id, data.expectedDate, defaultDays);
      }

      // 若有指定立帳日期且 7-2 尚未完成，連動同步 phase1 的 7-2 里程碑
      let billingInfo = resolveBillingInfoFromMilestones(parent.milestones);
      if (data.billingDate !== undefined) {
        const m72 = await prisma.projectMilestone.findFirst({
          where: { projectId: phase1.id, stageCode: "7-2" },
          select: { id: true, status: true, plannedDueDate: true, actualDueDate: true },
        });
        if (m72 && m72.status !== MilestoneStatus.COMPLETED) {
          const nextBillingDate = data.billingDate
            ? new Date(`${data.billingDate.slice(0, 10)}T00:00:00.000Z`)
            : null;
          await prisma.projectMilestone.update({
            where: { id: m72.id },
            data: { plannedDueDate: nextBillingDate },
          });
          billingInfo = resolveBillingInfoFromMilestones([
            { stageCode: "7-2", status: m72.status, plannedDueDate: nextBillingDate, actualDueDate: m72.actualDueDate },
          ]);
        } else if (m72) {
          billingInfo = resolveBillingInfoFromMilestones([{ stageCode: "7-2", ...m72 }]);
        }
      }

      // 母案轉型為彙總容器，清空履約執行欄位（由各分期動態加總彙整）
      await prisma.project.update({
        where: { id: parent.id },
        data: {
          quoteAmount: null,
          cost: null,
          unitCount: null,
          estimatedBudget: null,
          expectedDate: null,
        },
      });

      return {
        id: phase1.id,
        projectName: phase1.projectName,
        customerId: phase1.customerId,
        customerName: phase1.customer.name,
        customerType: customerTypeFromDatabase(phase1.customer.customerType),
        defaultDiscount: Number(phase1.customer.defaultDiscount),
        siteAddress: phase1.siteAddress,
        siteCondition: phase1.siteCondition || undefined,
        salesRepId: phase1.salesRepId,
        salesRepName: phase1.salesRep.name,
        customerSalesRepId: phase1.customer.salesRepId,
        customerSalesRepName: phase1.customer.salesRep.name,
        salesAssistantId: phase1.salesAssistantId || undefined,
        salesAssistantName: phase1.salesAssistant?.name,
        currentStage: phase1.currentStage,
        isDelayed: phase1.isDelayed,
        expectedDate: dateValue(phase1.expectedDate),
        billingDate: billingInfo.billingDate ?? undefined,
        isBillingCompleted: billingInfo.isBillingCompleted,
        estimatedBudget: phase1.estimatedBudget != null ? Number(phase1.estimatedBudget) : undefined,
        unitCount: phase1.unitCount ?? undefined,
        cost: phase1.cost != null ? Number(phase1.cost) : undefined,
        quoteAmount: phase1.quoteAmount != null ? Number(phase1.quoteAmount) : undefined,
        parentId: phase1.parentId ?? undefined,
        phaseNumber: phase1.phaseNumber ?? undefined,
        phaseName: phase1.phaseName ?? undefined,
      };
    } else {
      const maxPhaseNum = Math.max(0, ...parent.phases.map((p) => p.phaseNumber || 0));
      const nextPhaseNum = maxPhaseNum + 1;
      const phaseName = data.phaseName.trim() || `第 ${nextPhaseNum} 期`;

      const newPhase = await ProjectService.addProject({
        projectName: `${parent.projectName} - ${phaseName}`,
        customerId: parent.customerId,
        siteAddress: parent.siteAddress,
        siteCondition: parent.siteCondition || undefined,
        expectedDate: data.expectedDate,
        billingDate: data.billingDate,
        unitCount: data.unitCount,
        cost: data.cost,
        quoteAmount: data.quoteAmount,
        salesRepId: data.salesRepId || parent.salesRepId,
        startStageCode: data.startStageCode,
        parentId: parent.id,
        phaseNumber: nextPhaseNum,
        phaseName,
      });

      return newPhase!;
    }
  },

  async updateProject(id: string, data: {
    projectName?: string;
    customerId?: string;
    siteAddress?: string;
    siteCondition?: string;
    expectedDate?: string;
    billingDate?: string | null;
    unitCount?: number | null;
    cost?: number | null;
    quoteAmount?: number | null;
    salesAssistantId?: string | null;
    salesRepId?: string;
    estimatedBudget?: number | null;
    phaseName?: string | null;
    phaseNumber?: number | null;
  }): Promise<ProjectDetail | undefined> {
    const existing = await prisma.project.findUnique({
      where: { id },
      select: {
        salesRepId: true,
        expectedDate: true,
        parentId: true,
        customer: { select: { customerType: true } },
        _count: { select: { phases: true, milestones: true } },
      },
    });
    if (!existing) return undefined;

    const salesRepChanged = Boolean(data.salesRepId && data.salesRepId !== existing.salesRepId);
    if (salesRepChanged && data.salesRepId) {
      const rep = await prisma.user.findUnique({
        where: { id: data.salesRepId },
        select: { role: true },
      });
      if (rep && (rep.role === "ADMIN" || rep.role === "LEVEL_MANAGER")) {
        throw new BadRequestError("不可指派管理者或理級主管為主責業務");
      }
    }

    const oldExpectedStr = existing.expectedDate ? dateOnlyValue(existing.expectedDate) : null;
    const newExpectedStr =
      data.expectedDate !== undefined
        ? (data.expectedDate ? data.expectedDate.slice(0, 10) : null)
        : oldExpectedStr;
    const expectedDateChanged = data.expectedDate !== undefined && newExpectedStr !== oldExpectedStr;
    const isEmptyShellStandalone =
      !existing.parentId &&
      existing._count.phases === 0 &&
      existing._count.milestones === 0;

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
      ...(data.phaseName !== undefined ? { phaseName: data.phaseName } : {}),
      ...(data.phaseNumber !== undefined ? { phaseNumber: data.phaseNumber } : {}),
    };

    const assignedSalesRepId = data.salesRepId || existing.salesRepId;
    const rebuiltMilestones = isEmptyShellStandalone
      ? await buildStandardMilestonesAndInitialStage({
          customerType: existing.customer.customerType,
          assignedSalesRepId,
          expectedDate: newExpectedStr,
          billingDate: data.billingDate ?? undefined,
        })
      : null;

    if (rebuiltMilestones) {
      updateData.currentStage = rebuiltMilestones.initialProjectStage;
      updateData.isDelayed = false;
    }

    const defaultDaysForInstall =
      !rebuiltMilestones && expectedDateChanged
        ? await ConfigService.getMilestoneDefaultDays()
        : null;

    return await prisma.$transaction(async (tx) => {
      if (salesRepChanged && data.salesRepId && !rebuiltMilestones) {
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

      let syncedBillingDate: string | undefined;
      let syncedBillingCompleted = false;

      if (rebuiltMilestones) {
        // 既有空殼母案補齊標準 28 項里程碑與起始待辦
        await tx.projectMilestone.createMany({
          data: rebuiltMilestones.milestoneRows.map((m) => ({
            ...m,
            projectId: id,
          })),
        });
        await createInitialSalesTask(tx, id, rebuiltMilestones.finalStartCode, assignedSalesRepId);
        const billingInfo = resolveBillingInfoFromMilestones(rebuiltMilestones.milestoneRows);
        syncedBillingDate = billingInfo.billingDate ?? undefined;
        syncedBillingCompleted = billingInfo.isBillingCompleted;
      } else {
        // 雙向同步：若更新案件主檔之 expectedDate，同步更新未完成之 6-1 進場安裝預定日並推算 6-2 ~ 6-5
        if (expectedDateChanged && defaultDaysForInstall) {
          await syncInstallMilestonesByExpectedDate(tx, id, data.expectedDate, defaultDaysForInstall);
        }

        // 雙向同步：同步 7-2 立帳里程碑（未完成時可更新預定立帳日；已完成則鎖定依實際完成日為準）
        const m72 = await tx.projectMilestone.findFirst({
          where: { projectId: id, stageCode: "7-2" },
          select: { id: true, status: true, plannedDueDate: true, actualDueDate: true },
        });
        if (m72) {
          syncedBillingCompleted = m72.status === MilestoneStatus.COMPLETED;
          if (data.billingDate !== undefined) {
            const normalizedInput = data.billingDate ? data.billingDate.slice(0, 10) : null;
            const currentActual = m72.actualDueDate ? dateOnlyValue(m72.actualDueDate) : null;
            const currentPlanned = m72.plannedDueDate ? dateOnlyValue(m72.plannedDueDate) : null;
            if (m72.status === MilestoneStatus.COMPLETED) {
              if (normalizedInput !== currentActual) {
                throw new ConflictError("7-2 立帳已完成，立帳日期已鎖定為實際完成日，請至項目 7-2 修改");
              }
              syncedBillingDate = currentActual || undefined;
            } else if (normalizedInput !== currentPlanned) {
              const newBillingDate = normalizedInput ? new Date(`${normalizedInput}T00:00:00.000Z`) : null;
              await tx.projectMilestone.update({
                where: { id: m72.id },
                data: { plannedDueDate: newBillingDate },
              });
              await tx.salesTask.updateMany({
                where: { milestoneId: m72.id, isCompleted: false },
                data: { dueDatetime: newBillingDate || new Date() },
              });
              syncedBillingDate = normalizedInput || undefined;
            } else {
              syncedBillingDate = currentPlanned || undefined;
            }
          } else {
            const info = resolveBillingInfoFromMilestones([{ stageCode: "7-2", ...m72 }]);
            syncedBillingDate = info.billingDate ?? undefined;
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
        billingDate: syncedBillingDate,
        isBillingCompleted: syncedBillingCompleted,
        estimatedBudget: p.estimatedBudget != null ? Number(p.estimatedBudget) : undefined,
        unitCount: p.unitCount ?? undefined,
        cost: p.cost != null ? Number(p.cost) : undefined,
        quoteAmount: p.quoteAmount != null ? Number(p.quoteAmount) : undefined,
        parentId: p.parentId ?? undefined,
        phaseNumber: p.phaseNumber ?? undefined,
        phaseName: p.phaseName ?? undefined,
      };
    }, TRANSACTION_OPTIONS);
  },

  async deleteProject(id: string): Promise<{ deleted: boolean; revertedToSingle: boolean; parentId?: string }> {
    return await prisma.$transaction(async (tx) => {
      const target = await tx.project.findUnique({
        where: { id },
        select: {
          id: true,
          parentId: true,
          siteAddress: true,
          siteCondition: true,
          salesRepId: true,
          salesAssistantId: true,
          currentStage: true,
          isDelayed: true,
          expectedDate: true,
          unitCount: true,
          cost: true,
          quoteAmount: true,
          estimatedBudget: true,
        },
      });
      if (!target) {
        return { deleted: false, revertedToSingle: false };
      }

      if (target.parentId) {
        const siblingCount = await tx.project.count({
          where: { parentId: target.parentId },
        });

        // 方案 B：刪除僅存的最後一個分期時，無損還原回母案並恢復為單一案件
        if (siblingCount <= 1) {
          await tx.projectMilestone.updateMany({
            where: { projectId: target.id },
            data: { projectId: target.parentId },
          });
          await tx.salesTask.updateMany({
            where: { projectId: target.id },
            data: { projectId: target.parentId },
          });
          await tx.project.update({
            where: { id: target.parentId },
            data: {
              siteAddress: target.siteAddress,
              siteCondition: target.siteCondition,
              salesRepId: target.salesRepId,
              salesAssistantId: target.salesAssistantId,
              currentStage: target.currentStage,
              isDelayed: target.isDelayed,
              expectedDate: target.expectedDate,
              unitCount: target.unitCount,
              cost: target.cost,
              quoteAmount: target.quoteAmount,
              estimatedBudget: target.estimatedBudget,
            },
          });
          const result = await tx.project.deleteMany({ where: { id: target.id } });
          return {
            deleted: result.count > 0,
            revertedToSingle: result.count > 0,
            parentId: target.parentId,
          };
        }
      }

      const result = await tx.project.deleteMany({ where: { id: target.id } });
      return { deleted: result.count > 0, revertedToSingle: false };
    }, TRANSACTION_OPTIONS);
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
