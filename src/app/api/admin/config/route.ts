import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import {
  MILESTONE_DEFAULT_DAYS,
  normalizeMilestoneDefaultDays,
  normalizeProjectColumns,
} from "@/lib/constants";
import { getUserFromRequest } from "@/lib/access-control";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

    const key = req.nextUrl.searchParams.get("key");
    if (key === "columns") {
      const savedColumns = await DataService.getAppConfig<unknown>("project_columns", []);
      const columns = normalizeProjectColumns(savedColumns);
      return NextResponse.json(
        { columns },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    if (key === "stageDays") {
      const rawStageDays = await DataService.getAppConfig<unknown>(
        "milestone_default_days",
        MILESTONE_DEFAULT_DAYS,
      );
      const stageDays = normalizeMilestoneDefaultDays(rawStageDays);
      return NextResponse.json(
        { stageDays },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    if (key === "customerTypeStages" || key === "customer_type_start_stages") {
      const customerTypeStages = await DataService.getCustomerTypeStartStages();
      return NextResponse.json({ customerTypeStages });
    }
    return NextResponse.json({ error: "無效的 key 參數" }, { status: 400 });
  } catch (err) {
    return handleApiError(err, "讀取設定失敗");
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
    if (!key || typeof key !== "string" || value === undefined) {
      return NextResponse.json({ error: "缺少 key 或 value" }, { status: 400 });
    }
    if (
      key === "milestone_default_days" &&
      (typeof value !== "object" || value === null || Array.isArray(value))
    ) {
      return NextResponse.json({ error: "預設天數設定格式無效" }, { status: 400 });
    }
    const savedValue =
      key === "project_columns"
        ? normalizeProjectColumns(value)
        : key === "milestone_default_days"
          ? normalizeMilestoneDefaultDays(value)
          : value;
    await DataService.setAppConfig(key, savedValue);
    return NextResponse.json(
      {
        success: true,
        ...(key === "project_columns" ? { columns: savedValue } : {}),
        ...(key === "milestone_default_days" ? { stageDays: savedValue } : {}),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return handleApiError(err, "儲存設定失敗");
  }
}
