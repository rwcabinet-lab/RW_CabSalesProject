const STROKE_COLLATOR = new Intl.Collator("zh-Hant-TW-u-co-stroke");

function isUnassignedRepName(name?: string | null): boolean {
  const trimmed = name?.trim() || "";
  return !trimmed || trimmed === "未指定" || trimmed === "未指派";
}

/**
 * 依繁體中文筆畫排序主責業務姓名，將相同業務之案場集中在同一區塊；
 * 未指定／未指派一律排於最末。
 */
export function compareSalesRepByStroke(
  nameA: string | null | undefined,
  nameB: string | null | undefined,
  direction: "ASC" | "DESC",
): number {
  const aUnassigned = isUnassignedRepName(nameA);
  const bUnassigned = isUnassignedRepName(nameB);
  if (aUnassigned && bUnassigned) return 0;
  if (aUnassigned) return 1;
  if (bUnassigned) return -1;

  const trimmedA = nameA!.trim();
  const trimmedB = nameB!.trim();
  if (trimmedA === trimmedB) return 0;

  const cmp = STROKE_COLLATOR.compare(trimmedA, trimmedB);
  return direction === "ASC" ? cmp : -cmp;
}

export interface ManagerSortOptions {
  salesRepSort: "NONE" | "ASC" | "DESC";
  statusSort: "NONE" | "URGENT_FIRST" | "NORMAL_FIRST";
  dateSort: "NONE" | "ASC" | "DESC";
  dateSortField: "expectedDate" | "billingDate";
}

export function compareManagerOverviewProjects<
  T extends {
    salesRepName?: string | null;
    currentStage: string;
    trafficLight: { color: string };
    expectedDate?: string | null;
    billingDate?: string | null;
  },
>(a: T, b: T, options: ManagerSortOptions): number {
  if (options.salesRepSort !== "NONE") {
    const repDiff = compareSalesRepByStroke(a.salesRepName, b.salesRepName, options.salesRepSort);
    if (repDiff !== 0) return repDiff;
  }

  if (options.statusSort !== "NONE") {
    const getStatusWeight = (item: T) => {
      if (item.currentStage === "LOST") return 5;
      if (item.trafficLight.color === "RED") return 1;
      if (item.trafficLight.color === "YELLOW") return 2;
      if (item.trafficLight.color === "GREEN") return 3;
      return 4;
    };
    const diff = getStatusWeight(a) - getStatusWeight(b);
    if (diff !== 0) {
      return options.statusSort === "URGENT_FIRST" ? diff : -diff;
    }
  }

  if (options.dateSort === "NONE") return 0;
  const sortKey = options.dateSortField === "billingDate" ? "billingDate" : "expectedDate";
  const dateA = a[sortKey] || "";
  const dateB = b[sortKey] || "";
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  return options.dateSort === "ASC" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
}
