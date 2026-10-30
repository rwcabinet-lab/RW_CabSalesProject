import { NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const users = await DataService.getLoginUsers();
    return NextResponse.json(users);
  } catch (error) {
    return handleApiError(error, "無法載入使用者清單");
  }
}
