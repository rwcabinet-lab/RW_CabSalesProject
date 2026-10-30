import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";
import { QUOTE_STAGE_CODES } from "@/lib/constants";
import { handleApiError } from "@/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const milestoneId = req.nextUrl.searchParams.get("milestoneId");
    if (!milestoneId) {
      return NextResponse.json({ error: "缺少 milestoneId" }, { status: 400 });
    }
    const records = await DataService.getMilestoneRecords(milestoneId);
    return NextResponse.json(records);
  } catch (err) {
    return handleApiError(err, "讀取紀錄失敗");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const body = await req.json();
    const { milestoneId, plannedDueDate, actualDueDate, amount, notes, assignedToId } = body;
    if (typeof milestoneId !== "string" || !milestoneId) {
      return NextResponse.json({ error: "缺少 milestoneId" }, { status: 400 });
    }
    const stageCode = await DataService.getMilestoneStageCode(params.id, milestoneId);
    if (!stageCode) return NextResponse.json({ error: "找不到此里程碑" }, { status: 404 });
    if (amount !== undefined && amount !== "" && !QUOTE_STAGE_CODES.has(stageCode)) {
      return NextResponse.json({ error: "只有報價相關進度可填寫報價金額" }, { status: 400 });
    }
    if (amount !== undefined && amount !== "" && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json({ error: "報價金額格式無效" }, { status: 400 });
    }
    if (
      (plannedDueDate !== undefined && plannedDueDate !== "" && typeof plannedDueDate !== "string") ||
      (actualDueDate !== undefined && actualDueDate !== "" && typeof actualDueDate !== "string") ||
      (notes !== undefined && typeof notes !== "string") ||
      (assignedToId !== undefined && assignedToId !== null && typeof assignedToId !== "string")
    ) {
      return NextResponse.json({ error: "歷次紀錄欄位格式無效" }, { status: 400 });
    }
    if (assignedToId) {
      const assignee = await DataService.getUserById(assignedToId);
      if (!assignee || assignee.role === "ADMIN" || assignee.role === "LEVEL_MANAGER") {
        return NextResponse.json({ error: "負責人員不可為管理者或理級主管" }, { status: 400 });
      }
    }
    const record = await DataService.addMilestoneRecord(milestoneId, {
      plannedDueDate,
      actualDueDate,
      amount: amount !== undefined && amount !== "" ? amount : undefined,
      notes,
      assignedToId: assignedToId || undefined,
    });
    return NextResponse.json({ success: true, record });
  } catch (err) {
    return handleApiError(err, "新增紀錄失敗");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const body = await req.json();
    const { recordId } = body;
    if (!recordId) {
      return NextResponse.json({ error: "缺少 recordId" }, { status: 400 });
    }
    await DataService.deleteMilestoneRecord(recordId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "刪除紀錄失敗");
  }
}
