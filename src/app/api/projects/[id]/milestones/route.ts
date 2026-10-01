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
    const { action, milestoneId, notes, attachments, updates } = body;

    if (!milestoneId) {
      return NextResponse.json({ error: "缺少 milestoneId" }, { status: 400 });
    }

    if (action === "advance") {
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
