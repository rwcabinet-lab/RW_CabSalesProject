import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppRole, DEFAULT_ROLE_PAGES, getPageAccessKey, PageAccessKey } from "@/lib/page-access";

interface UserAccessProfile {
  role: Role;
  email: string;
  pages: PageAccessKey[];
}

const ACCESS_PROFILE_TTL_MS = 30_000;
const accessProfileCache = new Map<string, { profile: UserAccessProfile; expiresAt: number }>();

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
  let cached = accessProfileCache.get(userId);
  if (cached && cached.expiresAt <= Date.now()) {
    accessProfileCache.delete(userId);
    cached = undefined;
  }

  let profile = cached?.profile;
  if (!profile) {
    const [user] = await prisma.$queryRaw<Array<{
      id: string;
      role: Role;
      email: string;
      pages: string[] | null;
    }>>`
      SELECT u.id, u.role, u.email, r.pages
      FROM users AS u
      LEFT JOIN role_page_access AS r ON r.role = u.role
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    if (!user) return false;

    profile = {
      role: user.role,
      email: user.email,
      pages: user.pages as PageAccessKey[] | null || DEFAULT_ROLE_PAGES[user.role as AppRole],
    };
    cacheUserAccessProfile(userId, profile);
  }

  if (profile.email.startsWith("preview-")) return false;
  const pageKey = getPageAccessKey(pathname);
  if (pageKey === "admin") return profile.role === "ADMIN";
  return profile.pages.includes(pageKey);
}
