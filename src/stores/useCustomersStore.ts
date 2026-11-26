import { create } from "zustand";
import type { CustomerDTO } from "@/types/dto";

export interface CustomersFilterFields {
  searchQuery: string;
  typeFilter: string;
  termsFilter: string;
  salesFilter: string;
}

export interface CustomersFilterState extends CustomersFilterFields {
  setSearchQuery: (val: string) => void;
  setTypeFilter: (val: string) => void;
  setTermsFilter: (val: string) => void;
  setSalesFilter: (val: string) => void;
  resetFilters: () => void;
  initFromStorage: () => void;
}

const CUSTOMERS_STORAGE_KEY = "cab_sales_customers_filters";

const DEFAULT_CUSTOMERS_FILTERS: CustomersFilterFields = {
  searchQuery: "",
  typeFilter: "",
  termsFilter: "",
  salesFilter: "",
};

const CUSTOMER_TYPE_ALIASES: Record<string, string[]> = {
  DESIGN_COMPANY: ["DESIGN_COMPANY", "DESIGNER"],
  DEALER_COMPANY: ["DEALER_COMPANY", "DEALER"],
  INDIVIDUAL: ["INDIVIDUAL", "HOMEOWNER", "DIRECT"],
  PR: ["PR", "CONTRACTOR"],
};

function saveCustomersFilters(partial: Partial<CustomersFilterFields>) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : DEFAULT_CUSTOMERS_FILTERS;
    localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify({ ...existing, ...partial }));
  } catch {
    // ignore storage errors
  }
}

/**
 * 依關鍵字、客群類型、付款條件與負責業務過濾客戶資料清單
 */
export function filterCustomers(
  customers: CustomerDTO[],
  filters: Partial<CustomersFilterFields>
): CustomerDTO[] {
  const q = (filters.searchQuery || "").trim().toLowerCase();
  const typeFilter = filters.typeFilter || "";
  const termsFilter = filters.termsFilter || "";
  const salesFilter = filters.salesFilter || "";

  return customers.filter((c) => {
    if (typeFilter) {
      const allowedTypes = CUSTOMER_TYPE_ALIASES[typeFilter] || [typeFilter];
      if (!allowedTypes.includes(c.customerType)) return false;
    }
    if (termsFilter && c.paymentTerms !== termsFilter) {
      return false;
    }
    if (salesFilter && c.salesRepId !== salesFilter) {
      return false;
    }
    if (q) {
      const matchName = c.name?.toLowerCase().includes(q);
      const matchTaxId = c.taxId?.toLowerCase().includes(q);
      const matchPhone = c.phone?.toLowerCase().includes(q);
      const matchAddress = c.address?.toLowerCase().includes(q);
      const matchSalesRep = c.salesRepName?.toLowerCase().includes(q);
      if (!matchName && !matchTaxId && !matchPhone && !matchAddress && !matchSalesRep) {
        return false;
      }
    }
    return true;
  });
}

export const useCustomersStore = create<CustomersFilterState>((set) => ({
  ...DEFAULT_CUSTOMERS_FILTERS,

  setSearchQuery: (val) => {
    set({ searchQuery: val });
    saveCustomersFilters({ searchQuery: val });
  },
  setTypeFilter: (val) => {
    set({ typeFilter: val });
    saveCustomersFilters({ typeFilter: val });
  },
  setTermsFilter: (val) => {
    set({ termsFilter: val });
    saveCustomersFilters({ termsFilter: val });
  },
  setSalesFilter: (val) => {
    set({ salesFilter: val });
    saveCustomersFilters({ salesFilter: val });
  },
  resetFilters: () => {
    set(DEFAULT_CUSTOMERS_FILTERS);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(DEFAULT_CUSTOMERS_FILTERS));
      } catch {
        // ignore storage errors
      }
    }
  },
  initFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
          typeFilter: typeof parsed.typeFilter === "string" ? parsed.typeFilter : "",
          termsFilter: typeof parsed.termsFilter === "string" ? parsed.termsFilter : "",
          salesFilter: typeof parsed.salesFilter === "string" ? parsed.salesFilter : "",
        });
      }
    } catch {
      // ignore storage errors
    }
  },
}));
