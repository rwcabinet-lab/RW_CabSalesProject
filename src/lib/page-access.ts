export const PAGE_ACCESS_OPTIONS = [
  { key: "home", label: "首頁", href: "/" },
  { key: "workbench", label: "業務工作台", href: "/dashboard/workbench" },
  { key: "manager", label: "主管監控看板", href: "/dashboard/manager" },
  { key: "views", label: "多元可視化", href: "/views" },
  { key: "customers", label: "客戶主檔", href: "/customers" },
  { key: "projects", label: "案場、里程碑與報價", href: "/projects" },
  { key: "admin", label: "管理者設定", href: "/admin" },
] as const;

export const ROLE_OPTIONS = [
  { value: "ADMIN", label: "管理員" },
  { value: "LEVEL_MANAGER", label: "理級主管" },
  { value: "SALES_MANAGER", label: "業務主管" },
  { value: "SALES", label: "業務專員" },
  { value: "ASSISTANT", label: "業務助理" },
] as const;

export type PageAccessKey = (typeof PAGE_ACCESS_OPTIONS)[number]["key"];
export type AppRole = (typeof ROLE_OPTIONS)[number]["value"];

export const DEFAULT_ROLE_PAGES: Record<AppRole, PageAccessKey[]> = {
  ADMIN: ["home", "workbench", "manager", "views", "customers", "projects", "admin"],
  LEVEL_MANAGER: ["home", "workbench", "manager", "views", "customers", "projects"],
  SALES_MANAGER: ["home", "workbench", "manager", "views", "customers", "projects"],
  SALES: ["home", "workbench", "views", "customers", "projects"],
  ASSISTANT: ["home", "workbench", "views", "projects"],
};

const ROLE_LANDING_PREFERENCES: Record<AppRole, PageAccessKey[]> = {
  ADMIN: ["workbench", "manager", "views", "customers", "projects", "home", "admin"],
  LEVEL_MANAGER: ["manager", "workbench", "views", "customers", "projects", "home"],
  SALES_MANAGER: ["manager", "workbench", "views", "customers", "projects", "home"],
  SALES: ["workbench", "views", "customers", "projects", "home"],
  ASSISTANT: ["workbench", "views", "projects", "home"],
};

export function getRoleLandingPath(role: AppRole, pages: PageAccessKey[]): string {
  const landingPage = ROLE_LANDING_PREFERENCES[role].find((page) => pages.includes(page));
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
  { prefix: "/api/catalog", key: "projects" },
];

export function getPageAccessKey(pathname: string, method?: string): PageAccessKey {
  const url = new URL(pathname, "http://localhost");
  const routePath = url.pathname;

  if (
    routePath === "/api/tasks" &&
    method === "GET" &&
    url.searchParams.has("projectId") &&
    url.searchParams.get("isCompleted") === "true"
  ) {
    return "projects";
  }

  if (routePath === "/" || routePath === "/api") return "home";
  if (routePath === "/admin" || routePath.startsWith("/admin/")) return "admin";

  const match = PAGE_PATHS.find(
    ({ prefix }) => routePath === prefix || routePath.startsWith(`${prefix}/`),
  );
  return match?.key ?? "home";
}
