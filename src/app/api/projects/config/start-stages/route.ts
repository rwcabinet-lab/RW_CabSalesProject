import { NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/config/start-stages
 * 讀取管理頁面設定之各客戶類型預設起始進度
 */
export async function GET() {
  try {
    const customerTypeStages = await DataService.getCustomerTypeStartStages();
    return NextResponse.json(
      { customerTypeStages },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return handleApiError(error, "讀取各客戶類型起始進度設定失敗");
  }
}
