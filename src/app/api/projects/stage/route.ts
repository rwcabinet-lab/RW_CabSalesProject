import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ProjectStage } from "@prisma/client";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, stage, reason } = body;

    if (!projectId || !stage) {
      return NextResponse.json({ error: "缺少 projectId 或 stage" }, { status: 400 });
    }

    if (stage === "WRAP_UP" || stage === "LOST") {
      if (typeof reason !== "string" || !reason.trim()) {
        return NextResponse.json({ error: "請填寫推進原因" }, { status: 400 });
      }
      await DataService.advanceProjectToSpecialStage(projectId, stage === "WRAP_UP" ? "X-1" : "X-2", reason.trim());
    } else if (Object.values(ProjectStage).includes(stage)) {
      await DataService.updateProjectStage(projectId, stage);
    } else {
      return NextResponse.json({ error: "無效的案場階段" }, { status: 400 });
    }

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
