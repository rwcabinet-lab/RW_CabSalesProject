import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

    const summary = await DataService.evaluateAllSchedules();
    return NextResponse.json({
      success: true,
      message: "全局時程逾期檢核評估完成",
      summary,
    });
  } catch (error) {
    console.error("Failed to evaluate schedules:", error);
    return NextResponse.json({ error: "時程檢核執行失敗" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

    const summary = await DataService.evaluateAllSchedules();
    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Failed to get schedule evaluation:", error);
    return NextResponse.json({ error: "無法取得時程狀態" }, { status: 500 });
  }
}
