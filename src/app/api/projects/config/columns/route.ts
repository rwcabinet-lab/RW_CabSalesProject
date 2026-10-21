import { NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { normalizeProjectColumns } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const savedColumns = await DataService.getAppConfig<unknown>("project_columns", []);
    return NextResponse.json(
      { columns: normalizeProjectColumns(savedColumns) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Failed to get shared project columns:", error);
    return NextResponse.json({ error: "讀取案件欄位設定失敗" }, { status: 500 });
  }
}
