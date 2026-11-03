import { describe, it, expect } from "vitest";
import { getTaiwanDateString } from "@/lib/schedule-engine";

describe("Milestone Cascade Shift Logic (里程碑後續日期同步平移邏輯)", () => {
  function computeShiftedDates(
    milestones: { id: string; stageOrder: number; stageCode: string; status: string; plannedDueDate: string | null }[],
    targetMilestoneId: string,
    newDueDate: string,
    cascadeShift: boolean
  ) {
    const target = milestones.find((m) => m.id === targetMilestoneId);
    if (!target) return milestones;

    const oldDueStr = target.plannedDueDate;
    const newDueStr = newDueDate;

    let diffDays = 0;
    if (cascadeShift && oldDueStr && newDueStr && oldDueStr !== newDueStr) {
      const [oy, om, od] = oldDueStr.split("-").map(Number);
      const [ny, nm, nd] = newDueStr.split("-").map(Number);
      diffDays = Math.round((Date.UTC(ny, nm - 1, nd) - Date.UTC(oy, om - 1, od)) / (1000 * 60 * 60 * 24));
    }

    if (diffDays === 0) {
      return milestones.map((m) => (m.id === targetMilestoneId ? { ...m, plannedDueDate: newDueStr } : m));
    }

    const todayStr = getTaiwanDateString();
    const currentOrder = target.stageOrder;

    return milestones.map((m) => {
      if (m.id === targetMilestoneId) {
        return { ...m, plannedDueDate: newDueStr };
      }
      if (
        m.stageOrder > currentOrder &&
        m.status !== "COMPLETED" &&
        !["X-1", "X-2"].includes(m.stageCode) &&
        m.plannedDueDate
      ) {
        const [my, mm, md] = m.plannedDueDate.slice(0, 10).split("-").map(Number);
        const nextPlanned = new Date(Date.UTC(my, mm - 1, md));
        nextPlanned.setUTCDate(nextPlanned.getUTCDate() + diffDays);
        const nextDateStr = nextPlanned.toISOString().slice(0, 10);
        const finalDateStr = diffDays < 0 && nextDateStr < todayStr ? todayStr : nextDateStr;
        return { ...m, plannedDueDate: finalDateStr };
      }
      return m;
    });
  }

  const sampleMilestones = [
    { id: "m1", stageOrder: 1, stageCode: "1-1", status: "COMPLETED", plannedDueDate: "2026-11-01" },
    { id: "m2", stageOrder: 2, stageCode: "1-2", status: "IN_PROGRESS", plannedDueDate: "2026-11-05" },
    { id: "m3", stageOrder: 3, stageCode: "2-1", status: "PENDING", plannedDueDate: "2026-11-08" },
    { id: "m4", stageOrder: 4, stageCode: "2-2", status: "PENDING", plannedDueDate: "2026-11-12" },
    { id: "m5", stageOrder: 5, stageCode: "X-1", status: "PENDING", plannedDueDate: "2026-11-20" },
  ];

  it("未勾選同步平移時 (cascadeShift: false)，僅修改當前目標項目的預定完成日", () => {
    const result = computeShiftedDates(sampleMilestones, "m2", "2026-11-09", false);
    expect(result.find((m) => m.id === "m2")?.plannedDueDate).toBe("2026-11-09");
    expect(result.find((m) => m.id === "m3")?.plannedDueDate).toBe("2026-11-08"); // 維持不變
    expect(result.find((m) => m.id === "m4")?.plannedDueDate).toBe("2026-11-12"); // 維持不變
  });

  it("勾選同步平移時 (cascadeShift: true)，目標後續未完成進度依天數差同步平移", () => {
    // 2026-11-05 -> 2026-11-09 (+4天)
    const result = computeShiftedDates(sampleMilestones, "m2", "2026-11-09", true);
    expect(result.find((m) => m.id === "m1")?.plannedDueDate).toBe("2026-11-01"); // 已完成項目不平移
    expect(result.find((m) => m.id === "m2")?.plannedDueDate).toBe("2026-11-09"); // 當前項目 +4天
    expect(result.find((m) => m.id === "m3")?.plannedDueDate).toBe("2026-11-12"); // 2026-11-08 + 4天 = 2026-11-12
    expect(result.find((m) => m.id === "m4")?.plannedDueDate).toBe("2026-11-16"); // 2026-11-12 + 4天 = 2026-11-16
    expect(result.find((m) => m.id === "m5")?.plannedDueDate).toBe("2026-11-20"); // X-1 額外階段不參與平移
  });

  it("逆向平移（提早完成日）時，日期自動截斷不早於今日", () => {
    const today = getTaiwanDateString();
    // 調整 m2 由 2026-11-05 提前 30 天
    const result = computeShiftedDates(sampleMilestones, "m2", "2026-10-06", true);
    const m3 = result.find((m) => m.id === "m3");
    // m3 平移後不應早於今日
    expect(m3?.plannedDueDate! >= today).toBe(true);
  });
});
