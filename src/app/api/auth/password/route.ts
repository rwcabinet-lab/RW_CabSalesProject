import { NextRequest, NextResponse } from "next/server";
import { loadUserAccessProfile } from "@/lib/access-control";
import { DataService } from "@/lib/data-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { oldPassword, newPassword, confirmPassword, targetUserId, userId: bodyUserId } = body;
    const sessionUserId = req.cookies.get("cab_sales_user_id")?.value || bodyUserId;
    if (!sessionUserId) {
      return NextResponse.json({ error: "未登入或操作逾時，請重新登入" }, { status: 401 });
    }

    const currentProfile = await loadUserAccessProfile(sessionUserId);
    if (!currentProfile) {
      return NextResponse.json({ error: "找不到使用者身分" }, { status: 401 });
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4) {
      return NextResponse.json({ error: "新密碼長度至少需 4 碼以上" }, { status: 400 });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json({ error: "新密碼與確認密碼不一致" }, { status: 400 });
    }

    const passwords = await DataService.getAppConfig<Record<string, string>>("user_passwords", {});

    // 管理員重設他人密碼
    if (targetUserId && targetUserId !== sessionUserId) {
      if (currentProfile.role !== "ADMIN") {
        return NextResponse.json({ error: "權限不足，僅系統管理員可重設他人密碼" }, { status: 403 });
      }
      passwords[targetUserId] = newPassword;
      await DataService.setAppConfig("user_passwords", passwords);
      return NextResponse.json({ success: true, message: "密碼重設成功，下次登入即生效！" });
    }

    // 個人修改自己密碼：必須驗證舊密碼
    const currentPassword = passwords[sessionUserId] || process.env.LOGIN_PASSWORD || "0000";
    if (!oldPassword || oldPassword !== currentPassword) {
      return NextResponse.json({ error: "目前密碼不正確（系統預設密碼為 0000）" }, { status: 400 });
    }

    passwords[sessionUserId] = newPassword;
    await DataService.setAppConfig("user_passwords", passwords);

    return NextResponse.json({
      success: true,
      message: "密碼已成功更新！下次登入請使用新密碼。",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "更新密碼失敗，請稍後重試" }, { status: 500 });
  }
}
