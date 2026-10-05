import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";

// GET /api/projects — 取得所有案場
export async function GET() {
  const projects = await DataService.getProjects();
  return NextResponse.json(projects);
}

// POST /api/projects — 新增案場
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectName, customerId, siteAddress, siteCondition, expectedDate, unitCount, cost, quoteAmount } = body;

    if (!projectName || !customerId || !siteAddress) {
      return NextResponse.json({ error: "案場名稱、關聯客戶、施工地址為必填欄位" }, { status: 400 });
    }

    const project = await DataService.addProject({
      projectName,
      customerId,
      siteAddress,
      siteCondition,
      expectedDate,
      unitCount: unitCount ? Number(unitCount) : undefined,
      cost: cost ? Number(cost) : undefined,
      quoteAmount: quoteAmount ? Number(quoteAmount) : undefined,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "新增案場失敗" }, { status: 500 });
  }
}

// PATCH /api/projects — 修改案場資料
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const updated = await DataService.updateProject(id, data);
    if (!updated) return NextResponse.json({ error: "找不到案場" }, { status: 404 });
    return NextResponse.json({ project: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "修改案場失敗" }, { status: 500 });
  }
}