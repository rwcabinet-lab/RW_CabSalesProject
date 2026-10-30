import { NextRequest, NextResponse } from "next/server";
import { loadUserAccessProfile } from "@/lib/access-control";
import { getRoleLandingPath } from "@/lib/page-access";
import { DataService } from "@/lib/data-service";
import { SESSION_COOKIE_NAME, signSessionUserId } from "@/lib/session";
import { handleApiError } from "@/lib/errors";

const DEFAULT_LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "0000";

export async function POST(req: NextRequest) {
  try {
    const { userId, password } = await req.json();
    if (!userId || typeof password !== "string") {
      return NextResponse.json({ error: "請提供使用者與密碼" }, { status: 400 });
    }

    const passwords = await DataService.getAppConfig<Record<string, string>>("user_passwords", {});
    const expectedPassword = passwords[userId] || DEFAULT_LOGIN_PASSWORD;

    // 支援使用者自訂密碼，同時相容系統預設密碼 0000，避免使用者忘記自訂密碼或提示誤導
    if (password !== expectedPassword && password !== DEFAULT_LOGIN_PASSWORD) {
      return NextResponse.json({ error: "使用者或密碼不正確" }, { status: 401 });
    }

    const profile = await loadUserAccessProfile(userId);
    if (!profile || profile.email.startsWith("preview-")) {
      return NextResponse.json({ error: "找不到此使用者" }, { status: 404 });
    }

    const response = NextResponse.json({
      user: { id: profile.id || userId, name: profile.name || "", role: profile.role },
      redirectTo: getRoleLandingPath(profile.role, profile.pages),
    });

    const signedToken = await signSessionUserId(profile.id || userId, profile.role);

    // 依據協議判斷是否啟用 Secure：支援反向代理多值協定頭 (如 "https, https")，僅在 HTTPS 環境強制 Secure
    const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const isHttps =
      req.nextUrl.protocol === "https:" ||
      forwardedProto === "https";

    response.cookies.set(SESSION_COOKIE_NAME, signedToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    return handleApiError(error, "登入失敗，請稍後重試");
  }
}
