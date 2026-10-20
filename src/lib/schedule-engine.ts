import {
  ProjectMilestoneItem,
  MilestoneStageCode,
  MILESTONE_STAGE_LABELS,
  STAGE_CODE_TO_PHASE,
} from "./mock-data";

export interface TrafficLightStatus {
  color: "RED" | "YELLOW" | "GREEN" | "GRAY";
  label: string;
  daysDiff: number;
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
  getTrafficLight(milestone: ProjectMilestoneItem, currentDate: Date = new Date()): TrafficLightStatus {
    if (milestone.status === "COMPLETED") {
      return { color: "GRAY", label: "已完成", daysDiff: 0 };
    }

    if (!milestone.plannedDueDate) {
      return { color: "GRAY", label: "未排定時程", daysDiff: 999 };
    }

    const dueDate = new Date(milestone.plannedDueDate);
    const diffTime = dueDate.getTime() - currentDate.getTime();
    const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      return { color: "RED", label: `逾期 ${Math.abs(daysDiff)} 天`, daysDiff };
    }

    if (daysDiff === 0 || milestone.status === "OVERDUE") {
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
  evaluateMilestones(milestones: ProjectMilestoneItem[], currentDate: Date = new Date()): {
    milestones: ProjectMilestoneItem[];
    isDelayed: boolean;
  } {
    let hasOverdue = false;

    const evaluated = milestones.map((m) => {
      if (m.status === "COMPLETED") return m;

      if (m.plannedDueDate && m.status !== "PENDING") {
        const due = new Date(m.plannedDueDate);
        if (due.getTime() < currentDate.getTime()) {
          hasOverdue = true;
          return { ...m, status: "OVERDUE" as const };
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
    const nowDate = (options?.completedDate || new Date().toISOString()).split("T")[0];
    const sorted = [...milestones].sort((a, b) => a.stageOrder - b.stageOrder);
    const targetIndex = sorted.findIndex((m) => m.id === targetMilestoneId);

    if (
      targetIndex === -1 ||
      !["IN_PROGRESS", "OVERDUE"].includes(sorted[targetIndex].status) ||
      sorted.slice(0, targetIndex).some((milestone) => milestone.status !== "COMPLETED")
    ) {
      throw new Error("只能完成目前進行中的里程碑");
    }

    const target = sorted[targetIndex];

    // 若正規進度實際完成日早於預定完成日，計算提前天數
    const isRegularStage = !["X-1", "X-2"].includes(target.stageCode);
    let daysSaved = 0;
    if (isRegularStage && target.plannedDueDate) {
      const [py, pm, pd] = target.plannedDueDate.slice(0, 10).split("-").map(Number);
      const [ay, am, ad] = nowDate.slice(0, 10).split("-").map(Number);
      const plannedTime = Date.UTC(py, pm - 1, pd);
      const actualTime = Date.UTC(ay, am - 1, ad);
      const diffDays = Math.round((plannedTime - actualTime) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        daysSaved = diffDays;
      }
    }

    // 1. 標記當前進度為已完成
    sorted[targetIndex] = {
      ...sorted[targetIndex],
      status: "COMPLETED",
      actualDueDate: nowDate,
      notes: options?.notes || sorted[targetIndex].notes,
      attachments: options?.attachments || sorted[targetIndex].attachments,
    };

    // 若有提前完成天數，將後續尚未完成之正規項目預定完成日自動提前
    if (daysSaved > 0) {
      for (let i = targetIndex + 1; i < sorted.length; i++) {
        const item = sorted[i];
        if (item.status !== "COMPLETED" && !["X-1", "X-2"].includes(item.stageCode) && item.plannedDueDate) {
          const [iy, im, id] = item.plannedDueDate.slice(0, 10).split("-").map(Number);
          const nextPlanned = new Date(Date.UTC(iy, im - 1, id));
          nextPlanned.setUTCDate(nextPlanned.getUTCDate() - daysSaved);
          sorted[i] = {
            ...item,
            plannedDueDate: nextPlanned.toISOString().slice(0, 10),
          };
        }
      }
    }

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
