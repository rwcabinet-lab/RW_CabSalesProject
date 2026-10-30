import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { MILESTONE_STAGE_LABELS, MilestoneStageCode } from "@/lib/constants";
import { handleApiError } from "@/lib/errors";
import type {
  ManagerProjectStatusReportDTO,
  ProjectStatusItemDTO,
  ProjectStatusYearGroupDTO,
  ProjectStatusSectionDTO,
  ExecutiveReportTargetSummaryDTO,
  TargetPeriodSummaryDTO,
} from "@/types/dto";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"];

/** 台灣地區正則識別 */
function extractRegion(address: string | null | undefined): string {
  if (!address) return "未指定";
  const regions = [
    "台北", "新北", "基隆", "桃園", "新竹", "苗栗", "台中", "彰化", "南投", "雲林",
    "嘉義", "台南", "高雄", "屏東", "宜蘭", "花蓮", "台東", "澎湖", "金門", "連江",
    "臺北", "臺中", "臺南",
  ];
  const cleaned = address.trim();
  for (const r of regions) {
    if (cleaned.includes(r)) {
      if (r === "臺北") return "台北";
      if (r === "臺中") return "台中";
      if (r === "臺南") return "台南";
      return r;
    }
  }
  return cleaned.slice(0, 2) || "未指定";
}

/** 格式化百萬字串 ($ 26.9M) */
function formatMillions(amount: number): string {
  const m = amount / 1_000_000;
  return `$ ${m.toFixed(1)}M`;
}

/** 估價中進度推導：同步該案當前進行中里程碑項目 (如 1-1 客源開發、2-4 丈量、3-1 設計圖、3-2 報價單) */
function deriveProgressNotes(
  milestones: Array<{
    stageCode: string;
    status: string;
    stageOrder?: number;
    notes?: string | null;
  }>
): string {
  if (!milestones || milestones.length === 0) return "估價中";

  const sorted = [...milestones].sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0));
  const active =
    sorted.find((m) => m.status === "OVERDUE") ||
    sorted.find((m) => m.status === "IN_PROGRESS") ||
    sorted.find((m) => m.status !== "COMPLETED");

  if (!active) return "已完成";

  const label =
    MILESTONE_STAGE_LABELS[active.stageCode as MilestoneStageCode] || active.stageCode;
  const stageName = `${active.stageCode} ${label}`;

  if (active.notes && active.notes.trim()) {
    return `${stageName} (${active.notes.trim()})`;
  }

  return stageName;
}

// 預設 2026 年經營會議目標
const DEFAULT_TARGET_CONFIG = {
  annualYear: 2026,
  annualTarget: 250_000_000,
  periods: [
    { periodKey: "2026/Q1", periodLabel: "2026/Q1", targetAmount: 60_000_000, manualActual: 45_500_000 },
    { periodKey: "2026/Q2", periodLabel: "2026/Q2", targetAmount: 60_000_000, manualActual: 37_900_000 },
    { periodKey: "2026/Q3", periodLabel: "2026/Q3", targetAmount: 60_000_000, manualActual: 52_600_000 },
    { periodKey: "2026/10月", periodLabel: "2026/10月", targetAmount: 20_000_000, manualActual: 14_900_000, isCurrent: true },
  ],
};

// 預設自訂分類覆寫（初期對齊經營會議報告專案）
const DEFAULT_OVERRIDES: Record<string, "SIGNED" | "ESTIMATING" | "QUOTED"> = {
  "cmv4t8eck000lx3v6kbewaxiy": "SIGNED", // 興富川一期20戶(彰化溪州)
  "cmv4tnn7s001px3v65yie5lbk": "SIGNED", // 關山醫院宿舍
  "cmv501pny000410uae5yc8pw1": "SIGNED", // 南投青年宅二期
  "cmv4zyyqr000611rvv8fve0zh": "SIGNED", // 台南安南原西段住宅裝修
  "cmv4tp0di0024242ptlvmuh42": "SIGNED", // 樂善安居
  "cmv4tskp40032242pkjsoupyg": "SIGNED", // 南投碧峰欣悅
  "cmv4tisl40016x3v6utad3ick": "SIGNED", // 南投住辦蘇宅-1F辦公室
  "cmv60voqu001pqk0lb9e7bz6p": "ESTIMATING", // 守葳 桃園店
  "cmv60wuza0028qk0lkv1ci8et": "ESTIMATING", // 鼎泰包租代管 台中東南街
  "cmv627dfc004hzubz5z4uo807": "ESTIMATING", // 大成不銹鋼工業 新田一廠
  "cmv614b4a004aqk0lrgvdt04y": "ESTIMATING", // 茂居建設 台中大甲甲寶鑽
  "cmv6138rk000ljccz0dllegjz": "ESTIMATING", // 茂居建設 台中外埔永吉段
  "cmv500etq0002n389bcrqntvj": "ESTIMATING", // 實力開發 彰化房角石悅
  "cmv5z5gfb000412yvtu7qi6v0": "ESTIMATING", // 猛揮營造 屏東復合樓
  "cmv62297s002l5m3er99to2nj": "ESTIMATING", // 登田營造 牛耳度假中心
};

// GET /api/dashboard/manager/status-report?year=2026&month=10
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    if (!MANAGER_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "僅主管層級可查閱案件現況統計報表" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const selectedYear = parseInt(searchParams.get("year") || "2026", 10);
    const selectedMonth = parseInt(searchParams.get("month") || "10", 10);

    // 1. 取得所有專案及相關里程碑（精準欄位查詢，在資料庫端排除流標案場並剔除無用歷程記錄）
    const [projects, targetConfigRow, overrideRow] = await Promise.all([
      prisma.project.findMany({
        relationLoadStrategy: "join",
        where: {
          currentStage: { not: "LOST" },
        },
        select: {
          id: true,
          projectName: true,
          siteAddress: true,
          currentStage: true,
          expectedDate: true,
          unitCount: true,
          quoteAmount: true,
          estimatedBudget: true,
          customer: {
            select: {
              id: true,
              name: true,
              customerType: true,
              salesRep: { select: { id: true, name: true } },
            },
          },
          salesRep: {
            select: { id: true, name: true },
          },
          milestones: {
            select: {
              id: true,
              stageCode: true,
              stageOrder: true,
              status: true,
              notes: true,
              plannedDueDate: true,
            },
            orderBy: { stageOrder: "asc" },
          },
        },
        orderBy: [{ expectedDate: "asc" }, { createdAt: "desc" }],
      }),
      prisma.appConfig.findUnique({
        where: { key: `manager_report_targets_${selectedYear}` },
      }),
      prisma.appConfig.findUnique({
        where: { key: "manager_project_status_override" },
      }),
    ]);

    // 解析目標配置
    let targetConfig = DEFAULT_TARGET_CONFIG;
    if (targetConfigRow?.value) {
      try {
        targetConfig = JSON.parse(targetConfigRow.value);
      } catch (err) {
        console.warn("Failed to parse targetConfig:", err);
      }
    }

    // 解析覆寫字典
    let overrides: Record<string, "SIGNED" | "ESTIMATING" | "QUOTED"> = { ...DEFAULT_OVERRIDES };
    if (overrideRow?.value) {
      try {
        const parsed = JSON.parse(overrideRow.value);
        overrides = { ...DEFAULT_OVERRIDES, ...parsed };
      } catch (err) {
        console.warn("Failed to parse overrides:", err);
      }
    }

    // 2. 分類處理
    const signedItems: ProjectStatusItemDTO[] = [];
    const estimatingItems: ProjectStatusItemDTO[] = [];
    const quotedItems: ProjectStatusItemDTO[] = [];

    for (const p of projects) {
      if (p.currentStage === "LOST") continue;

      const m35 = p.milestones.find((m) => m.stageCode === "3-5");
      const m32 = p.milestones.find((m) => m.stageCode === "3-2");
      const isPastContract = [
        "PRE_PROD",
        "PROD_SHIP",
        "INSTALL",
        "CLOSURE",
        "CLOSED",
        "BILLED",
        "DONE",
      ].includes(p.currentStage);

      // 自動判定邏輯
      const autoSigned = m35?.status === "COMPLETED" || isPastContract;
      const amt = Number(p.quoteAmount) || Number(p.estimatedBudget) || 0;
      const autoQuoted =
        !autoSigned &&
        (m32?.status === "COMPLETED" || (amt > 0 && m32?.status !== "IN_PROGRESS"));

      // 檢查自訂覆寫
      const override = overrides[p.id] as "SIGNED" | "ESTIMATING" | "QUOTED" | undefined;
      const category: "SIGNED" | "ESTIMATING" | "QUOTED" =
        override || (autoSigned ? "SIGNED" : autoQuoted ? "QUOTED" : "ESTIMATING");

      // 竣工年份提取
      let year = "未排定";
      if (p.expectedDate) {
        year = new Date(p.expectedDate).getFullYear().toString();
      } else if (m35?.plannedDueDate) {
        year = new Date(m35.plannedDueDate).getFullYear().toString();
      }

      const region = extractRegion(p.siteAddress);
      const unitCount = p.unitCount && p.unitCount > 0 ? p.unitCount : 1;
      const salesRepName = p.salesRep?.name || p.customer.salesRep?.name || "未指定";

      const item: ProjectStatusItemDTO = {
        id: p.id,
        customerName: p.customer.name,
        projectName: p.projectName,
        region,
        unitCount,
        amount: category === "ESTIMATING" ? null : amt,
        progressNotes:
          category === "ESTIMATING" ? deriveProgressNotes(p.milestones) : undefined,
        expectedDate: p.expectedDate ? p.expectedDate.toISOString().slice(0, 10) : null,
        year,
        currentStage: p.currentStage,
        overrideSection: override || null,
        salesRepName,
      };

      if (category === "SIGNED") {
        signedItems.push(item);
      } else if (category === "QUOTED") {
        quotedItems.push(item);
      } else {
        estimatingItems.push(item);
      }
    }

    // 3. 依年份分組並計算小計
    function groupIntoSection(
      title: string,
      key: "SIGNED" | "ESTIMATING" | "QUOTED",
      items: ProjectStatusItemDTO[]
    ): ProjectStatusSectionDTO {
      const yearMap = new Map<string, ProjectStatusItemDTO[]>();
      for (const item of items) {
        const y = item.year || "未排定";
        if (!yearMap.has(y)) yearMap.set(y, []);
        yearMap.get(y)!.push(item);
      }

      // 年份排序 (2026, 2027, 2028, 2029, ..., 未排定在最後)
      const sortedYears = Array.from(yearMap.keys()).sort((a, b) => {
        if (a === "未排定") return 1;
        if (b === "未排定") return -1;
        return a.localeCompare(b);
      });

      let totalAmount = 0;
      let totalUnits = 0;
      const yearlyGroups: ProjectStatusYearGroupDTO[] = [];

      for (const y of sortedYears) {
        const groupProjects = yearMap.get(y)!;
        const subtotalAmount = groupProjects.reduce((sum, p) => sum + (p.amount || 0), 0);
        const subtotalUnits = groupProjects.reduce((sum, p) => sum + (p.unitCount || 0), 0);

        totalAmount += subtotalAmount;
        totalUnits += subtotalUnits;

        yearlyGroups.push({
          year: y,
          subtotalAmount,
          subtotalLabel: formatMillions(subtotalAmount),
          totalUnits: subtotalUnits,
          projects: groupProjects,
        });
      }

      return {
        title,
        key,
        totalAmount,
        totalAmountLabel: formatMillions(totalAmount),
        totalProjects: items.length,
        totalUnits,
        yearlyGroups,
      };
    }

    const signedSection = groupIntoSection("已簽約", "SIGNED", signedItems);
    const estimatingSection = groupIntoSection("估價中", "ESTIMATING", estimatingItems);
    const quotedSection = groupIntoSection("已報價", "QUOTED", quotedItems);

    // 4. 計算經營目標達成率卡片數據
    const annualTarget = targetConfig.annualTarget || 250_000_000;
    let runningCumulative = 0;
    const periodsSummary: TargetPeriodSummaryDTO[] = targetConfig.periods.map((p) => {
      const actual = p.manualActual || 0;
      runningCumulative += actual;
      const rate = p.targetAmount > 0 ? Math.round((actual / p.targetAmount) * 100) : 0;
      return {
        periodKey: p.periodKey,
        periodLabel: p.periodLabel,
        targetAmount: p.targetAmount,
        actualAmount: actual,
        achievementRate: rate,
        cumulativeActual: runningCumulative,
        isCurrent: Boolean(p.isCurrent),
      };
    });

    const cumulativeActual = runningCumulative;
    const achievementRate =
      annualTarget > 0 ? Math.round((cumulativeActual / annualTarget) * 100) : 0;

    const targetSummary: ExecutiveReportTargetSummaryDTO = {
      annualYear: selectedYear,
      annualTarget,
      cumulativeActual,
      achievementRate,
      periods: periodsSummary,
    };

    const report: ManagerProjectStatusReportDTO = {
      reportTitle: `${selectedMonth} 月份系統櫃部經營會議報告`,
      year: selectedYear,
      month: selectedMonth,
      targetSummary,
      signedSection,
      estimatingSection,
      quotedSection,
    };

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error, "產出案件現況統計報告失敗");
  }
}

// POST /api/dashboard/manager/status-report
// 支援更新目標設定或專案分類覆寫
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    if (!MANAGER_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "僅主管層級可更新設定" }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "UPDATE_TARGETS") {
      const { year, config } = body;
      const key = `manager_report_targets_${year || 2026}`;
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: JSON.stringify(config) },
        update: { value: JSON.stringify(config) },
      });
      return NextResponse.json({ success: true, message: "目標設定已更新" });
    }

    if (action === "OVERRIDE_SECTION") {
      const { projectId, section } = body as {
        projectId: string;
        section: "SIGNED" | "ESTIMATING" | "QUOTED" | "AUTO";
      };

      const key = "manager_project_status_override";
      const existing = await prisma.appConfig.findUnique({ where: { key } });
      let currentOverrides: Record<string, string> = { ...DEFAULT_OVERRIDES };
      if (existing?.value) {
        try {
          currentOverrides = { ...currentOverrides, ...JSON.parse(existing.value) };
        } catch (e) {}
      }

      if (section === "AUTO") {
        delete currentOverrides[projectId];
      } else {
        currentOverrides[projectId] = section;
      }

      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: JSON.stringify(currentOverrides) },
        update: { value: JSON.stringify(currentOverrides) },
      });

      return NextResponse.json({ success: true, message: "專案分類已更新" });
    }

    return NextResponse.json({ error: "不支援的動作" }, { status: 400 });
  } catch (error) {
    return handleApiError(error, "更新設定失敗");
  }
}
