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

    // 嚴格比對密碼：若帳號已自訂新密碼，則必須使用新密碼，不再接受預設密碼 0000
    if (password !== expectedPassword) {
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

    // 依據協議判斷是否啟用 Secure：僅在 HTTPS 環境強制 Secure，防止在 HTTP 內部網段被瀏覽器靜默丟棄
    const isHttps =
      req.nextUrl.protocol === "https:" ||
      req.headers.get("x-forwarded-proto") === "https";

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
