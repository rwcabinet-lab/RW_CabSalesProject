import { NextRequest, NextResponse } from "next/server";
import { loadUserAccessProfile } from "@/lib/access-control";
import { DataService } from "@/lib/data-service";
import { getVerifiedUserIdFromRequest } from "@/lib/session";
import { handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  clearPasswordChanged,
  hashPassword,
  markPasswordChanged,
  PASSWORD_CHANGED_CONFIG_KEY,
  validateNewPassword,
  verifyPassword,
  type PasswordChangedMap,
} from "@/lib/password";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { oldPassword, newPassword, confirmPassword, targetUserId } = body;
    const sessionUserId = await getVerifiedUserIdFromRequest(req);
    if (!sessionUserId) {
      return NextResponse.json({ error: "未登入或操作逾時，請重新登入" }, { status: 401 });
    }

    const currentProfile = await loadUserAccessProfile(sessionUserId);
    if (!currentProfile || currentProfile.email.startsWith("preview-")) {
      return NextResponse.json({ error: "找不到使用者身分" }, { status: 401 });
    }

    const passwordValidationError = validateNewPassword(newPassword);
    if (passwordValidationError) {
      return NextResponse.json({ error: passwordValidationError }, { status: 400 });
    }

    if (typeof confirmPassword !== "string" || newPassword !== confirmPassword) {
      return NextResponse.json({ error: "新密碼與確認密碼不一致" }, { status: 400 });
    }

    const passwords = await DataService.getAppConfig<Record<string, string>>("user_passwords", {});

    // 管理員重設他人密碼
    if (targetUserId && targetUserId !== sessionUserId) {
      if (currentProfile.role !== "ADMIN") {
        return NextResponse.json({ error: "權限不足，僅系統管理員可重設他人密碼" }, { status: 403 });
      }
      if (typeof targetUserId !== "string") {
        return NextResponse.json({ error: "目標使用者識別碼無效" }, { status: 400 });
      }
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true },
      });
      if (!targetUser || targetUser.email.startsWith("preview-")) {
        return NextResponse.json({ error: "找不到目標使用者" }, { status: 404 });
      }

      const nextPasswords = { ...passwords, [targetUser.id]: hashPassword(newPassword) };
      if (targetUser.email !== targetUser.id && targetUser.email in nextPasswords) {
        delete nextPasswords[targetUser.email];
      }
      await DataService.setAppConfig("user_passwords", nextPasswords);

      // 管理員重設密碼後，清除該帳號的自主改密標記，促使其登入後重新變更密碼
      const passwordChangedMap = await DataService.getAppConfig<PasswordChangedMap>(
        PASSWORD_CHANGED_CONFIG_KEY,
        {}
      ).catch(() => ({} as PasswordChangedMap));
      const nextChangedMap = clearPasswordChanged(
        passwordChangedMap,
        targetUser.id,
        targetUser.email
      );
      await DataService.setAppConfig(PASSWORD_CHANGED_CONFIG_KEY, nextChangedMap);

      return NextResponse.json({ success: true, message: "密碼重設成功，下次登入即生效！" });
    }

    // 個人修改自己密碼：防暴力嘗試舊密碼並驗證原密碼
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const rateKey = `pw:${sessionUserId}`;
    const rateLimit = checkLoginRateLimit(ipAddress, rateKey);
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

    const currentStored = passwords[sessionUserId] || passwords[currentProfile.email];
    const { valid } = verifyPassword(typeof oldPassword === "string" ? oldPassword : "", currentStored);
    if (!valid) {
      recordLoginFailure(rateKey);
      return NextResponse.json({ error: "目前密碼不正確" }, { status: 400 });
    }

    if (typeof oldPassword === "string" && newPassword === oldPassword) {
      return NextResponse.json({ error: "新密碼不可與目前密碼相同" }, { status: 400 });
    }

    recordLoginSuccess(rateKey);
    const nextPasswords = { ...passwords, [sessionUserId]: hashPassword(newPassword) };
    if (currentProfile.email !== sessionUserId && currentProfile.email in nextPasswords) {
      delete nextPasswords[currentProfile.email];
    }
    await DataService.setAppConfig("user_passwords", nextPasswords);

    const passwordChangedMap = await DataService.getAppConfig<PasswordChangedMap>(
      PASSWORD_CHANGED_CONFIG_KEY,
      {}
    ).catch(() => ({} as PasswordChangedMap));
    const nextChangedMap = markPasswordChanged(
      passwordChangedMap,
      sessionUserId,
      currentProfile.email
    );
    await DataService.setAppConfig(PASSWORD_CHANGED_CONFIG_KEY, nextChangedMap);

    return NextResponse.json({
      success: true,
      mustChangePassword: false,
      message: "密碼已成功更新！下次登入請使用新密碼。",
    });
  } catch (error) {
    return handleApiError(error, "更新密碼失敗，請稍後重試");
  }
}
