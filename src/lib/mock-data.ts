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

export interface MasterBoardItem {
  id: string;
  brand: string;
  colorCode: string;
  thicknessMm: number;
  grade: string;
  unit: string;
  retailPrice: number;
}

export interface MasterHardwareItem {
  id: string;
  brand: string;
  modelName: string;
  category: "HINGE" | "SLIDE" | "PULLOUT" | "HANDLE" | "ACCESSORY";
  retailPrice: number;
}

export interface MasterProcessingItem {
  id: string;
  processName: string;
  unit: string;
  retailPrice: number;
}

/** 簡易報價版本紀錄 — 計算已在外部系統完成，本系統僅登記結果 */
export interface QuotationData {
  id: string;
  projectId: string;
  /** 版本號，例如 "V1" / "V2" */
  version: string;
  /** 外部系統報價單號 */
  externalQuoteNo?: string;
  /** 外部報價單 PDF 連結 */
  quoteFileUrl?: string;
  /** 最終報價總金額 (含稅，NT$) */
  totalAmount: number;
  /** 備註說明 */
  notes?: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
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
  "3-6": "提案簡報",
  "3-7": "合約製作",
  "3-8": "合約審核",
  "3-9": "送約/簽約",
  // ④ 生產前確認/拆單
  "4-1": "復丈",
  "4-2": "二次場勘",
  "4-3": "施工圖",
  "4-4": "拆單並提交生產",
  "4-5": "拆單並提交生產",
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
  "7-3": "追蹤二次回購",
  // 額外階段
  "X-1": "收尾",
  "X-2": "已流標",
};

/** 需要審核的子進度清單 (繪圖/報價/提案/合約/施工圖) */
export const AUDIT_STAGE_CODES = new Set<string>([
  "3-1", // 設計圖
  "3-2", // 報價單
  "3-3", // 提案簡報
  "3-4", // 合約
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
  "3-1": 5, "3-2": 2, "3-3": 3, "3-4": 2, "3-5": 3, "3-6": 2, "3-7": 3, "3-8": 2, "3-9": 5,
  "4-1": 2, "4-2": 2, "4-3": 7, "4-4": 3, "4-5": 3,
  "5-1": 14, "5-2": 3, "5-3": 2,
  "6-1": 5, "6-2": 5, "6-3": 2, "6-4": 2, "6-5": 3,
  "7-1": 3, "7-2": 5, "7-3": 30,
  "X-1": 5, "X-2": 1,
};

export const PHASE_LABELS: Record<MilestonePhase, string> = {
  DEVELOP:     "第一階段：案件開發",
  REQUIREMENT: "第二階段：現況及需求確認",
  PROPOSAL:    "第三階段：設計提案/報價/簽約",
  PRE_PROD:    "第四階段：生產前確認/拆單",
  PROD_SHIP:   "第五階段：生產及派送",
  INSTALL:     "第六階段：安裝及驗收",
  CLOSURE:     "第七階段：結案/售後",
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
  CLOSURE: "結案/售後",
  CLOSED: "已結案",
  BILLED: "已立帳",
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
  "3-1": "PROPOSAL", "3-2": "PROPOSAL", "3-3": "PROPOSAL", "3-4": "PROPOSAL", "3-5": "PROPOSAL", "3-6": "PROPOSAL", "3-7": "PROPOSAL", "3-8": "PROPOSAL", "3-9": "PROPOSAL",
  "4-1": "PRE_PROD", "4-2": "PRE_PROD", "4-3": "PRE_PROD", "4-4": "PRE_PROD", "4-5": "PRE_PROD",
  "5-1": "PROD_SHIP", "5-2": "PROD_SHIP", "5-3": "PROD_SHIP",
  "6-1": "INSTALL", "6-2": "INSTALL", "6-3": "INSTALL", "6-4": "INSTALL", "6-5": "INSTALL",
  "7-1": "CLOSURE", "7-2": "CLOSURE", "7-3": "CLOSURE",
  "X-1": "EXTRA", "X-2": "EXTRA",
};

export const STANDARD_MILESTONE_STAGE_CODES: MilestoneStageCode[] = [
  "1-1", "1-2",
  "2-1", "2-2", "2-3", "2-4", "2-5",
  "3-1", "3-2", "3-3", "3-4", "3-5",
  "4-1", "4-2", "4-3", "4-4",
  "5-1", "5-2", "5-3",
  "6-1", "6-2", "6-3", "6-4", "6-5",
  "7-1", "7-2", "7-3",
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

// ----------------------------------------------------------------
// 初始種子資料
// ----------------------------------------------------------------
export const INITIAL_BOARDS: MasterBoardItem[] = [
  { id: "b1", brand: "EGGER", colorCode: "H3309 ST28 自然深色橡木", thicknessMm: 18, grade: "E0-V313", unit: "才", retailPrice: 85 },
  { id: "b2", brand: "EGGER", colorCode: "H3309 ST28 自然深色橡木", thicknessMm: 25, grade: "E0-V313", unit: "才", retailPrice: 120 },
  { id: "b3", brand: "EGGER", colorCode: "H3309 ST28 自然深色橡木", thicknessMm: 8, grade: "E0-V313", unit: "才", retailPrice: 55 },
  { id: "b4", brand: "EGGER", colorCode: "W980 SM 珍珠暖白", thicknessMm: 18, grade: "E0-V313", unit: "才", retailPrice: 75 },
  { id: "b5", brand: "EGGER", colorCode: "W980 SM 珍珠暖白", thicknessMm: 8, grade: "E0-V313", unit: "才", retailPrice: 50 },
  { id: "b6", brand: "EGGER", colorCode: "F186 ST9 淺灰色清水模", thicknessMm: 18, grade: "E0-V313", unit: "才", retailPrice: 90 },
  { id: "b7", brand: "KAINDL", colorCode: "K4325 仿清水模灰", thicknessMm: 18, grade: "E0-V313", unit: "才", retailPrice: 88 },
  { id: "b8", brand: "國產防潮板", colorCode: "經典亞麻布紋", thicknessMm: 18, grade: "E1-V313", unit: "才", retailPrice: 60 },
  { id: "b9", brand: "國產防潮板", colorCode: "經典亞麻布紋", thicknessMm: 8, grade: "E1-V313", unit: "才", retailPrice: 42 },
];

export const INITIAL_HARDWARE: MasterHardwareItem[] = [
  { id: "h1", brand: "Blum", modelName: "快拆集成緩衝鉸鏈 (110度全蓋)", category: "HINGE", retailPrice: 180 },
  { id: "h2", brand: "Blum", modelName: "快拆集成緩衝鉸鏈 (110度半蓋)", category: "HINGE", retailPrice: 180 },
  { id: "h3", brand: "Blum", modelName: "隱藏式三節緩衝滑軌 500mm", category: "SLIDE", retailPrice: 750 },
  { id: "h4", brand: "King Slide 川湖", modelName: "51B 隱藏式木抽緩衝滑軌 450mm", category: "SLIDE", retailPrice: 480 },
  { id: "h5", brand: "King Slide 川湖", modelName: "3M52 鋼珠緩衝滑軌 450mm", category: "SLIDE", retailPrice: 320 },
  { id: "h6", brand: "Blum", modelName: "TIP-ON 機械式拍門器 (長型附磁)", category: "ACCESSORY", retailPrice: 220 },
  { id: "h7", brand: "義大利進口", modelName: "鋁擠型黑色指縫內嵌把手 (米)", category: "HANDLE", retailPrice: 350 },
  { id: "h8", brand: "豪美", modelName: "緩衝多功能調味品側拉籃 (300寬)", category: "PULLOUT", retailPrice: 2200 },
];

export const INITIAL_PROCESSING: MasterProcessingItem[] = [
  { id: "p1", processName: "1.0mm ABS 厚封邊加工", unit: "米", retailPrice: 45 },
  { id: "p2", processName: "2.0mm ABS 厚封邊加工", unit: "米", retailPrice: 65 },
  { id: "p3", processName: "門片 45 度無把手斜導角加工", unit: "米", retailPrice: 120 },
  { id: "p4", processName: "檯面插座現場所開孔", unit: "處", retailPrice: 150 },
  { id: "p5", processName: "檯面水槽現場所開孔", unit: "處", retailPrice: 600 },
  { id: "p6", processName: "背板 8mm 開槽加工", unit: "米", retailPrice: 30 },
  { id: "p7", processName: "系統櫃抽屜組裝加工費", unit: "組", retailPrice: 250 },
];

export const INITIAL_CUSTOMERS: CustomerItem[] = [
  {
    id: "c1",
    customerType: "DESIGNER",
    name: "品辰室內設計工程有限公司",
    taxId: "54892134",
    phone: "02-27891234",
    address: "台北市南港區重陽路168號3樓",
    defaultDiscount: 0.85,
    paymentTerms: "MONTHLY_30",
    salesRepId: "u3",
    salesRepName: "林宏遠",
  },
  {
    id: "c2",
    customerType: "PR",
    name: "巨匠統包工程行",
    taxId: "42981765",
    phone: "02-89512345",
    address: "新北市板橋區三民路二段88號",
    defaultDiscount: 0.85,
    paymentTerms: "DEPOSIT_BALANCE",
    salesRepId: "u4",
    salesRepName: "陳廷瑋",
  },
  {
    id: "c3",
    customerType: "DEALER",
    name: "欣居系統家具名店",
    taxId: "28475912",
    phone: "03-6578901",
    address: "新竹縣竹北市光明六路120號",
    defaultDiscount: 0.80,
    paymentTerms: "MONTHLY_30",
    salesRepId: "u3",
    salesRepName: "林宏遠",
  },
  {
    id: "c4",
    customerType: "HOMEOWNER",
    name: "淡水李公館 (李國強先生)",
    phone: "0912-345-678",
    address: "新北市淡水區濱海路一段55號12樓",
    defaultDiscount: 1.00,
    paymentTerms: "DEPOSIT_BALANCE",
    salesRepId: "u3",
    salesRepName: "林宏遠",
  },
  {
    id: "c5",
    customerType: "HOMEOWNER",
    name: "天母黃公館 (黃小姐)",
    phone: "0933-888-999",
    address: "台北市士林區忠誠路二段99號",
    defaultDiscount: 1.00,
    paymentTerms: "DEPOSIT_BALANCE",
    salesRepId: "u4",
    salesRepName: "陳廷瑋",
  },
];

export const INITIAL_PROJECTS: ProjectDetail[] = [
  {
    id: "p1",
    projectName: "淡水新市鎮-李公館全室系統櫃",
    customerId: "c4",
    customerName: "淡水李公館 (李國強先生)",
    customerType: "HOMEOWNER",
    defaultDiscount: 1.00,
    siteAddress: "新北市淡水區濱海路一段55號12樓",
    siteCondition: "新成屋 (已完成地磚保護)",
    salesRepId: "u3",
    salesRepName: "林宏遠",
    salesAssistantId: "u5",
    salesAssistantName: "張育菁",
    currentStage: "MEASUREMENT",
    isDelayed: false,
    expectedDate: "2026-11-20",
    estimatedBudget: 350000,
  },
  {
    id: "p2",
    projectName: "竹北遠百特案-品辰設計張總監宅",
    customerId: "c1",
    customerName: "品辰室內設計工程有限公司",
    customerType: "DESIGNER",
    defaultDiscount: 0.85,
    siteAddress: "新竹縣竹北市光明六路東一段233號",
    siteCondition: "毛胚屋客變中",
    salesRepId: "u3",
    salesRepName: "林宏遠",
    salesAssistantId: "u5",
    salesAssistantName: "張育菁",
    currentStage: "QUOTE",
    isDelayed: false,
    expectedDate: "2026-12-15",
    estimatedBudget: 480000,
  },
  {
    id: "p3",
    projectName: "板橋府中舊翻新案-巨匠統包",
    customerId: "c2",
    customerName: "巨匠統包工程行",
    customerType: "PR",
    defaultDiscount: 0.85,
    siteAddress: "新北市板橋區文化路一段120號5樓",
    siteCondition: "老屋全面翻新泥作完工",
    salesRepId: "u4",
    salesRepName: "陳廷瑋",
    salesAssistantId: "u5",
    salesAssistantName: "張育菁",
    currentStage: "CAD_DRAWING",
    isDelayed: true,
    expectedDate: "2026-10-15",
    estimatedBudget: 260000,
  },
];

/** 每個 projectId 對應一組報價版本列表，index 0 為最舊版，最後一筆為最新版 */
export const INITIAL_QUOTES: Record<string, QuotationData[]> = {
  p2: [
    {
      id: "q-p2-v1",
      projectId: "p2",
      version: "V1",
      externalQuoteNo: "EXT-2026-0918-001",
      quoteFileUrl: "https://example.com/quotes/p2-v1.pdf",
      totalAmount: 480000,
      notes: "初版報價，含全室系統櫃 (客廳+主臥+書房)。業主需確認廚房電器尺寸後調整。",
      status: "SENT",
      createdAt: "2026-09-18T10:00:00Z",
      updatedAt: "2026-09-18T10:00:00Z",
    },
    {
      id: "q-p2-v2",
      projectId: "p2",
      version: "V2",
      externalQuoteNo: "EXT-2026-0921-002",
      quoteFileUrl: "https://example.com/quotes/p2-v2.pdf",
      totalAmount: 432000,
      notes: "V2 修訂版：業主取消書房端景展示架，廚房調味拉籃改為基本款，折減後總計 43.2萬。",
      status: "DRAFT",
      createdAt: "2026-09-21T09:30:00Z",
      updatedAt: "2026-09-21T09:30:00Z",
    },
  ],
  p1: [
    {
      id: "q-p1-v1",
      projectId: "p1",
      version: "V1",
      externalQuoteNo: "EXT-2026-0920-003",
      totalAmount: 350000,
      notes: "丈量前初步概估報價，待現場丈量後確認。",
      status: "DRAFT",
      createdAt: "2026-09-20T14:00:00Z",
      updatedAt: "2026-09-20T14:00:00Z",
    },
  ],
};

export const INITIAL_MILESTONES: Record<string, ProjectMilestoneItem[]> = {
  p1: [
    { id: "m1-1-1", projectId: "p1", stageCode: "1-1", phase: "CONTACT",    stageOrder: 1,  plannedDueDate: "2026-09-20", actualDueDate: "2026-09-20", status: "COMPLETED", assignedToId: "u3", assignedToName: "林宏遠", notes: "初步聯繫確認需求範圍" },
    { id: "m1-1-2", projectId: "p1", stageCode: "1-2", phase: "CONTACT",    stageOrder: 2,  plannedDueDate: "2026-09-23", status: "IN_PROGRESS", assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m1-2-1", projectId: "p1", stageCode: "2-1", phase: "DESIGN",     stageOrder: 3,  plannedDueDate: "2026-10-17", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m1-2-2", projectId: "p1", stageCode: "2-2", phase: "DESIGN",     stageOrder: 4,  plannedDueDate: "2026-10-21", status: "PENDING",     assignedToId: "u5", assignedToName: "張育菁" },
    { id: "m1-2-3", projectId: "p1", stageCode: "2-3", phase: "DESIGN",     stageOrder: 5,  plannedDueDate: "2026-10-25", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m1-2-4", projectId: "p1", stageCode: "2-4", phase: "DESIGN",     stageOrder: 6,  plannedDueDate: "2026-11-05", status: "PENDING",     assignedToId: "u5", assignedToName: "張育菁" },
    { id: "m1-3-1", projectId: "p1", stageCode: "3-1", phase: "PRODUCTION", stageOrder: 7,  plannedDueDate: "2026-11-20", status: "PENDING",     assignedToId: "u2", assignedToName: "王志明" },
    { id: "m1-3-2", projectId: "p1", stageCode: "3-2", phase: "PRODUCTION", stageOrder: 8,  plannedDueDate: "2026-11-28", status: "PENDING",     assignedToId: "u2", assignedToName: "王志明" },
    { id: "m1-3-3", projectId: "p1", stageCode: "3-3", phase: "PRODUCTION", stageOrder: 9,  plannedDueDate: "2026-12-02", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m1-3-4", projectId: "p1", stageCode: "3-4", phase: "PRODUCTION", stageOrder: 10, plannedDueDate: "2026-12-04", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m1-3-5", projectId: "p1", stageCode: "3-5", phase: "PRODUCTION", stageOrder: 11, plannedDueDate: "2026-12-06", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
  ],
  p2: [
    { id: "m2-1-1", projectId: "p2", stageCode: "1-1", phase: "CONTACT",    stageOrder: 1,  plannedDueDate: "2026-09-12", actualDueDate: "2026-09-12", status: "COMPLETED", assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m2-1-2", projectId: "p2", stageCode: "1-2", phase: "CONTACT",    stageOrder: 2,  plannedDueDate: "2026-09-15", actualDueDate: "2026-09-15", status: "COMPLETED", assignedToId: "u3", assignedToName: "林宏遠", notes: "已完成現場水平放樣" },
    { id: "m2-2-1", projectId: "p2", stageCode: "2-1", phase: "DESIGN",     stageOrder: 3,  plannedDueDate: "2026-10-13", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m2-2-2", projectId: "p2", stageCode: "2-2", phase: "DESIGN",     stageOrder: 4,  plannedDueDate: "2026-10-17", status: "PENDING",     assignedToId: "u5", assignedToName: "張育菁" },
    { id: "m2-2-3", projectId: "p2", stageCode: "2-3", phase: "DESIGN",     stageOrder: 5,  plannedDueDate: "2026-10-21", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m2-2-4", projectId: "p2", stageCode: "2-4", phase: "DESIGN",     stageOrder: 6,  plannedDueDate: "2026-11-01", status: "PENDING",     assignedToId: "u5", assignedToName: "張育菁" },
    { id: "m2-3-1", projectId: "p2", stageCode: "3-1", phase: "PRODUCTION", stageOrder: 7,  plannedDueDate: "2026-11-15", status: "PENDING",     assignedToId: "u2", assignedToName: "王志明" },
    { id: "m2-3-2", projectId: "p2", stageCode: "3-2", phase: "PRODUCTION", stageOrder: 8,  plannedDueDate: "2026-11-23", status: "PENDING",     assignedToId: "u2", assignedToName: "王志明" },
    { id: "m2-3-3", projectId: "p2", stageCode: "3-3", phase: "PRODUCTION", stageOrder: 9,  plannedDueDate: "2026-11-27", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m2-3-4", projectId: "p2", stageCode: "3-4", phase: "PRODUCTION", stageOrder: 10, plannedDueDate: "2026-11-29", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
    { id: "m2-3-5", projectId: "p2", stageCode: "3-5", phase: "PRODUCTION", stageOrder: 11, plannedDueDate: "2026-12-01", status: "PENDING",     assignedToId: "u3", assignedToName: "林宏遠" },
  ],
  p3: [
    { id: "m3-1-1", projectId: "p3", stageCode: "1-1", phase: "CONTACT",    stageOrder: 1,  plannedDueDate: "2026-09-01", actualDueDate: "2026-09-01", status: "COMPLETED", assignedToId: "u4", assignedToName: "陳廷瑋" },
    { id: "m3-1-2", projectId: "p3", stageCode: "1-2", phase: "CONTACT",    stageOrder: 2,  plannedDueDate: "2026-09-04", actualDueDate: "2026-09-03", status: "COMPLETED", assignedToId: "u4", assignedToName: "陳廷瑋" },
    { id: "m3-2-1", projectId: "p3", stageCode: "2-1", phase: "DESIGN",     stageOrder: 3,  plannedDueDate: "2026-09-16", actualDueDate: "2026-09-16", status: "COMPLETED", assignedToId: "u4", assignedToName: "陳廷瑋" },
    { id: "m3-2-2", projectId: "p3", stageCode: "2-2", phase: "DESIGN",     stageOrder: 4,  plannedDueDate: "2026-09-18", actualDueDate: "2026-09-18", status: "COMPLETED", assignedToId: "u5", assignedToName: "張育菁" },
    { id: "m3-2-3", projectId: "p3", stageCode: "2-3", phase: "DESIGN",     stageOrder: 5,  plannedDueDate: "2026-09-19", actualDueDate: "2026-09-19", status: "COMPLETED", assignedToId: "u4", assignedToName: "陳廷瑋" },
    { id: "m3-2-4", projectId: "p3", stageCode: "2-4", phase: "DESIGN",     stageOrder: 6,  plannedDueDate: "2026-09-19", status: "OVERDUE",     assignedToId: "u5", assignedToName: "張育菁", notes: "業主變更廚房電器規格，需重新拆單與圖面定稿 (已逾期卡關)" },
    { id: "m3-3-1", projectId: "p3", stageCode: "3-1", phase: "PRODUCTION", stageOrder: 7,  plannedDueDate: "2026-10-05", status: "PENDING",     assignedToId: "u2", assignedToName: "王志明" },
    { id: "m3-3-2", projectId: "p3", stageCode: "3-2", phase: "PRODUCTION", stageOrder: 8,  plannedDueDate: "2026-10-13", status: "PENDING",     assignedToId: "u2", assignedToName: "王志明" },
    { id: "m3-3-3", projectId: "p3", stageCode: "3-3", phase: "PRODUCTION", stageOrder: 9,  plannedDueDate: "2026-10-16", status: "PENDING",     assignedToId: "u4", assignedToName: "陳廷瑋" },
    { id: "m3-3-4", projectId: "p3", stageCode: "3-4", phase: "PRODUCTION", stageOrder: 10, plannedDueDate: "2026-10-18", status: "PENDING",     assignedToId: "u4", assignedToName: "陳廷瑋" },
    { id: "m3-3-5", projectId: "p3", stageCode: "3-5", phase: "PRODUCTION", stageOrder: 11, plannedDueDate: "2026-10-20", status: "PENDING",     assignedToId: "u4", assignedToName: "陳廷瑋" },
  ],
};

export const INITIAL_TASKS: SalesTaskItem[] = [
  {
    id: "t1",
    projectId: "p1",
    projectName: "淡水新市鎮-李公館全室系統櫃",
    assignedToId: "u3",
    assignedToName: "林宏遠",
    taskType: "SITE_VISIT",
    subject: "攜帶 EGGER 木紋色卡與雷射測距儀至現場進行精確放樣丈量",
    dueDatetime: "2026-09-23T10:00:00Z",
    priority: "HIGH",
    isCompleted: false,
  },
  {
    id: "t2",
    projectId: "p2",
    projectName: "竹北遠百特案-品辰設計張總監宅",
    assignedToId: "u3",
    assignedToName: "林宏遠",
    taskType: "QUOTE_FOLLOWUP",
    subject: "與品辰張設計師核對電視櫃與衣櫃細部報價 (B2B 0.85折)",
    dueDatetime: "2026-09-24T16:00:00Z",
    priority: "HIGH",
    isCompleted: false,
  },
  {
    id: "t3",
    projectId: "p3",
    projectName: "板橋府中舊翻新案-巨匠統包",
    assignedToId: "u5",
    assignedToName: "張育菁",
    taskType: "DRAWING",
    subject: "【緊急逾期】廚房電器櫃散熱開孔與插座位置修訂出圖",
    dueDatetime: "2026-09-19T18:00:00Z",
    priority: "HIGH",
    isCompleted: false,
    resultNotes: "統包工班催促今日務必定稿以利水電配管",
  },
  {
    id: "t4",
    projectId: "p1",
    projectName: "淡水新市鎮-李公館全室系統櫃",
    assignedToId: "u3",
    assignedToName: "林宏遠",
    taskType: "PAYMENT_REMINDER",
    subject: "丈量後與李先生確認初報排程與預付訂金流程",
    dueDatetime: "2026-09-26T12:00:00Z",
    priority: "MEDIUM",
    isCompleted: false,
  },
];
