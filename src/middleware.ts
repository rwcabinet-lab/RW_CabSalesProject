import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const userId = request.cookies.get("cab_sales_user_id")?.value;
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (isLoginPage && userId) {
    return NextResponse.redirect(new URL("/dashboard/workbench", request.url));
  }

  if (!isLoginPage && !userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};