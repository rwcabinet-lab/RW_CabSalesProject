import { NextRequest, NextResponse } from "next/server";
import { loadUserAccessProfile } from "@/lib/access-control";
import { getRoleLandingPath } from "@/lib/page-access";
import { DataService } from "@/lib/data-service";
import { SESSION_COOKIE_NAME, signSessionUserId } from "@/lib/session";
import { handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const DEFAULT_LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "0000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawEmployeeNo = body.employeeNo ?? body.userId ?? body.account ?? "";
    const employeeNo = typeof rawEmployeeNo === "string" ? rawEmployeeNo.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!employeeNo || !password) {
      return NextResponse.json(
        { error: "請輸入員工編號與密碼" },
        { status: 400 }
      );
    }

    // 依據五碼員工編號（儲存於 email 欄位）或 ID 尋找使用者（支援英文字母不分大小寫比對）
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: employeeNo, mode: "insensitive" } },
          { id: employeeNo },
        ],
      },
    });

    if (!user || user.email.startsWith("preview-")) {
      return NextResponse.json(
        { error: "員工編號或密碼不正確，兩者均符合才可登入" },
        { status: 401 }
      );
    }

    const passwords = await DataService.getAppConfig<Record<string, string>>("user_passwords", {});
    const customPassword = passwords[user.id] || passwords[user.email];
    const expectedPassword = customPassword || DEFAULT_LOGIN_PASSWORD;

    // 除非未初始化設定個人密碼，否則不得使用 0000 登入
    if (password !== expectedPassword) {
      return NextResponse.json(
        { error: "員工編號或密碼不正確，兩者均符合才可登入" },
        { status: 401 }
      );
    }

    const profile = await loadUserAccessProfile(user.id);
    if (!profile || profile.email.startsWith("preview-")) {
      return NextResponse.json({ error: "找不到此使用者權限設定" }, { status: 404 });
    }

    const response = NextResponse.json({
      user: { id: profile.id || user.id, name: profile.name || "", role: profile.role },
      redirectTo: getRoleLandingPath(profile.role, profile.pages),
    });

    const signedToken = await signSessionUserId(profile.id || user.id, profile.role);

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
