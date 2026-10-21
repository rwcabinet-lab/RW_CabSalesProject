const TEN_THOUSAND = 10_000;

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
 * 格式化為新台幣整數貨幣字串（如 "$1,200,000"）
 */
export function formatNTD(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "$0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return "$0";
  return `$${Math.round(num).toLocaleString("zh-TW")}`;
}
