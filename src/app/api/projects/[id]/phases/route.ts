import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { canUserAccessProject, getUserFromRequest } from "@/lib/access-control";
import { handleApiError } from "@/lib/errors";

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

    const access = await canUserAccessProject(user, params.id);
    if (!access.exists) {
      return NextResponse.json({ error: "找不到母案場" }, { status: 404 });
    }
    if (!access.allowed) {
      return NextResponse.json({ error: "您無權查看此案場分期" }, { status: 403 });
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

    const CAN_CREATE_ROLES = ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER", "SALES", "ASSISTANT", "SITE_ENGINEER"];
    if (!CAN_CREATE_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "沒有新增案場分期之權限" }, { status: 403 });
    }

    const access = await canUserAccessProject(user, params.id);
    if (!access.exists) {
      return NextResponse.json({ error: "找不到母案場" }, { status: 404 });
    }
    if (!access.allowed) {
      return NextResponse.json({ error: "僅主管或此案場相關負責人員可新增分期" }, { status: 403 });
    }

    const body = await req.json();
    const { phaseName, expectedDate, billingDate, unitCount, cost, quoteAmount, salesRepId, startStageCode } = body;

    if (billingDate !== undefined && billingDate !== null && billingDate !== "") {
      if (
        typeof billingDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(billingDate.slice(0, 10))
      ) {
        return NextResponse.json({ error: "立帳日期格式無效" }, { status: 400 });
      }
    }

    const newPhase = await DataService.addProjectPhase(params.id, {
      phaseName: typeof phaseName === "string" ? phaseName : "",
      expectedDate: typeof expectedDate === "string" && expectedDate ? expectedDate : undefined,
      billingDate: typeof billingDate === "string" && billingDate ? billingDate.slice(0, 10) : undefined,
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
