import { NextRequest, NextResponse } from "next/server";
import { loadUserAccessProfile } from "@/lib/access-control";
import { getVerifiedUserIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getVerifiedUserIdFromRequest(req);
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
