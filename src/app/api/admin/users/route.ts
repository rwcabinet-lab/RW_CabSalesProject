import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest, invalidateUserAccessProfile } from "@/lib/access-control";
import { ROLE_OPTIONS } from "@/lib/page-access";

const validRoles = new Set<string>(ROLE_OPTIONS.map(({ value }) => value));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return { response: NextResponse.json({ error: "請先登入" }, { status: 401 }) };
  if (user.role !== "ADMIN") {
    return { response: NextResponse.json({ error: "僅管理員可使用此功能" }, { status: 403 }) };
  }
  return { user };
}

function validateAccount(name: unknown, email: unknown, role: unknown) {
  if (typeof name !== "string" || !name.trim()) return "請輸入姓名";
  if (typeof email !== "string" || !emailPattern.test(email.trim())) return "請輸入有效的電子郵件";
  if (typeof role !== "string" || !validRoles.has(role)) return "請選擇有效的帳號層級";
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const users = await prisma.user.findMany({
      where: { NOT: { email: { startsWith: "preview-" } } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(users, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load managed accounts:", error);
    return NextResponse.json({ error: "無法載入帳號清單" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const validationError = validateAccount(body.name, body.email, body.role);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const user = await prisma.user.create({
      data: { name: body.name.trim(), email: body.email.trim().toLowerCase(), role: body.role as Role },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "此電子郵件已被使用" }, { status: 409 });
    }
    console.error("Failed to create managed account:", error);
    return NextResponse.json({ error: "新增帳號失敗" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "缺少帳號識別碼" }, { status: 400 });
    }
    const validationError = validateAccount(body.name, body.email, body.role);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { id: body.id } });
    if (!existing || existing.email.startsWith("preview-")) {
      return NextResponse.json({ error: "找不到此帳號" }, { status: 404 });
    }
    if (existing.role === "ADMIN" && body.role !== "ADMIN") {
      const otherAdmins = await prisma.user.count({ where: { role: "ADMIN", id: { not: existing.id } } });
      if (otherAdmins === 0) {
        return NextResponse.json({ error: "系統至少需保留一位管理員" }, { status: 400 });
      }
    }

    const user = await prisma.user.update({
      where: { id: body.id },
      data: { name: body.name.trim(), email: body.email.trim().toLowerCase(), role: body.role as Role },
      select: { id: true, name: true, email: true, role: true },
    });
    invalidateUserAccessProfile(user.id);
    return NextResponse.json(user);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "此電子郵件已被使用" }, { status: 409 });
    }
    console.error("Failed to update managed account:", error);
    return NextResponse.json({ error: "更新帳號失敗" }, { status: 500 });
  }
}
