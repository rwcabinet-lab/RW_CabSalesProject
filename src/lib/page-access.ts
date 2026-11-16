export const PAGE_ACCESS_OPTIONS = [
  { key: "workbench", label: "案場筆記", href: "/dashboard/workbench" },
  { key: "manager", label: "主管總控", href: "/dashboard/manager" },
  { key: "views", label: "視覺時程", href: "/views" },
  { key: "customers", label: "客戶主檔", href: "/customers" },
  { key: "projects", label: "案場、里程碑與報價", href: "/projects" },
  { key: "admin", label: "管理設定", href: "/admin" },
  { key: "milestone_reorder", label: "里程碑項目內容順序變更/日期平移", href: "" },
] as const;

export const ROLE_OPTIONS = [
  { value: "ADMIN", label: "管理員" },
  { value: "LEVEL_MANAGER", label: "理級主管" },
  { value: "SALES_MANAGER", label: "業務主管" },
  { value: "SALES", label: "業務專員" },
  { value: "ASSISTANT", label: "業務助理" },
  { value: "SITE_ENGINEER", label: "工務人員" },
] as const;

/** 排除指派為案件/里程碑/任務負責人的層級（管理者與理級主管） */
export const EXCLUDED_ASSIGNABLE_ROLES = ["ADMIN", "LEVEL_MANAGER"] as const;

export function isAssignableRole(role?: string | null): boolean {
  return Boolean(role && !EXCLUDED_ASSIGNABLE_ROLES.includes(role as any));
}

export type PageAccessKey = (typeof PAGE_ACCESS_OPTIONS)[number]["key"];
export type AppRole = (typeof ROLE_OPTIONS)[number]["value"];

export const VALID_PAGE_ACCESS_KEYS = new Set<string>(
  PAGE_ACCESS_OPTIONS.map(({ key }) => key)
);

export const DEFAULT_ROLE_PAGES: Record<AppRole, PageAccessKey[]> = {
  ADMIN: ["workbench", "manager", "views", "customers", "projects", "admin", "milestone_reorder"],
  LEVEL_MANAGER: ["workbench", "manager", "views", "customers", "projects", "milestone_reorder"],
  SALES_MANAGER: ["workbench", "manager", "views", "customers", "projects", "milestone_reorder"],
  SALES: ["workbench", "views", "customers", "projects"],
  ASSISTANT: ["workbench", "views", "projects"],
  SITE_ENGINEER: ["workbench", "views", "projects"],
};

const ROLE_LANDING_PREFERENCES: Record<AppRole, PageAccessKey[]> = {
  ADMIN: ["manager", "workbench", "views", "customers", "projects", "admin"],
  LEVEL_MANAGER: ["manager", "workbench", "views", "customers", "projects"],
  SALES_MANAGER: ["manager", "workbench", "views", "customers", "projects"],
  SALES: ["manager", "workbench", "views", "customers", "projects"],
  ASSISTANT: ["manager", "workbench", "views", "projects"],
  SITE_ENGINEER: ["manager", "workbench", "views", "projects"],
};

/**
 * 決定角色登入後的首頁著陸路徑：
 * 預設優先前往「主管總控」，若該角色未開通「主管總控」權限則預設前往「案場筆記」
 */
export function getRoleLandingPath(role: AppRole, pages: PageAccessKey[]): string {
  const preferences = ROLE_LANDING_PREFERENCES[role] || ["manager", "workbench"];
  const landingPage = preferences.find((page) => pages.includes(page));
  return PAGE_ACCESS_OPTIONS.find((page) => page.key === landingPage)?.href || "/forbidden";
}

const PAGE_PATHS: Array<{ prefix: string; key: PageAccessKey }> = [
  { prefix: "/api/dashboard/workbench", key: "workbench" },
  { prefix: "/dashboard/workbench", key: "workbench" },
  { prefix: "/api/dashboard/manager", key: "manager" },
  { prefix: "/dashboard/manager", key: "manager" },
  { prefix: "/api/admin", key: "admin" },
  { prefix: "/api/views", key: "views" },
  { prefix: "/views", key: "views" },
  { prefix: "/api/customers", key: "customers" },
  { prefix: "/customers", key: "customers" },
  { prefix: "/api/projects", key: "projects" },
  { prefix: "/projects", key: "projects" },
  { prefix: "/api/tasks", key: "workbench" },
  { prefix: "/api/schedule", key: "workbench" },
];

export function getPageAccessKey(pathname: string, method?: string): PageAccessKey {
  const url = new URL(pathname, "http://localhost");
  const routePath = url.pathname;

  if (
    routePath === "/api/tasks" &&
    method === "GET" &&
    url.searchParams.has("projectId")
  ) {
    return "projects";
  }

  if (routePath === "/admin" || routePath.startsWith("/admin/")) return "admin";

  const match = PAGE_PATHS.find(
    ({ prefix }) => routePath === prefix || routePath.startsWith(`${prefix}/`),
  );
  return match?.key ?? "workbench";
}

/**
 * 所有已登入使用者皆可存取之基礎系統路徑（實際資料與異動權限由各 API 路由再行檢核）
 */
export function isAlwaysAllowedAuthenticatedPath(routePath: string): boolean {
  return (
    routePath === "/" ||
    routePath === "/settings" ||
    routePath.startsWith("/settings/") ||
    routePath === "/api/changelog" ||
    routePath.startsWith("/api/changelog/") ||
    routePath === "/api/announcement" ||
    routePath.startsWith("/api/announcement/")
  );
}

/**
 * 於 Middleware / Edge 環境中進行無資料庫往返的高效能角色權限校驗
 */
export function canRoleAccessPath(
  role: AppRole | string,
  pathname: string,
  method?: string,
): boolean {
  const url = new URL(pathname, "http://localhost");
  const routePath = url.pathname;

  if (isAlwaysAllowedAuthenticatedPath(routePath)) return true;
  if (routePath === "/forbidden") return true;
  if (routePath === "/login") return true;
  if (routePath.startsWith("/api/auth/")) return true;
  if (role === "ADMIN") return true;

  const pageKey = getPageAccessKey(pathname, method);
  if (pageKey === "admin") return false;

  const allowedPages = DEFAULT_ROLE_PAGES[role as AppRole] || [];
  if (
    routePath === "/api/tasks" ||
    routePath.startsWith("/api/tasks/") ||
    routePath === "/api/schedule" ||
    routePath.startsWith("/api/schedule/")
  ) {
    return (
      allowedPages.includes("workbench") ||
      allowedPages.includes("projects") ||
      allowedPages.includes("manager")
    );
  }

  return allowedPages.includes(pageKey);
}
