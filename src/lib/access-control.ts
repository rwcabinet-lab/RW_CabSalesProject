import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppRole, DEFAULT_ROLE_PAGES, getPageAccessKey, PageAccessKey } from "@/lib/page-access";
import { getVerifiedUserIdFromRequest } from "@/lib/session";

export interface UserAccessProfile {
  id?: string;
  name?: string;
  role: Role;
  email: string;
  createdAt?: Date;
  updatedAt?: Date;
  pages: PageAccessKey[];
}

const ACCESS_PROFILE_TTL_MS = 30 * 60_000;
const globalForAccess = globalThis as unknown as {
  accessProfileCache?: Map<string, { profile: UserAccessProfile; expiresAt: number }>;
  rolePagesCache?: Map<string, { pages: PageAccessKey[]; expiresAt: number }>;
};
const accessProfileCache =
  globalForAccess.accessProfileCache ??
  (globalForAccess.accessProfileCache = new Map<string, { profile: UserAccessProfile; expiresAt: number }>());
const rolePagesCache =
  globalForAccess.rolePagesCache ??
  (globalForAccess.rolePagesCache = new Map<string, { pages: PageAccessKey[]; expiresAt: number }>());

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
  rolePagesCache.clear();
}

export async function loadUserAccessProfile(userId: string): Promise<UserAccessProfile | null> {
  const cached = accessProfileCache.get(userId);
  if (cached && cached.expiresAt > Date.now() && cached.profile.name) {
    return cached.profile;
  }

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
  if (!user) {
    accessProfileCache.delete(userId);
    return null;
  }

  const pages = (user.pages as PageAccessKey[] | null) || DEFAULT_ROLE_PAGES[user.role as AppRole];
  const profile: UserAccessProfile = {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    pages,
  };
  cacheUserAccessProfile(userId, profile);
  rolePagesCache.set(user.role, { pages, expiresAt: Date.now() + ACCESS_PROFILE_TTL_MS });
  return profile;
}

export async function getUserByIdCached(userId: string) {
  const profile = await loadUserAccessProfile(userId);
  if (!profile || profile.email.startsWith("preview-")) return null;
  return {
    id: profile.id || userId,
    name: profile.name || "",
    email: profile.email,
    role: profile.role,
    createdAt: profile.createdAt ?? new Date(0),
    updatedAt: profile.updatedAt ?? new Date(0),
  };
}

export async function getUserFromRequest(request: NextRequest) {
  const userId = await getVerifiedUserIdFromRequest(request);
  if (!userId) return null;
  return getUserByIdCached(userId);
}

export async function getRolePages(role: Role | AppRole): Promise<PageAccessKey[]> {
  const cached = rolePagesCache.get(role);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.pages;
  }
  const savedAccess = await prisma.rolePageAccess.findUnique({ where: { role } });
  const pages = savedAccess
    ? savedAccess.pages as PageAccessKey[]
    : DEFAULT_ROLE_PAGES[role as AppRole];
  rolePagesCache.set(role, { pages, expiresAt: Date.now() + ACCESS_PROFILE_TTL_MS });
  return pages;
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
  const profile = await loadUserAccessProfile(userId);
  if (!profile || profile.email.startsWith("preview-")) return false;

  const routePath = new URL(pathname, "http://localhost").pathname;
  if (routePath === "/settings" || routePath.startsWith("/settings/")) return true;
  if (routePath === "/api/tasks" || routePath.startsWith("/api/tasks/") || routePath === "/api/schedule" || routePath.startsWith("/api/schedule/")) {
    return profile.pages.includes("workbench") || profile.pages.includes("projects") || profile.pages.includes("manager");
  }
  const pageKey = getPageAccessKey(pathname, method);
  if (pageKey === "admin") return profile.role === "ADMIN";
  return profile.pages.includes(pageKey);
}
