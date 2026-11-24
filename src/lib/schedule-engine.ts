import {
  ProjectMilestoneItem,
  MilestoneStageCode,
  MILESTONE_STAGE_LABELS,
  MILESTONE_DEFAULT_DAYS,
  STAGE_CODE_TO_PHASE,
  isClosureStageCode,
  isInstallStageCode,
  isPreInstallStageCode,
  isJumpableStageCode,
} from "./constants";
import { BadRequestError, ConflictError } from "./errors";

/** 純 UTC 日期字串加減天數 (YYYY-MM-DD) */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export interface TrafficLightStatus {
  color: "RED" | "YELLOW" | "GREEN" | "GRAY";
  label: string;
  daysDiff: number;
}

/** 取得台灣時區 (Asia/Taipei, UTC+8) 之 YYYY-MM-DD 日期字串，解決 UTC 換日造成的清晨 8 小時偏差 */
export function getTaiwanDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/** 取得台灣時區 (Asia/Taipei, UTC+8) 之 YYYY-MM-DDTHH:mm 日期時間字串 */
export function getTaiwanDateTimeString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export interface TaskScheduleStatus {
  isOverdue: boolean;
  isDueToday: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  dueDateStr: string;
  badgeLabel: "已逾期" | "已到期" | "需追蹤" | "已完成" | null;
}

/** 評估待辦事項時程狀態（逾期/當天到期/需追蹤/完成） */
export function getTaskScheduleStatus(
  task: {
    dueDatetime?: string | null;
    isCompleted?: boolean;
    isPaused?: boolean;
  },
  currentDate: Date = new Date()
): TaskScheduleStatus {
  const todayStr = getTaiwanDateString(currentDate);
  const dueDateStr = task.dueDatetime ? task.dueDatetime.slice(0, 10) : "";
  const isCompleted = Boolean(task.isCompleted);
  const isPaused = Boolean(task.isPaused);

  if (isCompleted) {
    return {
      isOverdue: false,
      isDueToday: false,
      isPaused,
      isCompleted: true,
      dueDateStr,
      badgeLabel: "已完成",
    };
  }

  if (isPaused) {
    return {
      isOverdue: false,
      isDueToday: false,
      isPaused: true,
      isCompleted: false,
      dueDateStr,
      badgeLabel: "需追蹤",
    };
  }

  if (!dueDateStr) {
    return {
      isOverdue: false,
      isDueToday: false,
      isPaused: false,
      isCompleted: false,
      dueDateStr: "",
      badgeLabel: null,
    };
  }

  if (dueDateStr < todayStr) {
    return {
      isOverdue: true,
      isDueToday: false,
      isPaused: false,
      isCompleted: false,
      dueDateStr,
      badgeLabel: "已逾期",
    };
  }

  if (dueDateStr === todayStr) {
    return {
      isOverdue: false,
      isDueToday: true,
      isPaused: false,
      isCompleted: false,
      dueDateStr,
      badgeLabel: "已到期",
    };
  }

  return {
    isOverdue: false,
    isDueToday: false,
    isPaused: false,
    isCompleted: false,
    dueDateStr,
    badgeLabel: null,
  };
}

/** 里程碑子進度代碼 → 專案大階段對應 */
export const STAGE_CODE_TO_PROJECT_STAGE: Record<MilestoneStageCode, string> = {
  // ① 案件開發
  "1-1": "DEVELOP", "1-2": "DEVELOP",
  // ② 現況及需求確認
  "2-1": "REQUIREMENT", "2-2": "REQUIREMENT", "2-3": "REQUIREMENT", "2-4": "REQUIREMENT", "2-5": "REQUIREMENT",
  // ③ 設計提案/報價/簽約
  "3-1": "PROPOSAL", "3-2": "PROPOSAL", "3-3": "PROPOSAL", "3-4": "PROPOSAL", "3-5": "PROPOSAL", "3-6": "PROPOSAL",
  // ④ 生產前確認/拆單
  "4-1": "PRE_PROD", "4-2": "PRE_PROD", "4-3": "PRE_PROD", "4-4": "PRE_PROD", "4-5": "PRE_PROD",
  // ⑤ 生產及派送
  "5-1": "PROD_SHIP", "5-2": "PROD_SHIP", "5-3": "PROD_SHIP",
  // ⑥ 安裝及驗收
  "6-1": "INSTALL", "6-2": "INSTALL", "6-3": "INSTALL", "6-4": "INSTALL", "6-5": "INSTALL",
  // ⑦ 立帳/結案
  "7-1": "CLOSURE", "7-2": "CLOSURE", "7-3": "CLOSURE", "7-4": "CLOSURE",
  // 額外階段
  "X-1": "WRAP_UP", "X-2": "LOST",
};

/**
 * 分區取得前段（1-1 ~ 5-2）與安裝段（6-1 ~ 6-5）第一個未完成且無預定完成日之里程碑順序。
 * - 前段與安裝段各自獨立，前段「需追蹤」不會遮蔽手動設定之進場日與 6-2~6-5 排程
 * - 第七階段【立帳/結案】採全手動設定日期與推進，不觸發也不受暫停傳播影響
 */
export interface PausedScheduleOrders {
  preInstallPausedOrder: number | null;
  installPausedOrder: number | null;
}

export function getPausedScheduleOrders(
  milestones: Array<{
    stageCode: string;
    stageOrder?: number;
    status: string;
    plannedDueDate?: string | null;
  }>,
): PausedScheduleOrders {
  const sorted = [...milestones].sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0));
  const preInstallPaused = sorted.find(
    (m) =>
      m.status !== "COMPLETED" &&
      !m.plannedDueDate &&
      !isClosureStageCode(m.stageCode) &&
      !isInstallStageCode(m.stageCode),
  );
  const installPaused = sorted.find(
    (m) =>
      m.status !== "COMPLETED" &&
      !m.plannedDueDate &&
      isInstallStageCode(m.stageCode),
  );
  return {
    preInstallPausedOrder: preInstallPaused?.stageOrder ?? null,
    installPausedOrder: installPaused?.stageOrder ?? null,
  };
}

/**
 * 取得第一個「納入時程連動」且未完成又缺乏預定完成日之里程碑順序。
 * 第七階段【立帳/結案】採全手動設定日期與推進，不觸發後續暫停傳播。
 */
export function getPausedScheduleOrder(
  milestones: Array<{
    stageCode: string;
    stageOrder?: number;
    status: string;
    plannedDueDate?: string | null;
  }>,
): number | null {
  const { preInstallPausedOrder, installPausedOrder } = getPausedScheduleOrders(milestones);
  if (preInstallPausedOrder !== null && installPausedOrder !== null) {
    return Math.min(preInstallPausedOrder, installPausedOrder);
  }
  return preInstallPausedOrder ?? installPausedOrder ?? null;
}

/** 判斷單一里程碑是否因同區前置項目處於「需追蹤」而需暫停計算（立帳/結案項目一律不連坐暫停） */
export function computeIsSubsequentToPaused(
  milestone: {
    stageCode: string;
    stageOrder?: number;
    status: string;
    isSubsequentToPaused?: boolean;
  },
  pausedOrderOrOrders: number | null | PausedScheduleOrders,
): boolean {
  if (isClosureStageCode(milestone.stageCode)) return false;
  if (typeof milestone.isSubsequentToPaused === "boolean") {
    return milestone.isSubsequentToPaused;
  }
  if (milestone.status === "COMPLETED") return false;

  const order = milestone.stageOrder ?? 0;
  if (pausedOrderOrOrders !== null && typeof pausedOrderOrOrders === "object") {
    const zonePausedOrder = isInstallStageCode(milestone.stageCode)
      ? pausedOrderOrOrders.installPausedOrder
      : pausedOrderOrOrders.preInstallPausedOrder;
    return Boolean(zonePausedOrder !== null && order > zonePausedOrder);
  }

  return Boolean(pausedOrderOrOrders !== null && order > pausedOrderOrOrders);
}

export const ScheduleEngine = {
  /**
   * 計算特定里程碑的時程燈號
   * 🔴 逾期卡關  🟡 3天內到期  🟢 正常進行中  ⚪ 已完成/未啟動/需追蹤/未排定
   */
  getTrafficLight(
    milestone: ProjectMilestoneItem,
    currentDate: Date = new Date(),
    isProjectLost: boolean = false,
  ): TrafficLightStatus {
    if (isProjectLost || milestone.stageCode === "X-2") {
      return { color: "GRAY", label: milestone.status === "COMPLETED" ? "已完成" : "流標", daysDiff: 0 };
    }

    if (milestone.status === "COMPLETED") {
      return { color: "GRAY", label: "已完成", daysDiff: 0 };
    }

    if (milestone.isSubsequentToPaused) {
      return { color: "GRAY", label: "未排定時程", daysDiff: 999 };
    }

    if (!milestone.plannedDueDate) {
      return { color: "GRAY", label: "需追蹤", daysDiff: 999 };
    }

    const [dy, dm, dd] = milestone.plannedDueDate.slice(0, 10).split("-").map(Number);
    const dueDateUtc = Date.UTC(dy, dm - 1, dd);
    const [cy, cm, cd] = getTaiwanDateString(currentDate).split("-").map(Number);
    const curDateUtc = Date.UTC(cy, cm - 1, cd);
    const daysDiff = Math.round((dueDateUtc - curDateUtc) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      return { color: "RED", label: `逾 ${Math.abs(daysDiff)} 天`, daysDiff };
    }

    if (daysDiff === 0) {
      return { color: "RED", label: "已到期", daysDiff: 0 };
    }

    if (daysDiff <= 3) {
      return { color: "YELLOW", label: `剩 ${daysDiff} 天`, daysDiff };
    }

    return { color: "GREEN", label: `剩 ${daysDiff} 天`, daysDiff };
  },

  /**
   * 判定專案是否已立帳完成 (BILLED / CLOSED 階段，或 7-2 立帳里程碑已完成)
   */
  isProjectClosed(
    project: { currentStage: string },
    milestones: ProjectMilestoneItem[] = [],
  ): boolean {
    if (project.currentStage === "BILLED" || project.currentStage === "CLOSED" || project.currentStage === "DONE") return true;
    return milestones.some((m) => m.stageCode === "7-2" && m.status === "COMPLETED");
  },

  /**
   * 評估專案是否逾期卡關：
   * 1. 已流標 (LOST) 或已立帳完成 (BILLED / CLOSED / 7-2 COMPLETED) 視為非逾期 (false)
   * 2. 活躍里程碑 (OVERDUE 或 IN_PROGRESS) 之時程燈號若為 RED 或狀態為 OVERDUE 則判定為逾期 (true)
   * 3. 否則若活躍里程碑存在且未逾期則為 false；無活躍里程碑時回退專案既有 isDelayed
   */
  isProjectDelayed(
    project: { currentStage: string; isDelayed?: boolean },
    milestones: ProjectMilestoneItem[] = [],
    currentDate: Date = new Date(),
  ): boolean {
    if (project.currentStage === "LOST" || ScheduleEngine.isProjectClosed(project, milestones)) {
      return false;
    }

    const activeM = milestones.find((m) => m.status === "OVERDUE" || m.status === "IN_PROGRESS");
    if (activeM) {
      const tl = ScheduleEngine.getTrafficLight(activeM, currentDate);
      return tl.color === "RED" || activeM.status === "OVERDUE";
    }
    return Boolean(project.isDelayed);
  },

  /**
   * 重新評估整份里程碑清單，標記逾期項目與需追蹤後續項目
   */
  evaluateMilestones(
    milestones: ProjectMilestoneItem[],
    currentDate: Date = new Date(),
    isProjectLost: boolean = false,
  ): {
    milestones: ProjectMilestoneItem[];
    isDelayed: boolean;
  } {
    const lost = isProjectLost || milestones.some((m) => m.stageCode === "X-2" && m.status === "COMPLETED");

    if (lost) {
      // 流標案件：各進度不再顯示逾期，時程狀態亦不標示逾期
      const sanitized = milestones.map((m) => {
        if (m.status === "OVERDUE") {
          return { ...m, status: "IN_PROGRESS" as const, isSubsequentToPaused: false };
        }
        return { ...m, isSubsequentToPaused: false };
      });
      return { milestones: sanitized, isDelayed: false };
    }

    // 尋找前段與安裝段第一個未完成且無預定完成日項目（第七階段採全手動，不參與暫停傳播）
    const pausedOrders = getPausedScheduleOrders(milestones);

    let hasOverdue = false;
    const curDateOnly = getTaiwanDateString(currentDate);

    const evaluated = milestones.map((m) => {
      if (m.status === "COMPLETED") {
        return { ...m, isSubsequentToPaused: false };
      }

      const isSubsequentToPaused = computeIsSubsequentToPaused(
        { stageCode: m.stageCode, stageOrder: m.stageOrder, status: m.status },
        pausedOrders,
      );

      // 若為需追蹤進度的後續項目：不計算逾期，並標記 isSubsequentToPaused = true
      if (isSubsequentToPaused) {
        if (m.status === "OVERDUE") {
          return { ...m, status: "IN_PROGRESS" as const, isSubsequentToPaused: true };
        }
        return { ...m, isSubsequentToPaused: true };
      }

      if (m.plannedDueDate && m.status !== "PENDING") {
        const dueDateOnly = m.plannedDueDate.slice(0, 10);
        if (dueDateOnly < curDateOnly) {
          hasOverdue = true;
          return { ...m, status: "OVERDUE" as const, isSubsequentToPaused: false };
        } else if (m.status === "OVERDUE") {
          return { ...m, status: "IN_PROGRESS" as const, isSubsequentToPaused: false };
        }
      } else if (!m.plannedDueDate && m.status === "OVERDUE") {
        return { ...m, status: "IN_PROGRESS" as const, isSubsequentToPaused: false };
      }

      return { ...m, isSubsequentToPaused: false };
    });

    return { milestones: evaluated, isDelayed: hasOverdue };
  },

  /**
   * 依 6-1 進場安裝日期推算（或清空）6-2 ~ 6-5 未完成里程碑之預定完成日
   */
  applyInstallDateToMilestones(
    milestones: ProjectMilestoneItem[],
    installationDate: string | null,
    defaultDays: Record<string, number> = MILESTONE_DEFAULT_DAYS,
  ): ProjectMilestoneItem[] {
    const sorted = [...milestones].sort((a, b) => a.stageOrder - b.stageOrder);
    const installIndex = sorted.findIndex((m) => m.stageCode === "6-1");
    if (installIndex === -1) return sorted;

    const normalizedDate = installationDate ? installationDate.slice(0, 10) : null;
    let cursor = normalizedDate;

    const updatedById = new Map<string, string | null>();
    for (let i = installIndex; i < sorted.length; i++) {
      const m = sorted[i];
      if (!isInstallStageCode(m.stageCode)) continue;
      if (m.stageCode === "6-1") {
        if (m.status !== "COMPLETED") {
          updatedById.set(m.id, normalizedDate);
        } else if (m.plannedDueDate) {
          cursor = m.plannedDueDate.slice(0, 10);
        }
        continue;
      }
      if (m.status === "COMPLETED") continue;
      if (!cursor) {
        updatedById.set(m.id, null);
      } else {
        const days = Number(defaultDays[m.stageCode]) || MILESTONE_DEFAULT_DAYS[m.stageCode] || 3;
        cursor = addDaysToDateStr(cursor, days);
        updatedById.set(m.id, cursor);
      }
    }

    return sorted.map((m) =>
      updatedById.has(m.id) ? { ...m, plannedDueDate: updatedById.get(m.id) ?? null } : m,
    );
  },

  /**
   * 快速推進里程碑：完成（或略過）目標並自動啟動下一進度
   */
  advanceMilestone(
    milestones: ProjectMilestoneItem[],
    targetMilestoneId: string,
    options?: {
      notes?: string;
      attachments?: string;
      completedDate?: string;
      installationDate?: string;
      skip?: boolean;
      defaultDays?: Record<string, number>;
      currentDate?: Date;
    }
  ): {
    updatedMilestones: ProjectMilestoneItem[];
    newCurrentStage: string;
    isProjectDelayed: boolean;
  } {
    let sorted = [...milestones].sort((a, b) => a.stageOrder - b.stageOrder);
    const targetIndex = sorted.findIndex((m) => m.id === targetMilestoneId);

    if (
      targetIndex === -1 ||
      !["IN_PROGRESS", "OVERDUE"].includes(sorted[targetIndex].status) ||
      sorted.slice(0, targetIndex).some((milestone) => milestone.status !== "COMPLETED")
    ) {
      throw new ConflictError("只能完成目前進行中的里程碑");
    }

    const targetMilestone = sorted[targetIndex];
    const isSkip = Boolean(options?.skip);
    if (isSkip && !isJumpableStageCode(targetMilestone.stageCode)) {
      throw new BadRequestError("立帳/結案與額外階段不可略過");
    }

    const isDispatch = targetMilestone.stageCode === "4-3" || targetMilestone.stageCode === "5-3";
    const todayStr = getTaiwanDateString(options?.currentDate ?? new Date());
    const nowDate = (options?.completedDate || todayStr).slice(0, 10);
    const defaultDays = options?.defaultDays ?? MILESTONE_DEFAULT_DAYS;

    let installationDate = options?.installationDate?.trim().slice(0, 10);
    if (isDispatch && !isSkip) {
      if (!installationDate && options?.completedDate && options.completedDate.trim()) {
        installationDate = options.completedDate.trim().slice(0, 10);
      }
      if (!installationDate) {
        throw new BadRequestError("請設定進場日期");
      }
    }

    const trimmedNotes = options?.notes?.trim();
    const skipNote = trimmedNotes
      ? trimmedNotes.startsWith("【已略過")
        ? trimmedNotes
        : `【已略過】${trimmedNotes}`
      : "【已略過】";

    // 1. 標記當前進度為已完成（略過時實際完成日留空，並於備註標示已略過）
    sorted[targetIndex] = {
      ...sorted[targetIndex],
      status: "COMPLETED",
      actualDueDate: isSkip
        ? null
        : isDispatch
          ? (options?.completedDate && options.completedDate !== installationDate ? options.completedDate.slice(0, 10) : todayStr)
          : nowDate,
      notes: isSkip ? skipNote : (options?.notes || sorted[targetIndex].notes),
      attachments: options?.attachments || sorted[targetIndex].attachments,
    };

    // 2. 若為正常完成派工項目，同步設定「進場安裝」(6-1) 並推算 6-2 ~ 6-5
    if (isDispatch && !isSkip && installationDate) {
      sorted = this.applyInstallDateToMilestones(sorted, installationDate, defaultDays);
    }

    let newCurrentStage = STAGE_CODE_TO_PROJECT_STAGE[sorted[targetIndex].stageCode] || "CONTACT";

    // 3. 啟動下一進度
    const nextIndex = targetIndex + 1;
    if (nextIndex < sorted.length) {
      sorted[nextIndex] = { ...sorted[nextIndex], status: "IN_PROGRESS" };
      newCurrentStage = STAGE_CODE_TO_PROJECT_STAGE[sorted[nextIndex].stageCode] || newCurrentStage;
    } else {
      newCurrentStage = "DONE";
    }

    // 4. 若為單項略過，將同分區後續未完成進度以今日為基準重新順延接上（不觸碰 6-1 與立帳階段）
    if (isSkip && nextIndex < sorted.length) {
      const skippedIsPreInstall = isPreInstallStageCode(targetMilestone.stageCode);
      const skippedIsInstallSub = isInstallStageCode(targetMilestone.stageCode) && targetMilestone.stageCode !== "6-1";
      const m61 = sorted.find((m) => m.stageCode === "6-1");
      let cursor = todayStr;

      for (let i = nextIndex; i < sorted.length; i++) {
        const m = sorted[i];
        if (m.status === "COMPLETED") continue;
        if (skippedIsPreInstall && isPreInstallStageCode(m.stageCode)) {
          const days = Number(defaultDays[m.stageCode]) || MILESTONE_DEFAULT_DAYS[m.stageCode] || 3;
          cursor = addDaysToDateStr(cursor, days);
          sorted[i] = { ...m, plannedDueDate: cursor };
        } else if (skippedIsInstallSub && isInstallStageCode(m.stageCode) && m.stageCode !== "6-1" && m61?.plannedDueDate) {
          const days = Number(defaultDays[m.stageCode]) || MILESTONE_DEFAULT_DAYS[m.stageCode] || 3;
          cursor = addDaysToDateStr(cursor, days);
          sorted[i] = { ...m, plannedDueDate: cursor };
        }
      }
    }

    const { milestones: evaluatedMilestones, isDelayed } = this.evaluateMilestones(sorted, options?.currentDate);

    return { updatedMilestones: evaluatedMilestones, newCurrentStage, isProjectDelayed: isDelayed };
  },

  /**
   * 一鍵跳轉至特定進度（上限 6-5 提交成果驗收）：
   * - 中間跨過之項目（含未審核關卡與 4-3 派工）一律標記為已完成（略過時實際完成日留空）
   * - 進場日 (6-1) 與立帳日 (7-2) 不受前段重算影響，原本空白維持空白、有填保留原日期
   */
  jumpToMilestone(
    milestones: ProjectMilestoneItem[],
    targetMilestoneId: string,
    options?: {
      skip?: boolean;
      completedDate?: string;
      notes?: string;
      defaultDays?: Record<string, number>;
      currentDate?: Date;
    },
  ): {
    updatedMilestones: ProjectMilestoneItem[];
    newCurrentStage: string;
    isProjectDelayed: boolean;
    jumpedCount: number;
  } {
    const sorted = [...milestones].sort((a, b) => a.stageOrder - b.stageOrder);
    const targetIndex = sorted.findIndex((m) => m.id === targetMilestoneId);
    if (targetIndex === -1) {
      throw new ConflictError("找不到目標里程碑");
    }

    const targetMilestone = sorted[targetIndex];
    if (!isJumpableStageCode(targetMilestone.stageCode)) {
      throw new BadRequestError("最多只能跳轉到「6-5 提交成果驗收」");
    }
    if (targetMilestone.status !== "PENDING") {
      throw new ConflictError("只能跳轉至尚未開始的後續進度");
    }
    const firstIncompleteIndex = sorted.findIndex((m) => m.status !== "COMPLETED");
    if (firstIncompleteIndex === -1 || targetIndex <= firstIncompleteIndex) {
      throw new ConflictError("目標進度必須排在目前進行中進度之後");
    }

    const isSkip = options?.skip !== false;
    const currentDate = options?.currentDate ?? new Date();
    const todayStr = getTaiwanDateString(currentDate);
    const nowDate = (options?.completedDate || todayStr).slice(0, 10);
    const defaultDays = options?.defaultDays ?? MILESTONE_DEFAULT_DAYS;
    const trimmedNotes = options?.notes?.trim();

    let jumpedCount = 0;
    for (let i = 0; i < targetIndex; i++) {
      const m = sorted[i];
      if (m.status === "COMPLETED") continue;
      jumpedCount++;
      const note = isSkip
        ? (trimmedNotes ? `【已略過：一鍵跳轉】${trimmedNotes}` : "【已略過：一鍵跳轉】")
        : (trimmedNotes ? `【一鍵跳轉完成】${trimmedNotes}` : "【一鍵跳轉完成】");
      sorted[i] = {
        ...m,
        status: "COMPLETED",
        actualDueDate: isSkip ? null : nowDate,
        notes: note,
      };
    }

    // 啟動目標進度
    sorted[targetIndex] = {
      ...sorted[targetIndex],
      status: "IN_PROGRESS",
      actualDueDate: null,
    };

    // 以今日為基準重算目標項目與後續同區未完成項目預定完成日
    const targetIsPreInstall = isPreInstallStageCode(targetMilestone.stageCode);
    const m61 = sorted.find((m) => m.stageCode === "6-1");
    let cursor = todayStr;

    for (let i = targetIndex; i < sorted.length; i++) {
      const m = sorted[i];
      if (m.status === "COMPLETED") continue;

      if (targetIsPreInstall && isPreInstallStageCode(m.stageCode)) {
        const days = Number(defaultDays[m.stageCode]) || MILESTONE_DEFAULT_DAYS[m.stageCode] || 3;
        cursor = addDaysToDateStr(cursor, days);
        sorted[i] = { ...m, plannedDueDate: cursor };
      } else if (!targetIsPreInstall && isInstallStageCode(m.stageCode) && m.stageCode !== "6-1") {
        // 目標在 6-2 ~ 6-5：若已有手動進場日則以今日往後推算；若無進場日則維持空白（需追蹤）
        if (m61?.plannedDueDate) {
          const days = Number(defaultDays[m.stageCode]) || MILESTONE_DEFAULT_DAYS[m.stageCode] || 3;
          cursor = addDaysToDateStr(cursor, days);
          sorted[i] = { ...m, plannedDueDate: cursor };
        } else {
          sorted[i] = { ...m, plannedDueDate: null };
        }
      }
    }

    const newCurrentStage = STAGE_CODE_TO_PROJECT_STAGE[targetMilestone.stageCode] || "DEVELOP";
    const { milestones: evaluatedMilestones, isDelayed } = this.evaluateMilestones(sorted, currentDate);

    return {
      updatedMilestones: evaluatedMilestones,
      newCurrentStage,
      isProjectDelayed: isDelayed,
      jumpedCount,
    };
  },
};
