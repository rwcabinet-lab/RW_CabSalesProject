import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getRolePages, getUserFromRequest } from "@/lib/access-control";
import { PAGE_ACCESS_OPTIONS, ROLE_OPTIONS } from "@/lib/page-access";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return { response: NextResponse.json({ error: "請先登入" }, { status: 401 }) };
  if (user.role !== "ADMIN") {
    return { response: NextResponse.json({ error: "僅管理員可使用此功能" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const roles = await Promise.all(ROLE_OPTIONS.map(async ({ value, label }) => ({
      role: value,
      label,
      pages: await getRolePages(value),
    })));
    return NextResponse.json(
      { roles, pages: PAGE_ACCESS_OPTIONS },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load role permissions:", error);
    return NextResponse.json({ error: "無法載入頁面權限設定" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (!Array.isArray(body.roles) || body.roles.length !== ROLE_OPTIONS.length) {
      return NextResponse.json({ error: "角色權限資料不完整" }, { status: 400 });
    }

    const knownRoles = new Set<string>(ROLE_OPTIONS.map(({ value }) => value));
    const knownPages = new Set<string>(PAGE_ACCESS_OPTIONS.map(({ key }) => key));
    const submittedRoles = new Set<string>();
    for (const item of body.roles) {
      if (
        !item ||
        typeof item.role !== "string" ||
        !knownRoles.has(item.role) ||
        submittedRoles.has(item.role) ||
        !Array.isArray(item.pages) ||
        item.pages.some((page: unknown) => typeof page !== "string" || !knownPages.has(page))
      ) {
        return NextResponse.json({ error: "角色或頁面權限資料無效" }, { status: 400 });
      }
      if (item.role === "ADMIN" && !item.pages.includes("admin")) {
        return NextResponse.json({ error: "管理員必須保留管理者設定頁面的權限" }, { status: 400 });
      }
      if (item.role !== "ADMIN" && item.pages.includes("admin")) {
        return NextResponse.json({ error: "管理者設定頁面僅能授予管理員" }, { status: 400 });
      }
      submittedRoles.add(item.role);
    }
    if (submittedRoles.size !== ROLE_OPTIONS.length) {
      return NextResponse.json({ error: "必須設定所有角色的頁面權限" }, { status: 400 });
    }

    await prisma.$transaction(
      body.roles.map((item: { role: Role; pages: string[] }) =>
        prisma.rolePageAccess.upsert({
          where: { role: item.role },
          create: { role: item.role, pages: item.pages },
          update: { pages: item.pages },
        }),
      ),
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save role permissions:", error);
    return NextResponse.json({ error: "儲存頁面權限失敗" }, { status: 500 });
  }
}
