import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { getUserFromRequest } from "@/lib/access-control";

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const [projectRecord, milestones] = await Promise.all([
      DataService.getProjectById(projectId, { evaluateSchedule: false }),
      DataService.getMilestonesByProjectId(projectId),
    ]);

    if (!projectRecord) {
      return NextResponse.json({ error: "查無此案場資料" }, { status: 404 });
    }
    const { isDelayed } = ScheduleEngine.evaluateMilestones(milestones);
    const project = { ...projectRecord, isDelayed: projectRecord.isDelayed || isDelayed };

    // 附帶計算各里程碑的燈號 (紅黃綠)
    const milestonesWithTrafficLights = milestones.map((m) => ({
      ...m,
      trafficLight: ScheduleEngine.getTrafficLight(m),
    }));

    return NextResponse.json({
      project,
      milestones: milestonesWithTrafficLights,
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
    const { action, milestoneId, notes, attachments, updates, stageCode, reason, actualDueDate } = body;
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const isManager = ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"].includes(user.role);

    if (action === "returnToProduction") {
      if (!isManager) {
        return NextResponse.json({ error: "僅主管可回到第三階段" }, { status: 403 });
      }
      const project = await DataService.getProjectById(projectId);
      if (!project) {
        return NextResponse.json({ error: "查無此案場資料" }, { status: 404 });
      }
      if (project.currentStage !== "WRAP_UP") {
        return NextResponse.json({ error: "只有收尾階段可返回第三階段" }, { status: 409 });
      }

      const milestones = await DataService.returnProjectToProduction(projectId);
      const updatedProject = await DataService.getProjectById(projectId);
      return NextResponse.json({ success: true, project: updatedProject, milestones });
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

      const milestones = await DataService.advanceProjectToSpecialStage(projectId, stageCode, reason.trim());
      const updatedProject = await DataService.getProjectById(projectId);
      return NextResponse.json({
        success: true,
        project: updatedProject,
        milestones,
      });
    }

    if (!milestoneId) {
      return NextResponse.json({ error: "缺少 milestoneId" }, { status: 400 });
    }

    if (action === "rollback") {
      if (!isManager) {
        return NextResponse.json({ error: "僅主管可回退已完成的里程碑" }, { status: 403 });
      }
      const milestones = await DataService.rollbackMilestone(projectId, milestoneId);
      const updatedProject = await DataService.getProjectById(projectId);
      return NextResponse.json({ success: true, project: updatedProject, milestones });
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
      if (typeof updates.assignedToId === "string" && updates.assignedToId) {
        const assignee = await DataService.getUserById(updates.assignedToId);
        if (!assignee || (assignee.role !== "SALES" && assignee.role !== "ASSISTANT")) {
          return NextResponse.json({ error: "負責人必須是有效的業務或業助帳號" }, { status: 400 });
        }
      }
    }

    if (action === "advance") {
      if (actualDueDate !== undefined && !isValidDateOnly(actualDueDate)) {
        return NextResponse.json({ error: "實際完成日格式無效" }, { status: 400 });
      }
      const project = await DataService.getProjectById(projectId);
      if (!project) {
        return NextResponse.json({ error: "查無此案場資料" }, { status: 404 });
      }
      if (project.currentStage === "WRAP_UP") {
        const wrapUpMilestone = (await DataService.getMilestonesByProjectId(projectId))
          .find((milestone) => milestone.id === milestoneId);
        if (!wrapUpMilestone || wrapUpMilestone.stageCode !== "X-1") {
          return NextResponse.json({ error: "收尾階段僅可完成收尾項目" }, { status: 409 });
        }

        const milestones = await DataService.completeWrapUpMilestone(projectId, milestoneId, {
          notes: typeof notes === "string" ? notes : undefined,
          completedDate: actualDueDate || new Date().toISOString().slice(0, 10),
        });
        const updatedProject = await DataService.getProjectById(projectId);
        return NextResponse.json({ success: true, project: updatedProject, milestones });
      }
      if (project.currentStage === "LOST") {
        return NextResponse.json({ error: "此案件已進入額外階段，無法繼續推進一般里程碑" }, { status: 409 });
      }

      // 快速推進此里程碑完成，並啟動下一里程碑
      const result = await DataService.advanceMilestone(projectId, milestoneId, {
        notes,
        attachments,
        completedDate: actualDueDate,
      });

      const updatedProject = await DataService.getProjectById(projectId);

      return NextResponse.json({
        success: true,
        message: `成功完成里程碑並推進案場階段至 ${result.newStage}`,
        project: updatedProject,
        milestones: result.updatedMilestones,
      });
    }

    // 一般修改
    if (updates?.notes !== undefined) {
      const milestone = (await DataService.getMilestonesByProjectId(projectId)).find((item) => item.id === milestoneId);
      if ((milestone?.stageCode === "X-1" || milestone?.stageCode === "X-2") && (typeof updates.notes !== "string" || !updates.notes.trim())) {
        return NextResponse.json({ error: "額外階段的推進原因不可空白" }, { status: 400 });
      }
      if (milestone?.stageCode === "X-1" || milestone?.stageCode === "X-2") {
        updates.notes = updates.notes.trim();
      }
    }
    const updated = await DataService.updateMilestone(projectId, milestoneId, updates || {});
    const updatedProject = await DataService.getProjectById(projectId);

    return NextResponse.json({
      success: true,
      milestone: updated,
      project: updatedProject,
    });
  } catch (error) {
    console.error("Failed to update milestone:", error);
    if (error instanceof Error && (
      error.message === "只能完成目前進行中的里程碑" ||
      error.message === "只能完成目前進行中的收尾項目" ||
      error.message === "案件已離開收尾階段" ||
      error.message === "找不到已完成的里程碑" ||
      error.message === "請由最後一個已完成的里程碑開始回退"
    )) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "更新里程碑失敗" }, { status: 500 });
  }
}
