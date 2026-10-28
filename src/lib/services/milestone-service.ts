import { prisma } from "@/lib/prisma";
import {
  Prisma,
  MilestoneStatus,
  ProjectStage,
  TaskPriority,
  TaskType,
} from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import {
  AUDIT_STAGE_CODES,
  MILESTONE_DEFAULT_DAYS,
  MILESTONE_STAGE_LABELS,
  STAGE_CODE_TO_PHASE,
  STANDARD_MILESTONE_STAGE_CODES,
} from "../constants";
import {
  ScheduleEngine,
  STAGE_CODE_TO_PROJECT_STAGE,
  getTaiwanDateString,
} from "../schedule-engine";
import type {
  MilestonePhaseDTO,
  MilestoneStageCode,
  ProjectDetail,
  ProjectMilestoneItem,
} from "@/types/dto";
import { ConfigService } from "./config-service";
import { dateOnlyValue, milestoneInclude } from "./shared";

export const MilestoneService = {
  async getMilestonesByProjectIds(projectIds?: string[]): Promise<Record<string, ProjectMilestoneItem[]>> {
    if (projectIds && projectIds.length === 0) return {};
    const ms = await prisma.projectMilestone.findMany({
      ...(projectIds ? { where: { projectId: { in: projectIds } } } : {}),
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
        id: m.id,
        projectId: m.projectId,
        stageCode: m.stageCode as MilestoneStageCode,
        phase: m.phase as MilestonePhaseDTO,
        stageOrder: m.stageOrder,
        plannedDueDate: dateOnlyValue(m.plannedDueDate),
        actualDueDate: dateOnlyValue(m.actualDueDate),
        status: m.status,
        priority: m.priority,
        assignedToId: m.assignedToId || null,
        assignedToName: m.assignedTo?.name || null,
        attachments: m.attachments,
        notes: m.notes,
        auditSubmitted: isAuditSubmitted,
      });
      result[m.projectId] = list;
    }
    return Object.fromEntries(
      Object.entries(result).map(([pid, list]) => [pid, ScheduleEngine.evaluateMilestones(list).milestones])
    );
  },

  async getMilestonesByProjectId(projectId: string): Promise<ProjectMilestoneItem[]> {
    const result = await MilestoneService.getMilestonesByProjectIds([projectId]);
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

    const defaultDays = await ConfigService.getMilestoneDefaultDays();

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

    let targetStatus = updates.status;
    if (targetStatus === undefined && updates.plannedDueDate !== undefined) {
      const newDue = updates.plannedDueDate ? updates.plannedDueDate.slice(0, 10) : null;
      const today = getTaiwanDateString();
      if (currentMilestone.status === MilestoneStatus.OVERDUE) {
        if (newDue && newDue >= today) {
          targetStatus = MilestoneStatus.IN_PROGRESS;
        }
      } else if (currentMilestone.status === MilestoneStatus.IN_PROGRESS) {
        if (newDue && newDue < today) {
          targetStatus = MilestoneStatus.OVERDUE;
        }
      }
    }

    const updatedRow = await prisma.$transaction(async (tx) => {
      const milestone = await tx.projectMilestone.update({
        where: { id: milestoneId, projectId },
        data: {
          plannedDueDate: updates.plannedDueDate ? new Date(updates.plannedDueDate) : updates.plannedDueDate === null ? null : undefined,
          actualDueDate: updates.actualDueDate ? new Date(updates.actualDueDate) : updates.actualDueDate === null ? null : undefined,
          status: targetStatus,
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

      if (updates.assignedToId !== undefined) {
        if (!updates.assignedToId) {
          await tx.salesTask.deleteMany({ where: { milestoneId } });
        } else {
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
            await tx.salesTask.upsert({
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
          }
        }
      } else if (updates.priority !== undefined) {
        await tx.salesTask.updateMany({
          where: { milestoneId },
          data: { priority: updates.priority as TaskPriority },
        });
      }

      return milestone;
    });

    const currentList = existingMilestones
      ? existingMilestones.map((m) =>
          m.id === milestoneId
            ? {
                ...m,
                plannedDueDate: dateOnlyValue(updatedRow.plannedDueDate),
                actualDueDate: dateOnlyValue(updatedRow.actualDueDate),
                status: updatedRow.status,
                priority: updatedRow.priority,
                assignedToId: updatedRow.assignedToId || (customerSalesRep ? customerSalesRep.id : m.assignedToId),
                assignedToName: updatedRow.assignedTo?.name || (customerSalesRep ? customerSalesRep.name : m.assignedToName),
                attachments: updatedRow.attachments,
                notes: updatedRow.notes,
              }
            : m
        )
      : await MilestoneService.getMilestonesByProjectId(projectId);

    const evaluated = ScheduleEngine.evaluateMilestones(currentList);
    await prisma.project
      .update({
        where: { id: projectId },
        data: { isDelayed: evaluated.isDelayed },
      })
      .catch((err) => console.error("Failed to sync project isDelayed on milestone update:", err));

    if (existingMilestones && customerSalesRep) {
      return evaluated.milestones.find((m) => m.id === milestoneId);
    }

    return (await MilestoneService.getMilestonesByProjectId(projectId)).find((m) => m.id === milestoneId);
  },

  async advanceMilestone(
    projectId: string,
    milestoneId: string,
    options?: { notes?: string; attachments?: string; completedDate?: string },
    existingMilestones?: ProjectMilestoneItem[]
  ) {
    const [list, projectRecord] = await Promise.all([
      existingMilestones ? Promise.resolve(existingMilestones) : MilestoneService.getMilestonesByProjectId(projectId),
      prisma.project.findUnique({ where: { id: projectId }, select: { salesRepId: true } }),
    ]);
    const originalById = new Map(list.map((m) => [m.id, m]));
    const result = ScheduleEngine.advanceMilestone(list, milestoneId, options);
    const operations: Prisma.PrismaPromise<unknown>[] = [];
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
      if (orig && orig.status !== "IN_PROGRESS" && milestone.status === "IN_PROGRESS") {
        const isDrawing =
          milestone.phase === "PROPOSAL" ||
          milestone.phase === "PRE_PROD" ||
          milestone.stageCode.startsWith("3-") ||
          milestone.stageCode.startsWith("4-");
        const targetAssigneeId = milestone.assignedToId || orig?.assignedToId || projectRecord?.salesRepId;
        if (targetAssigneeId) {
          operations.push(
            prisma.salesTask.upsert({
              where: { milestoneId: milestone.id },
              update: {
                assignedToId: targetAssigneeId,
                dueDatetime: milestone.plannedDueDate ? new Date(`${milestone.plannedDueDate.slice(0, 10)}T00:00:00.000Z`) : new Date(),
                isCompleted: false,
              },
              create: {
                projectId,
                milestoneId: milestone.id,
                assignedToId: targetAssigneeId,
                taskType: isDrawing ? TaskType.DRAWING : TaskType.SITE_VISIT,
                subject: MILESTONE_STAGE_LABELS[milestone.stageCode as MilestoneStageCode] || "里程碑任務",
                dueDatetime: milestone.plannedDueDate ? new Date(`${milestone.plannedDueDate.slice(0, 10)}T00:00:00.000Z`) : new Date(),
                priority: milestone.priority || TaskPriority.MEDIUM,
                isCompleted: false,
              },
            })
          );
        }
      }
    }
    operations.push(prisma.project.update({
      where: { id: projectId },
      data: { currentStage: result.newCurrentStage as ProjectStage, isDelayed: result.isProjectDelayed },
    }));
    await prisma.$transaction(operations);
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
    const milestones = existingMilestones ?? await MilestoneService.getMilestonesByProjectId(projectId);
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

    // 狀態機防呆：正規進度不可跳級完成，目標之前的所有進度必須已全數完成
    if (isCompleted && isRegularStage) {
      const sorted = [...milestones].sort((a, b) => a.stageOrder - b.stageOrder);
      const sortedTargetIndex = sorted.findIndex((m) => m.id === milestoneId);
      if (sortedTargetIndex > 0) {
        const hasIncompletePreceding = sorted.slice(0, sortedTargetIndex).some((m) => m.status !== MilestoneStatus.COMPLETED);
        if (hasIncompletePreceding) {
          throw new ConflictError("無法跳級完成：前置里程碑尚未全數完成");
        }
      }
    }

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
        const todayStr = getTaiwanDateString();
        const nextPlannedStr = nextPlanned.toISOString().slice(0, 10);
        const finalPlannedStr = nextPlannedStr < todayStr ? todayStr : nextPlannedStr;
        return {
          ...milestone,
          plannedDueDate: finalPlannedStr,
        };
      }
      return milestone;
    });

    const firstIncomplete = nextMilestones.find((milestone) => milestone.status !== MilestoneStatus.COMPLETED);
    const currentStage = firstIncomplete
      ? STAGE_CODE_TO_PROJECT_STAGE[firstIncomplete.stageCode] as ProjectStage
      : target.stageCode === "X-1" ? ProjectStage.WRAP_UP : ProjectStage.DONE;
    const evaluated = ScheduleEngine.evaluateMilestones(nextMilestones);

    const operations: Prisma.PrismaPromise<unknown>[] = [
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

    await prisma.$transaction(operations);
    return evaluated.milestones;
  },

  async rollbackMilestone(projectId: string, milestoneId: string, existingMilestones?: ProjectMilestoneItem[]) {
    const milestones = existingMilestones ?? await MilestoneService.getMilestonesByProjectId(projectId);
    const targetIndex = milestones.findIndex((milestone) => milestone.id === milestoneId);
    if (targetIndex < 0 || milestones[targetIndex].status !== "COMPLETED") {
      throw new NotFoundError("找不到已完成的里程碑");
    }
    if (milestones.slice(targetIndex + 1).some((milestone) => milestone.status === "COMPLETED")) {
      throw new ConflictError("請由最後一個已完成的里程碑開始回退");
    }
    const target = milestones[targetIndex];
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
      const updated = { ...m };
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

    const resetPendingMilestoneIds: string[] = [];
    const shiftMilestoneIds: string[] = [];

    for (let i = targetIndex + 1; i < updatedList.length; i++) {
      const m = updatedList[i];
      const orig = milestones[i];
      if (m.status !== orig.status && m.status === MilestoneStatus.PENDING) {
        resetPendingMilestoneIds.push(m.id);
      }
      if (
        daysToRestore > 0 &&
        m.status !== MilestoneStatus.COMPLETED &&
        !["X-1", "X-2"].includes(m.stageCode) &&
        m.plannedDueDate
      ) {
        shiftMilestoneIds.push(m.id);
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. 回退目標里程碑狀態並清空實際完成日
      await tx.projectMilestone.update({
        where: { id: target.id },
        data: { status: evaluatedTarget.status, actualDueDate: null },
      });
      // 2. 重置關聯任務為未完成
      await tx.salesTask.updateMany({
        where: { milestoneId: target.id },
        data: { isCompleted: false, completedAt: null },
      });
      // 3. 更新案場階段與逾期評估
      await tx.project.update({
        where: { id: projectId },
        data: { currentStage: stage, isDelayed },
      });

      // 4. 批次將受影響的後續里程碑重置為 PENDING，並批次清理幽靈待辦任務
      if (resetPendingMilestoneIds.length > 0) {
        await tx.projectMilestone.updateMany({
          where: { id: { in: resetPendingMilestoneIds } },
          data: { status: MilestoneStatus.PENDING },
        });
        await tx.salesTask.deleteMany({
          where: { milestoneId: { in: resetPendingMilestoneIds }, isCompleted: false },
        });
      }

      // 5. 若有提前天數需還原，使用單一高效 SQL 批次平移所有後續里程碑與任務日期，避免數十次循序網路往返延遲
      if (daysToRestore > 0 && shiftMilestoneIds.length > 0) {
        await tx.$executeRaw`
          UPDATE project_milestones
          SET planned_due_date = planned_due_date + (${daysToRestore} * INTERVAL '1 day')
          WHERE id = ANY(${shiftMilestoneIds}::text[])
        `;
        await tx.$executeRaw`
          UPDATE sales_tasks
          SET due_datetime = due_datetime + (${daysToRestore} * INTERVAL '1 day')
          WHERE milestone_id = ANY(${shiftMilestoneIds}::text[]) AND is_completed = false
        `;
      }
    });

    return evaluatedMilestones;
  },

  async advanceProjectToSpecialStage(
    projectId: string,
    stageCode: "X-1" | "X-2",
    reason: string,
    existingProject?: ProjectDetail,
    existingMilestones?: ProjectMilestoneItem[],
  ) {
    const defaultDays = await ConfigService.getMilestoneDefaultDays();
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
      const projectSalesId = existingProject.salesRepId || existingProject.customerSalesRepId;
      const projectSalesName = existingProject.salesRepName || existingProject.customerSalesRepName;

      const milestoneOp = existingMilestone
        ? prisma.projectMilestone.update({
            where: { id: existingMilestone.id },
            data: {
              status: isWrapUp ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.COMPLETED,
              plannedDueDate: isWrapUp ? plannedDueDate : undefined,
              actualDueDate: isWrapUp ? null : actualDueDate,
              notes: reason,
              assignedToId: existingMilestone.assignedToId || projectSalesId,
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
              assignedToId: projectSalesId,
            },
          });

      const ops: Prisma.PrismaPromise<unknown>[] = [
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
      const [savedMs] = (await prisma.$transaction(ops)) as [{ id: string }, ...unknown[]];

      const updatedItem: ProjectMilestoneItem = existingMilestone
        ? {
            ...existingMilestone,
            status: isWrapUp ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.COMPLETED,
            plannedDueDate: isWrapUp ? dateOnlyValue(plannedDueDate) : existingMilestone.plannedDueDate,
            actualDueDate: isWrapUp ? null : dateOnlyValue(actualDueDate),
            notes: reason,
            assignedToId: existingMilestone.assignedToId || projectSalesId || null,
            assignedToName: existingMilestone.assignedToName || projectSalesName,
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
            assignedToId: projectSalesId || null,
            assignedToName: projectSalesName,
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

    return MilestoneService.getMilestonesByProjectId(projectId);
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

      const defaultDays = await ConfigService.getMilestoneDefaultDays();
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

    return MilestoneService.getMilestonesByProjectId(projectId);
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

        // 連動復原該里程碑的待辦任務，使其重新出現在業務工作台
        await tx.salesTask.updateMany({
          where: { milestoneId: firstIncomplete.id, resultNotes: "流標" },
          data: { isCompleted: false, completedAt: null, resultNotes: null },
        });
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
      const updatedMilestones = await MilestoneService.getMilestonesByProjectId(projectId);
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

      await prisma.$transaction([
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

    const updatedMilestones = await MilestoneService.getMilestonesByProjectId(projectId);
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

    return MilestoneService.getMilestonesByProjectId(projectId);
  },

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
    return prisma.$transaction(async (tx) => {
      const maxOrder = (await tx.milestoneRecord.aggregate({
        where: { milestoneId },
        _max: { recordOrder: true },
      }))._max.recordOrder || 0;

      const record = await tx.milestoneRecord.create({
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
      });

      if (data.actualDueDate) {
        await tx.projectMilestone.update({
          where: { id: milestoneId },
          data: { actualDueDate: new Date(data.actualDueDate) },
        });
      }

      return record;
    });
  },

  async deleteMilestoneRecord(recordId: string) {
    return prisma.milestoneRecord.delete({ where: { id: recordId } });
  },

  async reorderMilestones(projectId: string, orderedMilestoneIds: string[]): Promise<ProjectMilestoneItem[]> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.projectMilestone.findMany({
        where: { projectId },
        select: { id: true, status: true },
      });
      const existingIdSet = new Set(existing.map((m) => m.id));

      for (const id of orderedMilestoneIds) {
        if (!existingIdSet.has(id)) {
          throw new BadRequestError(`里程碑項目不存在或不屬於此案件: ${id}`);
        }
      }

      await Promise.all(
        orderedMilestoneIds.map((id, index) =>
          tx.projectMilestone.update({
            where: { id },
            data: { stageOrder: index + 1 },
          })
        )
      );

      const updated = await tx.projectMilestone.findMany({
        where: { projectId },
        include: milestoneInclude,
        orderBy: { stageOrder: "asc" },
      });

      return updated.map((m) => {
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
          assignedToId: m.assignedToId || null,
          assignedToName: m.assignedTo?.name || null,
          attachments: m.attachments,
          notes: m.notes,
          auditSubmitted: isAuditSubmitted,
        };
      });
    });
  },
};
