import { NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";

export async function GET() {
  try {
    const catalog = await DataService.getCatalog();
    return NextResponse.json(catalog);
  } catch (error) {
    console.error("Failed to fetch catalog:", error);
    return NextResponse.json({ error: "無法取得標準料庫資料" }, { status: 500 });
  }
}
