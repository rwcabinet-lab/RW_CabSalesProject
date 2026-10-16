import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppRole, DEFAULT_ROLE_PAGES, getPageAccessKey, PageAccessKey } from "@/lib/page-access";

interface UserAccessProfile {
  id?: string;
  name?: string;
  role: Role;
  email: string;
  createdAt?: Date;
  updatedAt?: Date;
  pages: PageAccessKey[];
}

const ACCESS_PROFILE_TTL_MS = 60_000;
const globalForAccess = globalThis as unknown as {
  accessProfileCache?: Map<string, { profile: UserAccessProfile; expiresAt: number }>;
};
const accessProfileCache =
  globalForAccess.accessProfileCache ??
  (globalForAccess.accessProfileCache = new Map<string, { profile: UserAccessProfile; expiresAt: number }>());

export function cacheUserAccessProfile(
  userId: string,
  profile: UserAccessProfile,
): void {
  accessProfileCache.set(userId, {
    profile,
    expiresAt: Date.now() + ACCESS_PROFILE_TTL_MS,
  });
}

export function invalidateUserAccessProfile(userId: string): void {
  accessProfileCache.delete(userId);
}

export function invalidateRoleAccessProfiles(): void {
  accessProfileCache.clear();
}

export async function getUserFromRequest(request: NextRequest) {
  const userId = request.cookies.get("cab_sales_user_id")?.value;
  if (!userId) return null;
  const cached = accessProfileCache.get(userId);
  if (cached && cached.expiresAt > Date.now() && cached.profile.name) {
    return {
      id: cached.profile.id || userId,
      name: cached.profile.name,
      email: cached.profile.email,
      role: cached.profile.role,
      createdAt: cached.profile.createdAt ?? new Date(0),
      updatedAt: cached.profile.updatedAt ?? new Date(0),
    };
  }
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function getRolePages(role: Role | AppRole): Promise<PageAccessKey[]> {
  const savedAccess = await prisma.rolePageAccess.findUnique({ where: { role } });
  return savedAccess
    ? savedAccess.pages as PageAccessKey[]
    : DEFAULT_ROLE_PAGES[role as AppRole];
}

export async function canAccessPath(
  role: Role | AppRole,
  pathname: string,
  method?: string,
): Promise<boolean> {
  const routePath = new URL(pathname, "http://localhost").pathname;
  if (routePath === "/settings" || routePath.startsWith("/settings/")) return true;
  const pageKey = getPageAccessKey(pathname, method);
  if (pageKey === "admin") return role === "ADMIN";
  const pages = await getRolePages(role);
  if (routePath === "/api/tasks" || routePath.startsWith("/api/tasks/") || routePath === "/api/schedule" || routePath.startsWith("/api/schedule/")) {
    return pages.includes("workbench") || pages.includes("projects") || pages.includes("manager");
  }
  return pages.includes(pageKey);
}

export async function canUserAccessPath(
  userId: string,
  pathname: string,
  method?: string,
): Promise<boolean> {
  let cached = accessProfileCache.get(userId);
  if (cached && cached.expiresAt <= Date.now()) {
    accessProfileCache.delete(userId);
    cached = undefined;
  }

  let profile = cached?.profile;
  if (!profile) {
    const [user] = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      role: Role;
      email: string;
      createdAt: Date;
      updatedAt: Date;
      pages: string[] | null;
    }>>`
      SELECT u.id, u.name, u.role, u.email, u.created_at AS "createdAt", u.updated_at AS "updatedAt", r.pages
      FROM users AS u
      LEFT JOIN role_page_access AS r ON r.role = u.role
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    if (!user) return false;

    profile = {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      pages: user.pages as PageAccessKey[] | null || DEFAULT_ROLE_PAGES[user.role as AppRole],
    };
    cacheUserAccessProfile(userId, profile);
  }

  if (profile.email.startsWith("preview-")) return false;
  const routePath = new URL(pathname, "http://localhost").pathname;
  if (routePath === "/settings" || routePath.startsWith("/settings/")) return true;
  if (routePath === "/api/tasks" || routePath.startsWith("/api/tasks/") || routePath === "/api/schedule" || routePath.startsWith("/api/schedule/")) {
    return profile.pages.includes("workbench") || profile.pages.includes("projects") || profile.pages.includes("manager");
  }
  const pageKey = getPageAccessKey(pathname, method);
  if (pageKey === "admin") return profile.role === "ADMIN";
  return profile.pages.includes(pageKey);
}
