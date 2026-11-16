import { NextRequest, NextResponse } from "next/server";
import { loadUserAccessProfile } from "@/lib/access-control";
import { getRoleLandingPath } from "@/lib/page-access";
import { DataService } from "@/lib/data-service";
import { recordUserActivityThrottled } from "@/lib/activity-tracker";
import { SESSION_COOKIE_NAME, signSessionUserId } from "@/lib/session";
import { handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/rate-limiter";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function POST(req: NextRequest) {
  try {
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || undefined;

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

    // 1. 執行 IP 與工號雙維度防暴力破解限流檢查
    const rateLimit = checkLoginRateLimit(ipAddress, employeeNo);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.error },
        {
          status: 429,
          headers: rateLimit.retryAfterSeconds
            ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
            : undefined,
        }
      );
    }
    recordLoginAttempt(ipAddress);

    // 2. 依據五碼員工編號（儲存於 email 欄位）或 ID 尋找使用者（支援英文字母不分大小寫比對）
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: employeeNo, mode: "insensitive" } },
          { id: employeeNo },
        ],
      },
    });

    if (!user || user.email.startsWith("preview-")) {
      recordLoginFailure(employeeNo);
      return NextResponse.json(
        { error: "員工編號或密碼不正確，兩者均符合才可登入" },
        { status: 401 }
      );
    }

    const passwords = await DataService.getAppConfig<Record<string, string>>("user_passwords", {});
    const storedPassword = passwords[user.id] || passwords[user.email];
    const { valid, needsRehash } = verifyPassword(password, storedPassword);

    // 3. 嚴格驗證加鹽雜湊密碼（不允許無密碼或預設通用密碼 "0000" 登入）
    if (!valid) {
      recordLoginFailure(employeeNo);

      void DataService.recordLoginLog({
        userId: user.id,
        employeeNo: user.email,
        userName: user.name,
        role: user.role,
        loginAt: new Date().toISOString(),
        ipAddress,
        userAgent,
        status: "FAILED",
        failureReason: storedPassword ? "密碼不符" : "帳號尚未設定初始密碼",
      });

      return NextResponse.json(
        { error: "員工編號或密碼不正確，兩者均符合才可登入" },
        { status: 401 }
      );
    }

    // 4. 若資料庫仍為舊版明文密碼，於登入驗證成功後透明升級為 scrypt 加鹽雜湊
    if (needsRehash) {
      const nextPasswords = { ...passwords, [user.id]: hashPassword(password) };
      if (user.email !== user.id && user.email in nextPasswords) {
        delete nextPasswords[user.email];
      }
      await DataService.setAppConfig("user_passwords", nextPasswords);
    }

    // 4. 登入成功：清除該帳號累積之失敗計數並記錄日誌
    recordLoginSuccess(employeeNo);
    recordUserActivityThrottled(user.id);

    void DataService.recordLoginLog({
      userId: user.id,
      employeeNo: user.email,
      userName: user.name,
      role: user.role,
      loginAt: new Date().toISOString(),
      ipAddress,
      userAgent,
      status: "SUCCESS",
    });

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
