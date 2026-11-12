import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";
import { handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/projects/[id]/phases — 取得特定案場之所有分期
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const phases = await DataService.getProjects({
      where: { parentId: params.id },
    });

    return NextResponse.json(phases);
  } catch (err) {
    return handleApiError(err, "讀取案場分期失敗");
  }
}

// POST /api/projects/[id]/phases — 為特定案場新增期數
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "僅系統管理者可新增案件期數" }, { status: 403 });
    }

    const body = await req.json();
    const { phaseName, expectedDate, unitCount, cost, quoteAmount, salesRepId, startStageCode } = body;

    const newPhase = await DataService.addProjectPhase(params.id, {
      phaseName: typeof phaseName === "string" ? phaseName : "",
      expectedDate: typeof expectedDate === "string" && expectedDate ? expectedDate : undefined,
      unitCount: unitCount ? Number(unitCount) : undefined,
      cost: cost ? Number(cost) : undefined,
      quoteAmount: quoteAmount ? Number(quoteAmount) : undefined,
      salesRepId: typeof salesRepId === "string" && salesRepId ? salesRepId : undefined,
      startStageCode: typeof startStageCode === "string" && startStageCode ? startStageCode : undefined,
    });

    return NextResponse.json({ phase: newPhase }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "新增案場期數失敗");
  }
}
