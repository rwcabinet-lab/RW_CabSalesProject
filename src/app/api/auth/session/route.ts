import { NextRequest, NextResponse } from "next/server";
import { loadUserAccessProfile } from "@/lib/access-control";
import { recordUserActivityThrottled } from "@/lib/activity-tracker";
import { DataService } from "@/lib/data-service";
import {
  hasUserChangedPassword,
  PASSWORD_CHANGED_CONFIG_KEY,
  type PasswordChangedMap,
} from "@/lib/password";
import { getVerifiedUserIdFromRequest } from "@/lib/session";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await getVerifiedUserIdFromRequest(req);
    if (!userId) return NextResponse.json({ user: null }, { status: 401 });

    const profile = await loadUserAccessProfile(userId);
    if (!profile || profile.email.startsWith("preview-")) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    recordUserActivityThrottled(profile.id || userId);

    const passwordChangedMap = await DataService.getAppConfig<PasswordChangedMap>(
      PASSWORD_CHANGED_CONFIG_KEY,
      {}
    ).catch(() => ({} as PasswordChangedMap));
    const resolvedUserId = profile.id || userId;
    const mustChangePassword = !hasUserChangedPassword(
      resolvedUserId,
      profile.email,
      passwordChangedMap
    );

    return NextResponse.json(
      {
        user: {
          id: resolvedUserId,
          name: profile.name || "",
          role: profile.role,
          accessiblePages: profile.pages,
          mustChangePassword,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error, "無法取得使用者狀態");
  }
}
