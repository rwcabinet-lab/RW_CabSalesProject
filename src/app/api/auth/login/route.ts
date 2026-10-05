import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getRolePages } from "@/lib/access-control";
import { getRoleLandingPath } from "@/lib/page-access";

const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "0000";

export async function POST(req: NextRequest) {
  try {
    const { userId, password } = await req.json();
    if (!userId || password !== LOGIN_PASSWORD) {
      return NextResponse.json({ error: "使用者或密碼不正確" }, { status: 401 });
    }

    const user = await DataService.getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "找不到此使用者" }, { status: 404 });
    }

    const accessiblePages = await getRolePages(user.role);
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
      redirectTo: getRoleLandingPath(user.role, accessiblePages),
    });
    response.cookies.set("cab_sales_user_id", user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "登入失敗，請稍後重試" }, { status: 500 });
  }
}
