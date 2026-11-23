import { describe, it, expect } from "vitest";
import {
  MILESTONE_DEFAULT_DAYS,
  STANDARD_MILESTONE_STAGE_CODES,
  normalizeMilestoneDefaultDays,
} from "@/lib/constants";

describe("各階段進度預設天數設定正規化 (normalizeMilestoneDefaultDays)", () => {
  it("僅保留現行 28 項標準里程碑並排除歷史廢止代碼 (X-1 / X-2 / 7-4 / 5-3)", () => {
    const legacySaved = {
      "1-1": 7,
      "5-3": 9,
      "6-2": 5,
      "7-3": 15,
      "7-4": 30,
      "X-1": 5,
      "X-2": 1,
    };

    const result = normalizeMilestoneDefaultDays(legacySaved);

    expect(Object.keys(result)).toEqual(STANDARD_MILESTONE_STAGE_CODES);
    expect(result["1-1"]).toBe(7);
    expect(result["6-2"]).toBe(5);
    expect(result["7-3"]).toBe(15);
    expect(result["5-3"]).toBeUndefined();
    expect(result["7-4"]).toBeUndefined();
    expect(result["X-1"]).toBeUndefined();
    expect(result["X-2"]).toBeUndefined();
  });

  it("缺漏或無效天數（0、負數、非數字）會自動補回系統預設值", () => {
    const invalidInput = {
      "1-1": 0,
      "1-2": -3,
      "2-1": "abc",
      "3-1": 8.7,
    };

    const result = normalizeMilestoneDefaultDays(invalidInput);

    expect(result["1-1"]).toBe(MILESTONE_DEFAULT_DAYS["1-1"]);
    expect(result["1-2"]).toBe(MILESTONE_DEFAULT_DAYS["1-2"]);
    expect(result["2-1"]).toBe(MILESTONE_DEFAULT_DAYS["2-1"]);
    expect(result["3-1"]).toBe(8);
    expect(result["7-3"]).toBe(MILESTONE_DEFAULT_DAYS["7-3"]);
  });

  it("輸入非物件時應回傳完整 28 項系統預設值", () => {
    const result = normalizeMilestoneDefaultDays(null);
    expect(Object.keys(result)).toHaveLength(28);
    for (const code of STANDARD_MILESTONE_STAGE_CODES) {
      expect(result[code]).toBe(MILESTONE_DEFAULT_DAYS[code]);
    }
  });
});
