import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { canRoleAccessPath } from "@/lib/page-access";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. 靜態資源、圖片與 Next.js 內部資源直接放行，杜絕不必要的驗證負擔
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const rawCookie = request.cookies.get("cab_sales_user_id")?.value;
  const session = await verifySessionToken(rawCookie);
  const userId = session?.userId;
  const isLoginPage = pathname === "/login";
  const isApiRequest = pathname.startsWith("/api/");

  // 2. 已登入者造訪 /login，直接導向首頁
  if (isLoginPage) {
    if (userId) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 3. /forbidden 頁面直接放行
  if (pathname === "/forbidden") return NextResponse.next();

  // 4. 未登入者攔截：導向 /login 或回傳 401
  if (!userId) {
    if (isApiRequest) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const redirectRes = NextResponse.redirect(new URL("/login", request.url));
    if (rawCookie) {
      redirectRes.cookies.delete("cab_sales_user_id");
    }
    return redirectRes;
  }

  // 5. 角色權限檢查 (若 Session 中帶有角色標記)
  if (session?.role) {
    const allowed = canRoleAccessPath(session.role, pathname, request.method);
    if (!allowed) {
      if (isApiRequest) {
        return NextResponse.json({ error: "沒有權限存取此頁面" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
