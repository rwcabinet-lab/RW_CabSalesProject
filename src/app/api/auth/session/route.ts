import { NextRequest, NextResponse } from "next/server";
import { loadUserAccessProfile } from "@/lib/access-control";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.cookies.get("cab_sales_user_id")?.value;
  if (!userId) return NextResponse.json({ user: null }, { status: 401 });

  const profile = await loadUserAccessProfile(userId);
  if (!profile || profile.email.startsWith("preview-")) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json(
    {
      user: {
        id: profile.id || userId,
        name: profile.name || "",
        role: profile.role,
        accessiblePages: profile.pages,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
