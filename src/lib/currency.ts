const TEN_THOUSAND = 10_000;

export type CurrencyUnit = "yuan" | "wan";

export const CURRENCY_STORAGE_KEY = "app_currency_unit";

/**
 * 取得使用者目前儲存之金額顯示單位偏好（預設為 "yuan"）
 */
export function getStoredCurrencyUnit(): CurrencyUnit {
  if (typeof window === "undefined") return "yuan";
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved === "wan") return "wan";
  } catch {
    // 忽略 localStorage 存取異常（如隱私模式）
  }
  return "yuan";
}

/**
 * 設定並持久化儲存金額顯示單位偏好，同時觸發全域事件通知所有監聽元件
 */
export function setStoredCurrencyUnit(unit: CurrencyUnit): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, unit);
    window.dispatchEvent(new CustomEvent("currency-unit-change", { detail: unit }));
  } catch {
    // 忽略 localStorage 存取異常
  }
}

/**
 * 將萬元輸入轉為整數元（四捨五入避免 IEEE-754 浮點數精度損失，例如 19.99 萬 -> 199,900 元）
 */
export function fromTenThousands(amount: number | string | null | undefined): number {
  if (amount == null || amount === "") return 0;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return 0;
  return Math.round(num * TEN_THOUSAND);
}

/**
 * 將整數元轉為萬元小數（精確至小數點後兩位，防止浮點數尾數偏差）
 */
export function toTenThousands(amount: number | string | null | undefined): number {
  if (amount == null || amount === "") return 0;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return 0;
  return Math.round((num / TEN_THOUSAND) * 100) / 100;
}

/**
 * 格式化顯示為萬元字串（如 "12.5 萬"）
 */
export function formatTenThousands(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "0 萬";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num) || num === 0) return "0 萬";
  const inTenThousands = toTenThousands(num);
  return `${inTenThousands.toLocaleString("zh-TW", {
    minimumFractionDigits: inTenThousands % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  })} 萬`;
}

/**
 * 格式化為新台幣貨幣字串
 * 支援「元 (如 $1,200,000)」與「萬 (如 $120 萬)」顯示模式切換
 */
export function formatNTD(
  amount: number | string | null | undefined,
  unit?: CurrencyUnit
): string {
  const resolvedUnit = unit ?? (typeof window !== "undefined" ? getStoredCurrencyUnit() : "yuan");

  if (amount == null || amount === "") return resolvedUnit === "wan" ? "$0 萬" : "$0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num) || num === 0) return resolvedUnit === "wan" ? "$0 萬" : "$0";

  if (resolvedUnit === "wan") {
    const inTenThousands = toTenThousands(num);
    const formatted = inTenThousands.toLocaleString("zh-TW", {
      minimumFractionDigits: inTenThousands % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 2,
    });
    return `$${formatted} 萬`;
  }

  return `$${Math.round(num).toLocaleString("zh-TW")}`;
}

/**
 * 格式化帶有自訂前綴（如 NT$ ）的總額字串
 */
export function formatTotalAmount(
  amount: number | string | null | undefined,
  unit?: CurrencyUnit,
  prefix = "NT$ "
): string {
  const resolvedUnit = unit ?? (typeof window !== "undefined" ? getStoredCurrencyUnit() : "yuan");

  if (amount == null || amount === "") return resolvedUnit === "wan" ? `${prefix}0 萬` : `${prefix}0`;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num) || num === 0) return resolvedUnit === "wan" ? `${prefix}0 萬` : `${prefix}0`;

  if (resolvedUnit === "wan") {
    const inTenThousands = toTenThousands(num);
    const formatted = inTenThousands.toLocaleString("zh-TW", {
      minimumFractionDigits: inTenThousands % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 2,
    });
    return `${prefix}${formatted} 萬`;
  }

  return `${prefix}${Math.round(num).toLocaleString("zh-TW")}`;
}

/**
 * 格式化為新台幣元貨幣字串（別名，與 formatNTD 相同）
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  unit?: CurrencyUnit
): string {
  return formatNTD(amount, unit);
}
