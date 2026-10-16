"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PageAccessKey } from "@/lib/page-access";
import type {
  ApiResponse,
  ColumnItemDTO,
  CustomerDTO,
  CustomerStatsDashboardDTO,
  ManagerDashboardDTO,
  UserDTO,
  ViewsDataDTO,
  WorkbenchDashboardDTO,
} from "@/types/dto";

export interface SessionUserDTO {
  id: string;
  name: string;
  role: string;
  accessiblePages: PageAccessKey[];
}

export const QUERY_KEYS = {
  session: ["session"] as const,
  users: ["users"] as const,
  customers: ["customers"] as const,
  columnConfig: ["projects", "columns-config"] as const,
  workbench: ["dashboard", "workbench"] as const,
  managerDashboard: (month?: string) => ["dashboard", "manager", month || "all"] as const,
  managerCustomerStats: ["dashboard", "manager", "customers"] as const,
  viewsData: ["views", "data"] as const,
};

/**
 * 取得當前使用者登入狀態與權限（全域快取 5 分鐘，避免每個頁面與導覽列重複請求）
 */
export function useSessionQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.session,
    queryFn: async (): Promise<SessionUserDTO | null> => {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as ApiResponse<{ user: SessionUserDTO | null }>;
      return data?.user || null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 取得系統使用者清單（快取 2 分鐘）
 */
export function useUsersQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.users,
    queryFn: async (): Promise<UserDTO[]> => {
      const res = await fetch("/api/auth/users");
      if (!res.ok) throw new Error("無法取得使用者列表");
      const data = (await res.json()) as ApiResponse<UserDTO[]>;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * 取得客戶主檔清單（快取 30 秒，新增/更新/刪除時主動 invalidate）
 */
export function useCustomersQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.customers,
    queryFn: async (): Promise<CustomerDTO[]> => {
      const res = await fetch("/api/customers");
      const data = (await res.json()) as ApiResponse<CustomerDTO[]>;
      if (!res.ok || !Array.isArray(data)) {
        throw new Error(data.error || "無法取得客戶資料");
      }
      return data;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * 取得案件全域自訂欄位設定（快取 5 分鐘）
 */
export function useColumnConfigQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.columnConfig,
    queryFn: async (): Promise<ColumnItemDTO[]> => {
      const res = await fetch("/api/projects/config/columns", { cache: "no-store" });
      const data = (await res.json()) as ApiResponse<{ columns: ColumnItemDTO[] }>;
      if (!res.ok || !Array.isArray(data.columns)) {
        throw new Error(data.error || "無法取得全域案件欄位設定");
      }
      return data.columns;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 業務工作台儀表板資料（快取 30 秒）
 */
export function useWorkbenchQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.workbench,
    queryFn: async (): Promise<WorkbenchDashboardDTO> => {
      const res = await fetch("/api/dashboard/workbench");
      const json = (await res.json()) as ApiResponse<WorkbenchDashboardDTO>;
      if (!res.ok || !json.currentUser) {
        throw new Error(json.error || "無法取得業務工作台資料");
      }
      return json;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * 主管監控室營運儀表板資料（依月份篩選，快取 30 秒）
 */
export function useManagerDashboardQuery(monthFilter?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.managerDashboard(monthFilter),
    queryFn: async (): Promise<ManagerDashboardDTO> => {
      const res = await fetch(`/api/dashboard/manager${monthFilter ? `?month=${monthFilter}` : ""}`);
      const json = (await res.json()) as ApiResponse<ManagerDashboardDTO>;
      if (!res.ok || !json.kpi || !Array.isArray(json.allProjectsOverview) || !Array.isArray(json.assignedTasks)) {
        throw new Error(json.error || "無法取得主管看板資料");
      }
      return json;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * 主管監控室客戶統計資料（快取 30 秒）
 */
export function useManagerCustomerStatsQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.managerCustomerStats,
    queryFn: async (): Promise<CustomerStatsDashboardDTO> => {
      const res = await fetch("/api/dashboard/manager/customers");
      const json = (await res.json()) as CustomerStatsDashboardDTO & { error?: string };
      if (!res.ok || json.error) {
        throw new Error(json.error || "獲取客戶統計失敗");
      }
      return json;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * 多元可視化資料（快取 30 秒）
 */
export function useViewsDataQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.viewsData,
    queryFn: async (): Promise<ViewsDataDTO> => {
      const res = await fetch("/api/views/data", { cache: "no-store" });
      const json = (await res.json()) as ApiResponse<ViewsDataDTO>;
      if (!res.ok) {
        throw new Error(json.error || "無法取得多元可視化資料");
      }
      return json;
    },
    staleTime: 30 * 1000,
  });
}
