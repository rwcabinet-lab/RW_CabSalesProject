import type {
  CustomerDTO as CustomerItem,
  MilestonePhaseDTO as MilestonePhase,
  MilestoneStageCodeDTO as MilestoneStageCode,
  MilestoneDTO as ProjectMilestoneItem,
  ProjectDTO as ProjectDetail,
  TaskDTO as SalesTaskItem,
} from "@/types/dto";

export type {
  CustomerDTO as CustomerItem,
  MilestonePhaseDTO as MilestonePhase,
  MilestoneStageCodeDTO as MilestoneStageCode,
  MilestoneDTO as ProjectMilestoneItem,
  ProjectDTO as ProjectDetail,
  TaskDTO as SalesTaskItem,
} from "@/types/dto";

/** 客戶類型中文對照表 */
export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  LONGMEI_STORE: "隆美門市",
  CABINET_FACTORY: "櫥櫃工廠",
  DESIGN_COMPANY: "設計公司",
  DEALER_COMPANY: "經銷公司",
  CONSTRUCTION: "建設／營造",
  LABOR_MATERIAL: "連工帶料",
  INDIVIDUAL: "一般消費者",
  DESIGNER: "設計師",
  CONTRACTOR: "統包／營造",
  PR: "公關客戶",
  DEALER: "經銷商",
  HOMEOWNER: "一般消費者",
  DIRECT: "直接業主",
};

/** 判斷案件階段是否符合特定欄位/階段（含歷史向下相容） */
export function matchesStage(projectStage: string, columnId: string): boolean {
  if (projectStage === columnId) return true;
  if (columnId === "DEVELOP" && ["CONTACT", "INQUIRY", "MEASUREMENT", "QUOTE", "CONTRACT"].includes(projectStage)) return true;
  if (columnId === "PROPOSAL" && projectStage === "DESIGN") return true;
  if (columnId === "PROD_SHIP" && (projectStage === "PRODUCTION" || projectStage === "HANDOFF")) return true;
  if ((columnId === "BILLED" || columnId === "CLOSED") && (projectStage === "BILLED" || projectStage === "CLOSED" || projectStage === "DONE")) return true;
  return false;
}

/** 各子進度的顯示名稱 (7大階段 + 額外階段) */
export const MILESTONE_STAGE_LABELS: Record<MilestoneStageCode, string> = {
  // ① 案件開發
  "1-1": "客源開發",
  "1-2": "案件分配",
  // ② 現況及需求確認
  "2-1": "需求訪談",
  "2-2": "設計建議",
  "2-3": "圖面索取",
  "2-4": "丈量",
  "2-5": "場勘",
  // ③ 設計提案/報價/簽約 (不拆分製作與審核，依審核機制控管)
  "3-1": "設計圖",
  "3-2": "報價單",
  "3-3": "提案簡報",
  "3-4": "合約擬定",
  "3-5": "送約/簽約",
  // ④ 生產前確認/拆單
  "4-1": "復丈",
  "4-2": "二次場勘",
  "4-3": "施工圖",
  "4-4": "拆單並提交生產",
  // ⑤ 生產及派送
  "5-1": "生產",
  "5-2": "出貨",
  "5-3": "派工",
  // ⑥ 安裝及驗收
  "6-1": "安裝",
  "6-2": "監工及現場處置",
  "6-3": "工程驗收",
  "6-4": "提交成果驗收",
  "6-5": "加減帳",
  // ⑦ 結案/售後
  "7-1": "批價",
  "7-2": "請款",
  "7-3": "結案",
  "7-4": "追蹤二次回購",
  // 額外階段
  "X-1": "收尾",
  "X-2": "已流標",
};

/** 需要審核的子進度清單 (繪圖/報價/提案/合約/施工圖) */
export const AUDIT_STAGE_CODES = new Set<string>([
  "3-1", // 設計圖
  "3-2", // 報價單
  "3-3", // 提案簡報
  "3-4", // 合約擬定
  "4-3", // 施工圖
]);

/** 哪些進度屬於報價相關 (只有此類項目歷次紀錄才有報價欄位) */
export const QUOTE_STAGE_CODES = new Set<string>([
  "3-2", // 報價單
  "6-5", // 加減帳
  "7-1", // 批價
]);

/** 各子進度預設作業天數 */
export const MILESTONE_DEFAULT_DAYS: Record<MilestoneStageCode, number> = {
  "1-1": 5, "1-2": 2,
  "2-1": 3, "2-2": 3, "2-3": 2, "2-4": 2, "2-5": 2,
  "3-1": 5, "3-2": 5, "3-3": 5, "3-4": 5, "3-5": 2,
  "4-1": 2, "4-2": 2, "4-3": 5, "4-4": 3,
  "5-1": 12, "5-2": 1, "5-3": 2,
  "6-1": 5, "6-2": 5, "6-3": 2, "6-4": 2, "6-5": 5,
  "7-1": 3, "7-2": 5, "7-3": 2, "7-4": 30,
  "X-1": 5, "X-2": 0,
};

export const PHASE_LABELS: Record<MilestonePhase, string> = {
  DEVELOP:     "第一階段：案件開發",
  REQUIREMENT: "第二階段：現況及需求確認",
  PROPOSAL:    "第三階段：設計提案/報價/簽約",
  PRE_PROD:    "第四階段：生產前確認/拆單",
  PROD_SHIP:   "第五階段：生產及派送",
  INSTALL:     "第六階段：安裝及驗收",
  CLOSURE:     "第七階段：請款/售後",
  EXTRA:       "額外階段：收尾/已流標",
  // 向下相容
  CONTACT:     "接洽期",
  DESIGN:      "設計確認期",
  PRODUCTION:  "生產施工期",
};

export const PROJECT_STAGE_LABELS: Record<string, string> = {
  DEVELOP: "案件開發",
  REQUIREMENT: "現況及需求確認",
  PROPOSAL: "設計提案/報價/簽約",
  PRE_PROD: "生產前確認/拆單",
  PROD_SHIP: "生產及派送",
  INSTALL: "安裝及驗收",
  CLOSURE: "請款/售後",
  CLOSED: "請款",
  BILLED: "請款",
  WRAP_UP: "收尾",
  LOST: "已流標",
  INQUIRY: "接洽期",
  MEASUREMENT: "接洽期",
  QUOTE: "接洽期",
  CONTRACT: "接洽期",
  CAD_DRAWING: "設計確認期",
  HANDOFF: "生產施工期",
  DONE: "完成",
  CONTACT: "接洽期",
  DESIGN: "設計確認期",
  PRODUCTION: "生產施工期",
};

export const STAGE_CODE_TO_PHASE: Record<MilestoneStageCode, MilestonePhase> = {
  "1-1": "DEVELOP", "1-2": "DEVELOP",
  "2-1": "REQUIREMENT", "2-2": "REQUIREMENT", "2-3": "REQUIREMENT", "2-4": "REQUIREMENT", "2-5": "REQUIREMENT",
  "3-1": "PROPOSAL", "3-2": "PROPOSAL", "3-3": "PROPOSAL", "3-4": "PROPOSAL", "3-5": "PROPOSAL",
  "4-1": "PRE_PROD", "4-2": "PRE_PROD", "4-3": "PRE_PROD", "4-4": "PRE_PROD",
  "5-1": "PROD_SHIP", "5-2": "PROD_SHIP", "5-3": "PROD_SHIP",
  "6-1": "INSTALL", "6-2": "INSTALL", "6-3": "INSTALL", "6-4": "INSTALL", "6-5": "INSTALL",
  "7-1": "CLOSURE", "7-2": "CLOSURE", "7-3": "CLOSURE", "7-4": "CLOSURE",
  "X-1": "EXTRA", "X-2": "EXTRA",
};

export const STANDARD_MILESTONE_STAGE_CODES: MilestoneStageCode[] = [
  "1-1", "1-2",
  "2-1", "2-2", "2-3", "2-4", "2-5",
  "3-1", "3-2", "3-3", "3-4", "3-5",
  "4-1", "4-2", "4-3", "4-4",
  "5-1", "5-2", "5-3",
  "6-1", "6-2", "6-3", "6-4", "6-5",
  "7-1", "7-2", "7-3", "7-4",
];

/** 預設案件表格欄位定義 (合併報價/戶數為單一欄位，全域通用) */
export const DEFAULT_PROJECT_COLUMNS = [
  { key: "trafficLight", label: "狀態燈號", visible: true, order: 0 },
  { key: "projectName", label: "案場 / 工地", visible: true, order: 1 },
  { key: "customer", label: "客戶 / 折數", visible: true, order: 2 },
  { key: "salesRep", label: "業務 / 業助", visible: true, order: 3 },
  { key: "stageProgress", label: "階段 / 進度", visible: true, order: 4 },
  { key: "quoteAndUnits", label: "報價 / 戶數", visible: true, order: 5 },
  { key: "expectedDate", label: "預定完工日", visible: true, order: 6 },
  { key: "actions", label: "操作", visible: true, order: 7 },
];

export function normalizeProjectColumns(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_PROJECT_COLUMNS;

  const savedColumns = value.filter(
    (column): column is { key: string; label?: string; visible?: boolean; order?: number } =>
      typeof column === "object" &&
      column !== null &&
      typeof (column as { key?: unknown }).key === "string",
  );
  const quoteColumns = savedColumns.filter(({ key }) =>
    ["quoteAndUnits", "amount", "unitCount", "budget"].includes(key),
  );
  const stageColumns = savedColumns.filter(({ key }) =>
    ["stageProgress", "stage", "activeMilestone"].includes(key),
  );
  const quoteColumn = quoteColumns.length
    ? {
        key: "quoteAndUnits",
        label: "報價 / 戶數",
        visible: quoteColumns.some((column) => column.visible !== false),
        order: Math.min(...quoteColumns.map((column) =>
          typeof column.order === "number" ? column.order : Number.MAX_SAFE_INTEGER,
        )),
      }
    : undefined;
  const stageProgressColumn = stageColumns.length
    ? {
        key: "stageProgress",
        label: "階段 / 進度",
        visible: stageColumns.some((column) => column.visible !== false),
        order: Math.min(...stageColumns.map((column) =>
          typeof column.order === "number" ? column.order : Number.MAX_SAFE_INTEGER,
        )),
      }
    : undefined;

  const savedByKey = new Map(
    savedColumns
      .filter(({ key }) => !["amount", "unitCount", "budget", "stage", "activeMilestone"].includes(key))
      .map((column) => [column.key, column]),
  );
  const normalized = DEFAULT_PROJECT_COLUMNS.map((column) => {
    if (column.key === "quoteAndUnits" && quoteColumn) return quoteColumn;
    if (column.key === "stageProgress" && stageProgressColumn) return stageProgressColumn;
    const saved = savedByKey.get(column.key);
    return saved
      ? { ...column, ...saved, label: column.label, visible: saved.visible !== false }
      : column;
  });

  return normalized
    .sort((a, b) => a.order - b.order)
    .map((column, order) => ({ ...column, order }));
}
