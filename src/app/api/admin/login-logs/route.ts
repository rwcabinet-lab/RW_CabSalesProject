import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/access-control";
import { DataService } from "@/lib/data-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "僅系統管理員可查看登入紀錄" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "缺少使用者識別 ID" }, { status: 400 });
    }

    const logs = await DataService.getLoginLogsByUser(userId);
    return NextResponse.json(logs, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error, "無法載入登入紀錄");
  }
}
