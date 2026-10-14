import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { DEFAULT_PROJECT_COLUMNS, MILESTONE_DEFAULT_DAYS } from "@/lib/mock-data";
import { getUserFromRequest } from "@/lib/access-control";

export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key");
    if (key === "columns") {
      const columns = await DataService.getAppConfig("project_columns", DEFAULT_PROJECT_COLUMNS);
      return NextResponse.json({ columns });
    }
    if (key === "stageDays") {
      const stageDays = await DataService.getAppConfig("milestone_default_days", MILESTONE_DEFAULT_DAYS);
      return NextResponse.json({ stageDays });
    }
    return NextResponse.json({ error: "無效的 key 參數" }, { status: 400 });
  } catch (err) {
    console.error("Failed to get config:", err);
    return NextResponse.json({ error: "讀取設定失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "僅管理者有權修改全域設定" }, { status: 403 });
    }
    const body = await req.json();
    const { key, value } = body;
    if (!key || value === undefined) {
      return NextResponse.json({ error: "缺少 key 或 value" }, { status: 400 });
    }
    await DataService.setAppConfig(key, value);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save config:", err);
    return NextResponse.json({ error: "儲存設定失敗" }, { status: 500 });
  }
}
