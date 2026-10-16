import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine, STAGE_CODE_TO_PROJECT_STAGE } from "@/lib/schedule-engine";
import { getUserFromRequest } from "@/lib/access-control";
import { AUDIT_STAGE_CODES, STANDARD_MILESTONE_STAGE_CODES } from "@/lib/mock-data";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function attachTrafficLights<T extends Parameters<typeof ScheduleEngine.getTrafficLight>[0]>(milestones: T[]) {
  return milestones.map((m) => ({
    ...m,
    trafficLight: ScheduleEngine.getTrafficLight(m),
  }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const combined = await DataService.getProjectWithMilestones(projectId);
    if (!combined) {
      return NextResponse.json({ error: "查無此案場資料" }, { status: 404 });
    }
    const { project: projectRecord } = combined;
    let initialMilestones = combined.milestones;
    if (projectRecord.currentStage !== "LOST") {
      const existingCodes = new Set(initialMilestones.map((m) => m.stageCode));
      const hasMissing = STANDARD_MILESTONE_STAGE_CODES.some((code) => !existingCodes.has(code));
      if (hasMissing) {
        await DataService.ensureProjectMilestones(projectId);
        initialMilestones = await DataService.getMilestonesByProjectId(projectId);
      }
    }
    const hasLegacyWrapUp =
      projectRecord.currentStage === "WRAP_UP" &&
      initialMilestones.some((m) => m.stageCode === "X-1" && m.status === "COMPLETED" && !m.plannedDueDate);
    const milestones = hasLegacyWrapUp
      ? await DataService.activateLegacyWrapUpMilestone(projectId)
      : initialMilestones;
    const { isDelayed } = ScheduleEngine.evaluateMilestones(milestones);
    const project = { ...projectRecord, isDelayed: projectRecord.isDelayed || isDelayed };

    return NextResponse.json({
      project,
      milestones: attachTrafficLights(milestones),
    });
  } catch (error) {
    console.error("Failed to get milestones:", error);
    return NextResponse.json({ error: "無法讀取里程碑" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = await req.json();
    const { action, milestoneId, notes, attachments, updates, stageCode, reason, actualDueDate, isCompleted } = body;

    const [user, combined] = await Promise.all([
      getUserFromRequest(req),
      DataService.getProjectWithMilestones(projectId),
    ]);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    if (!combined) {
      return NextResponse.json({ error: "查無此案場資料" }, { status: 404 });
    }
    const { project, milestones: initialMilestones } = combined;
    if (project.currentStage === "LOST") {
      return NextResponse.json({ error: "此案件已流標，階段項目不可編輯或推進" }, { status: 409 });
    }
    const isManager = ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"].includes(user.role);
    const canReviewAudit = isManager || user.id === project.salesRepId;

    if (action === "submitAudit") {
      if (!milestoneId || typeof milestoneId !== "string") {
        return NextResponse.json({ error: "缺少 milestoneId" }, { status: 400 });
      }
      if (notes !== undefined && typeof notes !== "string") {
        return NextResponse.json({ error: "審核備註格式無效" }, { status: 400 });
      }
      const milestone = initialMilestones.find((item) => item.id === milestoneId);
      if (!milestone) return NextResponse.json({ error: "找不到此里程碑" }, { status: 404 });
      if (!AUDIT_STAGE_CODES.has(milestone.stageCode)) {
        return NextResponse.json({ error: "此里程碑不需要審核" }, { status: 400 });
      }
      if (milestone.assignedToId !== user.id) {
        return NextResponse.json({ error: "僅此進度的負責人員可提交審核" }, { status: 403 });
      }

      await DataService.submitMilestoneForReview(
        projectId,
        milestoneId,
        user.id,
        project.salesRepId,
        notes,
        initialMilestones,
      );
      const updatedMilestones = initialMilestones.map((m) =>
        m.id === milestoneId ? { ...m, auditSubmitted: true } : m
      );
      return NextResponse.json({
        success: true,
        project,
        milestones: attachTrafficLights(updatedMilestones),
      });
    }

    if (action === "returnToProduction") {
      if (!isManager) {
        return NextResponse.json({ error: "僅主管可回到第三階段" }, { status: 403 });
      }
      if (project.currentStage !== "WRAP_UP") {
        return NextResponse.json({ error: "只有收尾階段可返回第三階段" }, { status: 409 });
      }

      const milestones = await DataService.returnProjectToProduction(projectId);
      const { isDelayed } = ScheduleEngine.evaluateMilestones(milestones);
      const updatedProject = { ...project, currentStage: "PRODUCTION", isDelayed };
      return NextResponse.json({
        success: true,
        project: updatedProject,
        milestones: attachTrafficLights(milestones),
      });
    }

    if (action === "specialAdvance") {
      if (!isManager) {
        return NextResponse.json({ error: "僅主管可推進至額外階段" }, { status: 403 });
      }
      if (stageCode !== "X-1" && stageCode !== "X-2") {
        return NextResponse.json({ error: "無效的額外階段" }, { status: 400 });
      }
      if (typeof reason !== "string" || !reason.trim()) {
        return NextResponse.json({ error: "請填寫推進原因" }, { status: 400 });
      }

      const nextStageCode: "X-1" | "X-2" = stageCode;
      const milestones = await DataService.advanceProjectToSpecialStage(
        projectId,
        nextStageCode,
        reason.trim(),
        project,
        initialMilestones,
      );
      const { isDelayed } = ScheduleEngine.evaluateMilestones(milestones);
      const updatedProject = {
        ...project,
        currentStage: STAGE_CODE_TO_PROJECT_STAGE[nextStageCode] || project.currentStage,
        isDelayed,
      };
      return NextResponse.json({
        success: true,
        project: updatedProject,
        milestones: attachTrafficLights(milestones),
      });
    }

    if (action === "reorder") {
      const { orderedMilestoneIds } = body;
      if (!Array.isArray(orderedMilestoneIds) || orderedMilestoneIds.some((id) => typeof id !== "string")) {
        return NextResponse.json({ error: "缺少 orderedMilestoneIds 陣列" }, { status: 400 });
      }
      const milestones = await DataService.reorderMilestones(projectId, orderedMilestoneIds, initialMilestones);
      const { isDelayed } = ScheduleEngine.evaluateMilestones(milestones);
      const updatedProject = { ...project, isDelayed };
      return NextResponse.json({
        success: true,
        project: updatedProject,
        milestones: attachTrafficLights(milestones),
      });
    }

    if (!milestoneId) {
      return NextResponse.json({ error: "缺少 milestoneId" }, { status: 400 });
    }

    const targetMilestone = initialMilestones.find((item) => item.id === milestoneId);

    if (action === "rollback") {
      const canRollback = isManager || user.id === project.salesRepId;
      if (!canRollback) {
        return NextResponse.json({ error: "僅主管或主責業務可回退已完成的進度" }, { status: 403 });
      }
      const milestones = await DataService.rollbackMilestone(projectId, milestoneId, initialMilestones);
      const { isDelayed } = ScheduleEngine.evaluateMilestones(milestones);
      const updatedStage = targetMilestone
        ? STAGE_CODE_TO_PROJECT_STAGE[targetMilestone.stageCode] || project.currentStage
        : project.currentStage;
      const updatedProject = { ...project, currentStage: updatedStage, isDelayed };
      return NextResponse.json({
        success: true,
        project: updatedProject,
        milestones: attachTrafficLights(milestones),
      });
    }

    if (action === "toggleCompletion") {
      if (typeof isCompleted !== "boolean") {
        return NextResponse.json({ error: "缺少完成狀態" }, { status: 400 });
      }
      if (notes !== undefined && typeof notes !== "string") {
        return NextResponse.json({ error: "完成備註格式無效" }, { status: 400 });
      }
      if (isCompleted && AUDIT_STAGE_CODES.has(targetMilestone?.stageCode || "")) {
        if (!targetMilestone?.auditSubmitted) {
          return NextResponse.json({ error: "請先提交審核，再由審核人員完成此進度" }, { status: 409 });
        }
        if (!canReviewAudit) {
          return NextResponse.json({ error: "僅審核人員可完成此進度" }, { status: 403 });
        }
      }
      if (isCompleted && actualDueDate !== undefined && !isValidDateOnly(actualDueDate)) {
        return NextResponse.json({ error: "實際完成日格式無效" }, { status: 400 });
      }
      const milestones = await DataService.setMilestoneCompletion(
        projectId,
        milestoneId,
        isCompleted,
        isCompleted ? actualDueDate || new Date().toISOString().slice(0, 10) : "",
        typeof notes === "string" ? notes : undefined,
        initialMilestones,
      );
      const firstIncomplete = milestones.find((m) => m.status !== "COMPLETED");
      const currentStage = firstIncomplete
        ? STAGE_CODE_TO_PROJECT_STAGE[firstIncomplete.stageCode] || project.currentStage
        : targetMilestone?.stageCode === "X-1" ? "WRAP_UP" : "DONE";
      const { isDelayed } = ScheduleEngine.evaluateMilestones(milestones);
      const updatedProject = { ...project, currentStage, isDelayed };
      return NextResponse.json({
        success: true,
        project: updatedProject,
        milestones: attachTrafficLights(milestones),
      });
    }

    if (action !== "advance") {
      if (!isManager) {
        return NextResponse.json({ error: "僅理級主管或業務主管可編輯里程碑" }, { status: 403 });
      }
      if (
        !updates ||
        Object.keys(updates).some((key) => !["plannedDueDate", "assignedToId", "priority", "notes"].includes(key))
      ) {
        return NextResponse.json({ error: "僅可編輯預定完成日、負責人、優先度及備註" }, { status: 400 });
      }
      if (
        (updates.plannedDueDate !== undefined &&
          updates.plannedDueDate !== null &&
          !isValidDateOnly(updates.plannedDueDate)) ||
        (updates.assignedToId !== undefined &&
          updates.assignedToId !== null &&
          typeof updates.assignedToId !== "string") ||
        (updates.notes !== undefined && typeof updates.notes !== "string") ||
        (updates.priority !== undefined && !["HIGH", "MEDIUM", "LOW"].includes(updates.priority))
      ) {
        return NextResponse.json({ error: "里程碑欄位格式無效" }, { status: 400 });
      }
      if (updates.assignedToId !== undefined) {
        if (targetMilestone?.auditSubmitted) {
          return NextResponse.json({ error: "審核進行中，暫不可變更此進度負責人" }, { status: 409 });
        }
      }
      if (typeof updates.assignedToId === "string" && updates.assignedToId) {
        const assignee = await DataService.getUserById(updates.assignedToId);
        if (!assignee || !["SALES_MANAGER", "SALES", "ASSISTANT"].includes(assignee.role)) {
          return NextResponse.json({ error: "負責人必須是有效的業務主管、業務或業助帳號" }, { status: 400 });
        }
      }
    }

    if (action === "advance") {
      if (actualDueDate !== undefined && !isValidDateOnly(actualDueDate)) {
        return NextResponse.json({ error: "實際完成日格式無效" }, { status: 400 });
      }
      if (project.currentStage === "WRAP_UP") {
        if (!targetMilestone || targetMilestone.stageCode !== "X-1") {
          return NextResponse.json({ error: "收尾階段僅可完成收尾項目" }, { status: 409 });
        }

        const milestones = await DataService.completeWrapUpMilestone(
          projectId,
          milestoneId,
          {
            notes: typeof notes === "string" ? notes : undefined,
            completedDate: actualDueDate || new Date().toISOString().slice(0, 10),
          },
          project,
          initialMilestones,
        );
        const { isDelayed } = ScheduleEngine.evaluateMilestones(milestones);
        const updatedProject = { ...project, isDelayed };
        return NextResponse.json({
          success: true,
          project: updatedProject,
          milestones: attachTrafficLights(milestones),
        });
      }
      if (project.currentStage === "LOST") {
        return NextResponse.json({ error: "此案件已進入額外階段，無法繼續推進一般里程碑" }, { status: 409 });
      }
      if (AUDIT_STAGE_CODES.has(targetMilestone?.stageCode || "")) {
        if (!targetMilestone?.auditSubmitted) {
          return NextResponse.json({ error: "請先提交審核，再由審核人員完成此進度" }, { status: 409 });
        }
        if (!canReviewAudit) {
          return NextResponse.json({ error: "僅審核人員可完成此進度" }, { status: 403 });
        }
      }

      // 快速推進此里程碑完成，並啟動下一里程碑
      const result = await DataService.advanceMilestone(
        projectId,
        milestoneId,
        {
          notes,
          attachments,
          completedDate: actualDueDate,
        },
        initialMilestones,
      );

      const updatedProject = {
        ...project,
        currentStage: result.newStage,
        isDelayed: result.isDelayed,
      };

      return NextResponse.json({
        success: true,
        message: `成功完成里程碑並推進案場階段至 ${result.newStage}`,
        project: updatedProject,
        milestones: attachTrafficLights(result.updatedMilestones),
      });
    }

    // 一般修改
    if (updates?.notes !== undefined) {
      if ((targetMilestone?.stageCode === "X-1" || targetMilestone?.stageCode === "X-2") && (typeof updates.notes !== "string" || !updates.notes.trim())) {
        return NextResponse.json({ error: "額外階段的推進原因不可空白" }, { status: 400 });
      }
      if (targetMilestone?.stageCode === "X-1" || targetMilestone?.stageCode === "X-2") {
        updates.notes = updates.notes.trim();
      }
    }
    const updated = await DataService.updateMilestone(
      projectId,
      milestoneId,
      updates || {},
      initialMilestones,
      {
        id: project.customerSalesRepId || project.salesRepId,
        name: project.customerSalesRepName || project.salesRepName,
      },
    );
    const updatedMilestones = initialMilestones.map((m) => (m.id === milestoneId && updated ? updated : m));
    const { milestones: evaluatedMilestones, isDelayed } = ScheduleEngine.evaluateMilestones(updatedMilestones);
    const updatedProject = { ...project, isDelayed };

    return NextResponse.json({
      success: true,
      milestone: updated,
      project: updatedProject,
      milestones: attachTrafficLights(evaluatedMilestones),
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Failed to update milestone:", error);
    if (error instanceof Error && (
      error.message === "只能完成目前進行中的里程碑" ||
      error.message === "只能完成目前進行中的收尾項目" ||
      error.message === "案件已離開收尾階段" ||
      error.message === "已完成的里程碑不可編輯" ||
      error.message === "找不到此里程碑" ||
      error.message === "此里程碑不需要審核" ||
      error.message === "只能提交目前進行中的審核項目" ||
      error.message === "排序清單必須包含此案件的所有里程碑且不可重複" ||
      error.message === "找不到已完成的里程碑" ||
      error.message === "請由最後一個已完成的里程碑開始回退"
    )) {
      const status = error.message === "找不到此里程碑" ? 404
        : error.message === "排序清單必須包含此案件的所有里程碑且不可重複" ? 400
          : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "更新里程碑失敗" }, { status: 500 });
  }
}
