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

    const users = await DataService.getLoginUsers();
    return NextResponse.json(users);
  } catch (error) {
    return handleApiError(error, "無法載入使用者清單");
  }
}
