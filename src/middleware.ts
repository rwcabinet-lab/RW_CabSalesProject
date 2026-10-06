import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const userId = request.cookies.get("cab_sales_user_id")?.value;
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

  try {
    const accessTarget = `${pathname}${request.nextUrl.search}`;
    const authorization = await fetch(
      new URL(
        `/api/auth/authorize?path=${encodeURIComponent(accessTarget)}&method=${encodeURIComponent(request.method)}`,
        request.url,
      ),
      {
        headers: { cookie: request.headers.get("cookie") || "" },
        cache: "no-store",
      },
    );
    if (authorization.status === 401) {
      if (isApiRequest) return NextResponse.json({ error: "請先登入" }, { status: 401 });
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (authorization.status === 403) {
      if (isApiRequest) return NextResponse.json({ error: "沒有權限存取此頁面" }, { status: 403 });
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
    if (!authorization.ok) {
      return NextResponse.json({ error: "無法確認頁面權限，請稍後重試" }, { status: 503 });
    }
  } catch (error) {
    console.error("Page access check failed:", error);
    return NextResponse.json({ error: "無法確認頁面權限，請稍後重試" }, { status: 503 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};