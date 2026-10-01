import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, stage } = body;

    if (!projectId || !stage) {
      return NextResponse.json({ error: "缺少 projectId 或 stage" }, { status: 400 });
    }

    await DataService.updateProjectStage(projectId, stage);
    const updated = await DataService.getProjectById(projectId);

    return NextResponse.json({
      success: true,
      project: updated,
      message: `成功將案場階段變更為 ${stage}`,
    });
  } catch (error) {
    console.error("Failed to update project stage:", error);
    return NextResponse.json({ error: "變更案場階段失敗" }, { status: 500 });
  }
}
