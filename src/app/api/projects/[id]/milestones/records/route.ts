import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const milestoneId = req.nextUrl.searchParams.get("milestoneId");
    if (!milestoneId) {
      return NextResponse.json({ error: "缺少 milestoneId" }, { status: 400 });
    }
    const records = await DataService.getMilestoneRecords(milestoneId);
    return NextResponse.json(records);
  } catch (err) {
    console.error("Failed to get milestone records:", err);
    return NextResponse.json({ error: "讀取紀錄失敗" }, { status: 500 });
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
    const { milestoneId, plannedDueDate, actualDueDate, amount, notes } = body;
    if (!milestoneId) {
      return NextResponse.json({ error: "缺少 milestoneId" }, { status: 400 });
    }
    const record = await DataService.addMilestoneRecord(milestoneId, {
      plannedDueDate,
      actualDueDate,
      amount: amount !== undefined && amount !== "" ? Number(amount) : undefined,
      notes,
    });
    return NextResponse.json({ success: true, record });
  } catch (err) {
    console.error("Failed to add milestone record:", err);
    return NextResponse.json({ error: "新增紀錄失敗" }, { status: 500 });
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
    console.error("Failed to delete milestone record:", err);
    return NextResponse.json({ error: "刪除紀錄失敗" }, { status: 500 });
  }
}
