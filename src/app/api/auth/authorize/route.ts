import { NextRequest, NextResponse } from "next/server";
import { canUserAccessPath } from "@/lib/access-control";
import { getVerifiedUserIdFromRequest } from "@/lib/session";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = await getVerifiedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const pathname = request.nextUrl.searchParams.get("path");
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) {
    return NextResponse.json({ error: "無效的頁面路徑" }, { status: 400 });
  }
  const method = request.nextUrl.searchParams.get("method") || undefined;

  try {
    const allowed = await canUserAccessPath(userId, pathname, method);
    if (!allowed) return NextResponse.json({ error: "沒有權限存取此頁面" }, { status: 403 });
    return NextResponse.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error, "無法確認頁面權限");
  }
}
