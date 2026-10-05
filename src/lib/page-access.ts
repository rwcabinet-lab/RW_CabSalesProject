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

export function getPageAccessKey(pathname: string): PageAccessKey {
  if (pathname === "/" || pathname === "/api") return "home";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";

  const match = PAGE_PATHS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match?.key ?? "home";
}
