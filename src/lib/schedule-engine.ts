import {
  ProjectMilestoneItem,
  MilestoneStageCode,
  MILESTONE_STAGE_LABELS,
  STAGE_CODE_TO_PHASE,
} from "./constants";

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

/** 里程碑子進度代碼 → 專案大階段對應 */
export const STAGE_CODE_TO_PROJECT_STAGE: Record<MilestoneStageCode, string> = {
  // ① 案件開發
  "1-1": "DEVELOP", "1-2": "DEVELOP",
  // ② 現況及需求確認
  "2-1": "REQUIREMENT", "2-2": "REQUIREMENT", "2-3": "REQUIREMENT", "2-4": "REQUIREMENT", "2-5": "REQUIREMENT",
  // ③ 設計提案/報價/簽約
  "3-1": "PROPOSAL", "3-2": "PROPOSAL", "3-3": "PROPOSAL", "3-4": "PROPOSAL", "3-5": "PROPOSAL",
  // ④ 生產前確認/拆單
  "4-1": "PRE_PROD", "4-2": "PRE_PROD", "4-3": "PRE_PROD", "4-4": "PRE_PROD",
  // ⑤ 生產及派送
  "5-1": "PROD_SHIP", "5-2": "PROD_SHIP", "5-3": "PROD_SHIP",
  // ⑥ 安裝及驗收
  "6-1": "INSTALL", "6-2": "INSTALL", "6-3": "INSTALL", "6-4": "INSTALL", "6-5": "INSTALL",
  // ⑦ 結案/售後
  "7-1": "CLOSURE", "7-2": "CLOSURE", "7-3": "CLOSURE",
  // 額外階段
  "X-1": "WRAP_UP", "X-2": "LOST",
};

export const ScheduleEngine = {
  /**
   * 計算特定里程碑的時程燈號
   * 🔴 逾期卡關  🟡 3天內到期  🟢 正常進行中  ⚪ 已完成/未啟動
   */
  getTrafficLight(
    milestone: ProjectMilestoneItem,
    currentDate: Date = new Date(),
    isProjectLost: boolean = false,
  ): TrafficLightStatus {
    if (isProjectLost || milestone.stageCode === "X-2") {
      return { color: "GRAY", label: milestone.status === "COMPLETED" ? "已完成" : "已流標", daysDiff: 0 };
    }

    if (milestone.status === "COMPLETED") {
      return { color: "GRAY", label: "已完成", daysDiff: 0 };
    }

    if (!milestone.plannedDueDate) {
      return { color: "GRAY", label: "未排定時程", daysDiff: 999 };
    }

    const [dy, dm, dd] = milestone.plannedDueDate.slice(0, 10).split("-").map(Number);
    const dueDateUtc = Date.UTC(dy, dm - 1, dd);
    const [cy, cm, cd] = getTaiwanDateString(currentDate).split("-").map(Number);
    const curDateUtc = Date.UTC(cy, cm - 1, cd);
    const daysDiff = Math.round((dueDateUtc - curDateUtc) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      return { color: "RED", label: `逾期 ${Math.abs(daysDiff)} 天`, daysDiff };
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
   * 重新評估整份里程碑清單，標記逾期項目
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
          return { ...m, status: "IN_PROGRESS" as const };
        }
        return m;
      });
      return { milestones: sanitized, isDelayed: false };
    }

    let hasOverdue = false;
    const curDateOnly = getTaiwanDateString(currentDate);

    const evaluated = milestones.map((m) => {
      if (m.status === "COMPLETED") return m;

      if (m.plannedDueDate && m.status !== "PENDING") {
        const dueDateOnly = m.plannedDueDate.slice(0, 10);
        if (dueDateOnly < curDateOnly) {
          hasOverdue = true;
          return { ...m, status: "OVERDUE" as const };
        } else if (m.status === "OVERDUE") {
          return { ...m, status: "IN_PROGRESS" as const };
        }
      }

      return m;
    });

    return { milestones: evaluated, isDelayed: hasOverdue };
  },

  /**
   * 快速推進里程碑：完成目標並自動啟動下一進度
   */
  advanceMilestone(
    milestones: ProjectMilestoneItem[],
    targetMilestoneId: string,
    options?: { notes?: string; attachments?: string; completedDate?: string }
  ): {
    updatedMilestones: ProjectMilestoneItem[];
    newCurrentStage: string;
    isProjectDelayed: boolean;
  } {
    const nowDate = (options?.completedDate || getTaiwanDateString(new Date())).slice(0, 10);
    const sorted = [...milestones].sort((a, b) => a.stageOrder - b.stageOrder);
    const targetIndex = sorted.findIndex((m) => m.id === targetMilestoneId);

    if (
      targetIndex === -1 ||
      !["IN_PROGRESS", "OVERDUE"].includes(sorted[targetIndex].status) ||
      sorted.slice(0, targetIndex).some((milestone) => milestone.status !== "COMPLETED")
    ) {
      throw new Error("只能完成目前進行中的里程碑");
    }

    // 1. 標記當前進度為已完成
    sorted[targetIndex] = {
      ...sorted[targetIndex],
      status: "COMPLETED",
      actualDueDate: nowDate,
      notes: options?.notes || sorted[targetIndex].notes,
      attachments: options?.attachments || sorted[targetIndex].attachments,
    };

    let newCurrentStage = STAGE_CODE_TO_PROJECT_STAGE[sorted[targetIndex].stageCode] || "CONTACT";

    // 2. 啟動下一進度
    const nextIndex = targetIndex + 1;
    if (nextIndex < sorted.length) {
      sorted[nextIndex] = { ...sorted[nextIndex], status: "IN_PROGRESS" };
      newCurrentStage = STAGE_CODE_TO_PROJECT_STAGE[sorted[nextIndex].stageCode] || newCurrentStage;
    } else {
      newCurrentStage = "DONE";
    }

    const { milestones: evaluatedMilestones, isDelayed } = this.evaluateMilestones(sorted);

    return { updatedMilestones: evaluatedMilestones, newCurrentStage, isProjectDelayed: isDelayed };
  },
};
