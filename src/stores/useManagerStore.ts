import { create } from "zustand";

export interface ManagerFilterState {
  searchQuery: string;
  statusFilter: string;
  businessFilter: string;
  stageFilter: string;
  dateSort: "NONE" | "ASC" | "DESC";
  dateSortField: "expectedDate" | "billingDate";
  statusSort: "NONE" | "URGENT_FIRST" | "NORMAL_FIRST";
  salesRepSort: "NONE" | "ASC" | "DESC";

  setSearchQuery: (val: string) => void;
  setStatusFilter: (val: string) => void;
  setBusinessFilter: (val: string) => void;
  setStageFilter: (val: string) => void;
  setDateSort: (val: "NONE" | "ASC" | "DESC") => void;
  setStatusSort: (val: "NONE" | "URGENT_FIRST" | "NORMAL_FIRST") => void;
  setSalesRepSort: (val: "NONE" | "ASC" | "DESC") => void;
  toggleDateSort: (field?: "expectedDate" | "billingDate") => void;
  toggleStatusSort: () => void;
  toggleSalesRepSort: () => void;
  resetFilters: () => void;
  initFromStorage: () => void;
}

const MANAGER_STORAGE_KEY = "cab_sales_manager_filters";

interface ManagerFilterFields {
  searchQuery: string;
  statusFilter: string;
  businessFilter: string;
  stageFilter: string;
  dateSort: "NONE" | "ASC" | "DESC";
  dateSortField: "expectedDate" | "billingDate";
  statusSort: "NONE" | "URGENT_FIRST" | "NORMAL_FIRST";
  salesRepSort: "NONE" | "ASC" | "DESC";
}

const DEFAULT_MANAGER_FILTERS: ManagerFilterFields = {
  searchQuery: "",
  statusFilter: "",
  businessFilter: "",
  stageFilter: "ACTIVE",
  dateSort: "NONE",
  dateSortField: "expectedDate",
  statusSort: "NONE",
  salesRepSort: "NONE",
};

function saveManagerFilters(partial: Partial<ManagerFilterFields>) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(MANAGER_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : DEFAULT_MANAGER_FILTERS;
    localStorage.setItem(MANAGER_STORAGE_KEY, JSON.stringify({ ...existing, ...partial }));
  } catch {
    // fallback
  }
}

export const useManagerStore = create<ManagerFilterState>((set) => ({
  ...DEFAULT_MANAGER_FILTERS,

  setSearchQuery: (val) => {
    set({ searchQuery: val });
    saveManagerFilters({ searchQuery: val });
  },
  setStatusFilter: (val) => {
    set({ statusFilter: val });
    saveManagerFilters({ statusFilter: val });
  },
  setBusinessFilter: (val) => {
    set({ businessFilter: val });
    saveManagerFilters({ businessFilter: val });
  },
  setStageFilter: (val) => {
    set({ stageFilter: val });
    saveManagerFilters({ stageFilter: val });
  },
  setDateSort: (val) => {
    set({ dateSort: val });
    saveManagerFilters({ dateSort: val });
  },
  setStatusSort: (val) => {
    set({ statusSort: val });
    saveManagerFilters({ statusSort: val });
  },
  setSalesRepSort: (val) => {
    set({ salesRepSort: val });
    saveManagerFilters({ salesRepSort: val });
  },
  toggleDateSort: (field = "expectedDate") =>
    set((state) => {
      const next =
        state.dateSort === "NONE" || state.dateSortField !== field
          ? "ASC"
          : state.dateSort === "ASC"
          ? "DESC"
          : "NONE";
      const nextField = next === "NONE" ? "expectedDate" : field;
      saveManagerFilters({ dateSort: next, dateSortField: nextField });
      return { dateSort: next, dateSortField: nextField };
    }),
  toggleStatusSort: () =>
    set((state) => {
      const next =
        state.statusSort === "NONE"
          ? "URGENT_FIRST"
          : state.statusSort === "URGENT_FIRST"
          ? "NORMAL_FIRST"
          : "NONE";
      saveManagerFilters({ statusSort: next });
      return { statusSort: next };
    }),
  toggleSalesRepSort: () =>
    set((state) => {
      const next =
        state.salesRepSort === "NONE"
          ? "ASC"
          : state.salesRepSort === "ASC"
          ? "DESC"
          : "NONE";
      saveManagerFilters({ salesRepSort: next });
      return { salesRepSort: next };
    }),
  resetFilters: () => {
    set(DEFAULT_MANAGER_FILTERS);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(MANAGER_STORAGE_KEY, JSON.stringify(DEFAULT_MANAGER_FILTERS));
      } catch {}
    }
  },
  initFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(MANAGER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
          statusFilter: typeof parsed.statusFilter === "string" ? parsed.statusFilter : "",
          businessFilter: typeof parsed.businessFilter === "string" ? parsed.businessFilter : "",
          stageFilter: typeof parsed.stageFilter === "string" ? parsed.stageFilter : "ACTIVE",
          dateSort: ["NONE", "ASC", "DESC"].includes(parsed.dateSort) ? parsed.dateSort : "NONE",
          dateSortField:
            parsed.dateSortField === "billingDate" || parsed.dateSortField === "expectedDate"
              ? parsed.dateSortField
              : "expectedDate",
          statusSort: ["NONE", "URGENT_FIRST", "NORMAL_FIRST"].includes(parsed.statusSort) ? parsed.statusSort : "NONE",
          salesRepSort: ["NONE", "ASC", "DESC"].includes(parsed.salesRepSort) ? parsed.salesRepSort : "NONE",
        });
      }
    } catch {
      // fallback
    }
  },
}));
