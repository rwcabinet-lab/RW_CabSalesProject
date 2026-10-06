const TEN_THOUSAND = 10_000;

export function fromTenThousands(amount: number): number {
  return amount * TEN_THOUSAND;
}

export function toTenThousands(amount: number): number {
  return amount / TEN_THOUSAND;
}

export function formatTenThousands(amount: number): string {
  return `${toTenThousands(amount).toLocaleString("zh-TW", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} 萬`;
}
