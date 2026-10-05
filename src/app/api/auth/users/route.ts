import { NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const users = await DataService.getLoginUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Failed to load login users:", error);
    return NextResponse.json({ error: "無法載入使用者清單" }, { status: 500 });
  }
}
