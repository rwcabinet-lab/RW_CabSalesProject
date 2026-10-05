import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getRolePages } from "@/lib/access-control";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.cookies.get("cab_sales_user_id")?.value;
  if (!userId) return NextResponse.json({ user: null }, { status: 401 });

  const user = await DataService.getUserById(userId);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  const accessiblePages = await getRolePages(user.role);

  return NextResponse.json(
    { user: { id: user.id, name: user.name, role: user.role, accessiblePages } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
