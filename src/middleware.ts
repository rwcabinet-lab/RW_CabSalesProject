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

  if (isLoginPage && userId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isLoginPage) return NextResponse.next();
  if (pathname === "/forbidden") return NextResponse.next();

  if (!isLoginPage && !pathname.startsWith("/api/auth/") && !userId) {
    if (isApiRequest) return NextResponse.json({ error: "請先登入" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  // 透過已簽署之 Session Token 直接進行 Edge 權限查核，消除 Middleware 自呼叫 Loopback API 造成的延遲與死結風險
  if (session?.role) {
    const allowed = canRoleAccessPath(session.role, pathname, request.method);
    if (!allowed) {
      if (isApiRequest) return NextResponse.json({ error: "沒有權限存取此頁面" }, { status: 403 });
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
