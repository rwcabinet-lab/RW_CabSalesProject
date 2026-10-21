import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { canRoleAccessPath } from "@/lib/page-access";

export async function middleware(request: NextRequest) {
  const rawCookie = request.cookies.get("cab_sales_user_id")?.value;
  const session = await verifySessionToken(rawCookie);
  const userId = session?.userId;
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  const pathname = request.nextUrl.pathname;

  // 靜態資源與圖片直接放行
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // 已有效登入者造訪 /login，直接導向首頁
  if (isLoginPage) {
    if (userId && session?.role) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    // 未有效登入或憑據過期者，允許停留在登入頁
    return NextResponse.next();
  }

  if (pathname === "/forbidden") return NextResponse.next();

  // 未登入或簽章無效
  if (!pathname.startsWith("/api/auth/") && !userId) {
    if (isApiRequest) return NextResponse.json({ error: "請先登入" }, { status: 401 });
    const redirectRes = NextResponse.redirect(new URL("/login", request.url));
    if (rawCookie) {
      redirectRes.cookies.delete("cab_sales_user_id");
    }
    return redirectRes;
  }

  // 登入驗證相關 API 放行
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  // 透過已簽署之 Session Token 直接進行 Edge 權限查核，消除自呼叫 Loopback API
  if (session?.role) {
    const allowed = canRoleAccessPath(session.role, pathname, request.method);
    if (!allowed) {
      if (isApiRequest) return NextResponse.json({ error: "沒有權限存取此頁面" }, { status: 403 });
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
  } else {
    // 缺少有效身分角色之無效憑據，刪除 Cookie 並強制重新登入，杜絕重定向迴圈
    const redirectRes = isApiRequest
      ? NextResponse.json({ error: "登入憑據無效，請重新登入" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
    redirectRes.cookies.delete("cab_sales_user_id");
    return redirectRes;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
