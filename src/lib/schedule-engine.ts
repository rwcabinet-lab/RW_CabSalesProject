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
  "1-1": "CONTACT", "1-2": "CONTACT", "1-3": "CONTACT", "1-4": "CONTACT", "1-5": "CONTACT",
  "2-1": "DESIGN",  "2-2": "DESIGN",  "2-3": "DESIGN",  "2-4": "DESIGN",
  "3-1": "PRODUCTION", "3-2": "PRODUCTION", "3-3": "PRODUCTION",
  "3-4": "CLOSED",  "3-5": "BILLED",
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

    if (daysDiff < 0 || milestone.status === "OVERDUE") {
      return { color: "RED", label: `已逾期 ${Math.abs(daysDiff)} 天`, daysDiff };
    }

    if (daysDiff <= 3) {
      return { color: "YELLOW", label: `${daysDiff} 天內到期`, daysDiff };
    }

    return { color: "GREEN", label: `正常 (剩餘 ${daysDiff} 天)`, daysDiff };
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

    if (targetIndex === -1) {
      return { updatedMilestones: milestones, newCurrentStage: "CONTACT", isProjectDelayed: false };
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
