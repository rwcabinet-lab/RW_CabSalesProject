import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppRole, DEFAULT_ROLE_PAGES, getPageAccessKey, PageAccessKey } from "@/lib/page-access";

export async function getUserFromRequest(request: NextRequest) {
  const userId = request.cookies.get("cab_sales_user_id")?.value;
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function getRolePages(role: Role | AppRole): Promise<PageAccessKey[]> {
  const savedAccess = await prisma.rolePageAccess.findUnique({ where: { role } });
  return savedAccess
    ? savedAccess.pages as PageAccessKey[]
    : DEFAULT_ROLE_PAGES[role as AppRole];
}

export async function canAccessPath(role: Role | AppRole, pathname: string): Promise<boolean> {
  const pageKey = getPageAccessKey(pathname);
  if (pageKey === "admin") return role === "ADMIN";
  const pages = await getRolePages(role);
  return pages.includes(pageKey);
}

export async function canUserAccessPath(userId: string, pathname: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });
  if (!user || user.email.startsWith("preview-")) return false;
  return canAccessPath(user.role, pathname);
}
