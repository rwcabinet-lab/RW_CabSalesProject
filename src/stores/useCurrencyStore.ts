import { create } from "zustand";
import { CurrencyUnit, getStoredCurrencyUnit, setStoredCurrencyUnit } from "@/lib/currency";

interface CurrencyState {
  currencyUnit: CurrencyUnit;
  setCurrencyUnit: (unit: CurrencyUnit) => void;
  toggleCurrencyUnit: () => void;
  initFromStorage: () => void;
}

export const useCurrencyStore = create<CurrencyState>((set, get) => {
  // 監聽跨視窗或自訂事件更新
  if (typeof window !== "undefined") {
    window.addEventListener("currency-unit-change", ((e: CustomEvent<CurrencyUnit>) => {
      if (e.detail && (e.detail === "yuan" || e.detail === "wan")) {
        set({ currencyUnit: e.detail });
      }
    }) as EventListener);
  }

  return {
    currencyUnit: typeof window !== "undefined" ? getStoredCurrencyUnit() : "yuan",
    setCurrencyUnit: (unit: CurrencyUnit) => {
      setStoredCurrencyUnit(unit);
      set({ currencyUnit: unit });
    },
    toggleCurrencyUnit: () => {
      const next: CurrencyUnit = get().currencyUnit === "yuan" ? "wan" : "yuan";
      setStoredCurrencyUnit(next);
      set({ currencyUnit: next });
    },
    initFromStorage: () => {
      if (typeof window !== "undefined") {
        set({ currencyUnit: getStoredCurrencyUnit() });
      }
    },
  };
});
