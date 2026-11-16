import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordUserActivityThrottled } from "@/lib/activity-tracker";
import {
  AppRole,
  DEFAULT_ROLE_PAGES,
  getPageAccessKey,
  PageAccessKey,
  VALID_PAGE_ACCESS_KEYS,
} from "@/lib/page-access";
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

function normalizeRolePages(
  rawPages: string[] | null | undefined,
  role: Role | AppRole,
): PageAccessKey[] {
  const source = rawPages ?? DEFAULT_ROLE_PAGES[role as AppRole] ?? [];
  const filtered = source.filter((key): key is PageAccessKey =>
    VALID_PAGE_ACCESS_KEYS.has(key)
  );
  if (role === "ADMIN") {
    const adminSet = new Set<PageAccessKey>(filtered);
    adminSet.add("admin");
    adminSet.add("milestone_reorder");
    return Array.from(adminSet);
  }
  return Array.from(new Set(filtered));
}

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

  const pages = normalizeRolePages(user.pages, user.role);
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
  const user = await getUserByIdCached(userId);
  if (user) {
    recordUserActivityThrottled(user.id);
  }
  return user;
}

export async function getRolePages(role: Role | AppRole): Promise<PageAccessKey[]> {
  const cached = rolePagesCache.get(role);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.pages;
  }
  const savedAccess = await prisma.rolePageAccess.findUnique({ where: { role } });
  const pages = normalizeRolePages(savedAccess?.pages, role);
  rolePagesCache.set(role, { pages, expiresAt: Date.now() + ACCESS_PROFILE_TTL_MS });
  return pages;
}

export async function canAccessPath(
  role: Role | AppRole,
  pathname: string,
  method?: string,
): Promise<boolean> {
  const routePath = new URL(pathname, "http://localhost").pathname;
  if (routePath === "/") return true;
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
  if (routePath === "/") return true;
  if (routePath === "/settings" || routePath.startsWith("/settings/")) return true;
  if (routePath === "/api/tasks" || routePath.startsWith("/api/tasks/") || routePath === "/api/schedule" || routePath.startsWith("/api/schedule/")) {
    return profile.pages.includes("workbench") || profile.pages.includes("projects") || profile.pages.includes("manager");
  }
  const pageKey = getPageAccessKey(pathname, method);
  if (pageKey === "admin") return profile.role === "ADMIN";
  return profile.pages.includes(pageKey);
}

const MANAGER_ROLES = new Set<string>(["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"]);

export function isManagerRole(role?: string | null): boolean {
  return Boolean(role && MANAGER_ROLES.has(role));
}

/**
 * 檢查使用者是否具備存取特定案場（含主管層級、專案業務/業助、客戶業務、子進度/待辦/分期關係人）的物件層級權限
 */
export async function canUserAccessProject(
  user: { id: string; role: string },
  projectId: string,
): Promise<{ exists: boolean; allowed: boolean }> {
  if (!projectId) {
    return { exists: false, allowed: false };
  }

  if (isManagerRole(user.role)) {
    const exists = Boolean(
      await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
    );
    return { exists, allowed: exists };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      salesRepId: true,
      salesAssistantId: true,
      customer: { select: { salesRepId: true } },
      parent: { select: { salesRepId: true, salesAssistantId: true } },
      milestones: { where: { assignedToId: user.id }, select: { id: true }, take: 1 },
      tasks: { where: { assignedToId: user.id }, select: { id: true }, take: 1 },
      phases: {
        where: {
          OR: [
            { salesRepId: user.id },
            { salesAssistantId: user.id },
            { milestones: { some: { assignedToId: user.id } } },
            { tasks: { some: { assignedToId: user.id } } },
          ],
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!project) {
    return { exists: false, allowed: false };
  }

  const allowed =
    project.salesRepId === user.id ||
    project.salesAssistantId === user.id ||
    project.customer.salesRepId === user.id ||
    project.parent?.salesRepId === user.id ||
    project.parent?.salesAssistantId === user.id ||
    project.milestones.length > 0 ||
    project.tasks.length > 0 ||
    project.phases.length > 0;

  return { exists: true, allowed };
}
