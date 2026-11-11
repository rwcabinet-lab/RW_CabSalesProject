import { create } from "zustand";

export interface ViewsFilterState {
  searchQuery: string;
  salesFilter: string;
  typeFilter: string;
  stageFilter: string;
  statusFilter: string;

  setSearchQuery: (val: string) => void;
  setSalesFilter: (val: string) => void;
  setTypeFilter: (val: string) => void;
  setStageFilter: (val: string) => void;
  setStatusFilter: (val: string) => void;
  resetFilters: () => void;
  initFromStorage: () => void;
}

const VIEWS_STORAGE_KEY = "cab_sales_views_filters";

interface ViewsFilterFields {
  searchQuery: string;
  salesFilter: string;
  typeFilter: string;
  stageFilter: string;
  statusFilter: string;
}

const DEFAULT_VIEWS_FILTERS: ViewsFilterFields = {
  searchQuery: "",
  salesFilter: "",
  typeFilter: "",
  stageFilter: "",
  statusFilter: "",
};

function saveViewsFilters(partial: Partial<ViewsFilterFields>) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(VIEWS_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : DEFAULT_VIEWS_FILTERS;
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify({ ...existing, ...partial }));
  } catch {
    // fallback
  }
}

export const useViewsStore = create<ViewsFilterState>((set) => ({
  ...DEFAULT_VIEWS_FILTERS,

  setSearchQuery: (val) => {
    set({ searchQuery: val });
    saveViewsFilters({ searchQuery: val });
  },
  setSalesFilter: (val) => {
    set({ salesFilter: val });
    saveViewsFilters({ salesFilter: val });
  },
  setTypeFilter: (val) => {
    set({ typeFilter: val });
    saveViewsFilters({ typeFilter: val });
  },
  setStageFilter: (val) => {
    set({ stageFilter: val });
    saveViewsFilters({ stageFilter: val });
  },
  setStatusFilter: (val) => {
    set({ statusFilter: val });
    saveViewsFilters({ statusFilter: val });
  },
  resetFilters: () => {
    set(DEFAULT_VIEWS_FILTERS);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(DEFAULT_VIEWS_FILTERS));
      } catch {}
    }
  },
  initFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(VIEWS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
          salesFilter: typeof parsed.salesFilter === "string" ? parsed.salesFilter : "",
          typeFilter: typeof parsed.typeFilter === "string" ? parsed.typeFilter : "",
          stageFilter: typeof parsed.stageFilter === "string" ? parsed.stageFilter : "",
          statusFilter: typeof parsed.statusFilter === "string" ? parsed.statusFilter : "",
        });
      }
    } catch {
      // fallback
    }
  },
}));
