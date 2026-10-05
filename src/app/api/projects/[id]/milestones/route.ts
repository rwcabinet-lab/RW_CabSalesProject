import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const project = await DataService.getProjectById(projectId);

    if (!project) {
      return NextResponse.json({ error: "查無此案場資料" }, { status: 404 });
    }

    const milestones = await DataService.getMilestonesByProjectId(projectId);

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
    const { action, milestoneId, notes, attachments, updates, stageCode, reason } = body;

    if (action === "returnToProduction") {
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

    if (action === "advance") {
      const project = await DataService.getProjectById(projectId);
      if (project?.currentStage === "WRAP_UP" || project?.currentStage === "LOST") {
        return NextResponse.json({ error: "此案件已進入額外階段，無法繼續推進一般里程碑" }, { status: 409 });
      }

      // 快速推進此里程碑完成，並啟動下一里程碑
      const result = await DataService.advanceMilestone(projectId, milestoneId, {
        notes,
        attachments,
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
    return NextResponse.json({ error: "更新里程碑失敗" }, { status: 500 });
  }
}
