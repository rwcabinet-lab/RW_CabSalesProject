import { describe, it, expect } from "vitest";
import {
  CUSTOMER_TYPE_START_STAGE_CODES,
  CUSTOMER_TYPE_LABELS,
  STANDARD_MILESTONE_STAGE_CODES,
  STAGE_CODE_TO_PHASE,
  MILESTONE_DEFAULT_DAYS,
  MilestoneStageCode,
} from "@/lib/constants";
import { STAGE_CODE_TO_PROJECT_STAGE, ScheduleEngine } from "@/lib/schedule-engine";
import { ConflictError } from "@/lib/errors";

describe("Customer Type Milestone Auto-Skip Logic (特定客戶類型起始進度跳轉邏輯)", () => {
  it("各客戶類型對應之起始進度正確設定", () => {
    expect(CUSTOMER_TYPE_START_STAGE_CODES["CABINET_FACTORY"]).toBe("4-4");
    expect(CUSTOMER_TYPE_START_STAGE_CODES["DESIGN_COMPANY"]).toBe("3-1");
    expect(CUSTOMER_TYPE_START_STAGE_CODES["DEALER_COMPANY"]).toBe("3-2");

    // 一般消費者與其他未設定跳轉類型，預設不應存在自訂對照（後續邏輯會 fallback 回 1-1）
    expect(CUSTOMER_TYPE_START_STAGE_CODES["INDIVIDUAL"]).toBeUndefined();
    expect(CUSTOMER_TYPE_START_STAGE_CODES["CONSTRUCTION"]).toBeUndefined();
    expect(CUSTOMER_TYPE_START_STAGE_CODES["LONGMEI_STORE"]).toBeUndefined();
    expect(CUSTOMER_TYPE_START_STAGE_CODES["PR"]).toBeUndefined();
  });

  function generateMilestoneRows(
    customerType: string,
    customStartCode?: string,
    today: Date = new Date("2026-11-04T00:00:00.000Z")
  ) {
    const allCodes = STANDARD_MILESTONE_STAGE_CODES;
    const targetStartCode =
      (customStartCode && allCodes.includes(customStartCode as MilestoneStageCode)
        ? (customStartCode as MilestoneStageCode)
        : undefined) ||
      CUSTOMER_TYPE_START_STAGE_CODES[customerType] ||
      "1-1";

    const targetIndex = allCodes.indexOf(targetStartCode);
    const validTargetIndex = targetIndex !== -1 ? targetIndex : 0;
    const finalStartCode = allCodes[validTargetIndex];
    const customerTypeLabel = CUSTOMER_TYPE_LABELS[customerType] || customerType;

    let cursorDate = new Date(today);

    const rows = allCodes.map((code, index) => {
      const isSkipped = index < validTargetIndex;
      const isActive = index === validTargetIndex;

      let plannedDueDate: Date;
      let actualDueDate: Date | null = null;
      let status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
      let notes: string | null = null;

      if (isSkipped) {
        status = "COMPLETED";
        plannedDueDate = new Date(today);
        actualDueDate = new Date(today);
        notes = `【系統自動略過：依客戶類型（${customerTypeLabel}）跳轉】`;
      } else if (isActive) {
        status = "IN_PROGRESS";
        const days = MILESTONE_DEFAULT_DAYS[code] || 3;
        plannedDueDate = new Date(today);
        plannedDueDate.setDate(plannedDueDate.getDate() + days);
        cursorDate = new Date(plannedDueDate);
      } else {
        status = "PENDING";
        const days = MILESTONE_DEFAULT_DAYS[code] || 3;
        plannedDueDate = new Date(cursorDate);
        plannedDueDate.setDate(plannedDueDate.getDate() + days);
        cursorDate = new Date(plannedDueDate);
      }

      return {
        stageCode: code,
        phase: STAGE_CODE_TO_PHASE[code] || "DEVELOP",
        stageOrder: index + 1,
        plannedDueDate,
        actualDueDate,
        status,
        notes,
      };
    });

    const initialProjectStage = STAGE_CODE_TO_PROJECT_STAGE[finalStartCode] || "DEVELOP";

    return { rows, finalStartCode, initialProjectStage };
  }

  it("一般消費者 (INDIVIDUAL) 建立案場時由 1-1 客源開發 開始", () => {
    const { rows, finalStartCode, initialProjectStage } = generateMilestoneRows("INDIVIDUAL");
    expect(finalStartCode).toBe("1-1");
    expect(initialProjectStage).toBe("DEVELOP");

    // 1-1 為 IN_PROGRESS，其餘為 PENDING
    expect(rows[0].stageCode).toBe("1-1");
    expect(rows[0].status).toBe("IN_PROGRESS");
    expect(rows[0].notes).toBeNull();
    expect(rows[1].status).toBe("PENDING");
    expect(rows.filter((r) => r.status === "COMPLETED")).toHaveLength(0);
  });

  it("工廠 (CABINET_FACTORY) 建立案場時自動批次略過前置項目，直接推進至 4-4", () => {
    const today = new Date("2026-11-04T00:00:00.000Z");
    const { rows, finalStartCode, initialProjectStage } = generateMilestoneRows("CABINET_FACTORY", undefined, today);

    expect(finalStartCode).toBe("4-4");
    expect(initialProjectStage).toBe("PRE_PROD");

    const targetIndex = rows.findIndex((r) => r.stageCode === "4-4");
    expect(targetIndex).toBeGreaterThan(0);

    // 前置項目 (1-1 至 4-3) 必須皆為 COMPLETED 且帶有自動略過備註
    const skippedRows = rows.slice(0, targetIndex);
    expect(skippedRows.length).toBe(targetIndex);
    for (const r of skippedRows) {
      expect(r.status).toBe("COMPLETED");
      expect(r.actualDueDate).toEqual(today);
      expect(r.notes).toContain("【系統自動略過：依客戶類型（工廠）跳轉】");
    }

    // 目標項目 (4-4) 必須為 IN_PROGRESS
    const targetRow = rows[targetIndex];
    expect(targetRow.status).toBe("IN_PROGRESS");
    // 預設 4-4 天數為 3 天，所以 plannedDueDate 應為 today + 3 天
    const expectedTargetDue = new Date(today);
    expectedTargetDue.setDate(expectedTargetDue.getDate() + 3);
    expect(targetRow.plannedDueDate).toEqual(expectedTargetDue);

    // 後續項目 (5-1 起) 必須為 PENDING，且從 4-4 的日期往後順延
    const nextRow = rows[targetIndex + 1];
    expect(nextRow.stageCode).toBe("5-1");
    expect(nextRow.status).toBe("PENDING");
    const expectedNextDue = new Date(expectedTargetDue);
    expectedNextDue.setDate(expectedNextDue.getDate() + (MILESTONE_DEFAULT_DAYS["5-1"] || 12));
    expect(nextRow.plannedDueDate).toEqual(expectedNextDue);
  });

  it("設計公司 (DESIGN_COMPANY) 建立案場時跳轉至 3-1 設計圖", () => {
    const { rows, finalStartCode, initialProjectStage } = generateMilestoneRows("DESIGN_COMPANY");
    expect(finalStartCode).toBe("3-1");
    expect(initialProjectStage).toBe("PROPOSAL");

    const m31 = rows.find((r) => r.stageCode === "3-1");
    expect(m31?.status).toBe("IN_PROGRESS");

    const m11 = rows.find((r) => r.stageCode === "1-1");
    expect(m11?.status).toBe("COMPLETED");
    expect(m11?.notes).toContain("【系統自動略過：依客戶類型（設計公司）跳轉】");
  });

  it("建立後直接推進里程碑 (advanceMilestone) 能無阻礙進行至下一階段", () => {
    const { rows } = generateMilestoneRows("CABINET_FACTORY");
    const mockList = rows.map((r, i) => ({
      id: `m-${i + 1}`,
      projectId: "proj-1",
      stageCode: r.stageCode as MilestoneStageCode,
      phase: r.phase as any,
      stageOrder: r.stageOrder,
      plannedDueDate: r.plannedDueDate.toISOString().slice(0, 10),
      actualDueDate: r.actualDueDate ? r.actualDueDate.toISOString().slice(0, 10) : null,
      status: r.status as any,
      priority: "MEDIUM" as const,
      assignedToId: "user-1",
      assignedToName: "王大明",
      notes: r.notes,
    }));

    const targetM = mockList.find((m) => m.stageCode === "4-4")!;
    // 推進 4-4
    const advanceResult = ScheduleEngine.advanceMilestone(mockList, targetM.id);

    // 4-4 應完成，5-1 應自動啟動成為 IN_PROGRESS
    const updated44 = advanceResult.updatedMilestones.find((m) => m.stageCode === "4-4");
    const updated51 = advanceResult.updatedMilestones.find((m) => m.stageCode === "5-1");
    expect(updated44?.status).toBe("COMPLETED");
    expect(updated51?.status).toBe("IN_PROGRESS");
    expect(advanceResult.newCurrentStage).toBe("PROD_SHIP");
  });

  it("防呆機制：嘗試回退系統自動略過之里程碑時應拋出 ConflictError", () => {
    const autoSkippedMilestone = {
      id: "m-skip",
      status: "COMPLETED",
      notes: "【系統自動略過：依客戶類型（工廠）跳轉】",
    };

    expect(() => {
      if (autoSkippedMilestone.notes?.includes("系統自動略過")) {
        throw new ConflictError("此進度為建立案場時依客戶類型自動略過之項目，無法回退");
      }
    }).toThrow(ConflictError);
  });

  it("管理設定動態覆寫：優先採用動態設定之客戶類型起始進度", () => {
    // 假設管理者在後台將「建設／營造 (CONSTRUCTION)」自訂設定為從「2-3 圖面索取」開始
    const dynamicConfig: Record<string, string> = {
      CONSTRUCTION: "2-3",
    };

    const targetCode = dynamicConfig["CONSTRUCTION"] || CUSTOMER_TYPE_START_STAGE_CODES["CONSTRUCTION"] || "1-1";
    expect(targetCode).toBe("2-3");

    const { rows, finalStartCode, initialProjectStage } = generateMilestoneRows("CONSTRUCTION", dynamicConfig["CONSTRUCTION"]);
    expect(finalStartCode).toBe("2-3");
    expect(initialProjectStage).toBe("REQUIREMENT");

    // 1-1, 1-2, 2-1, 2-2 應為 COMPLETED
    const skipped = rows.filter((r) => r.status === "COMPLETED");
    expect(skipped.map((r) => r.stageCode)).toEqual(["1-1", "1-2", "2-1", "2-2"]);

    // 2-3 應為 IN_PROGRESS
    const active = rows.find((r) => r.stageCode === "2-3");
    expect(active?.status).toBe("IN_PROGRESS");
  });
});
