import { describe, it, expect } from "vitest";
import {
  getTaipeiDateKey,
  getCutoffDateKey,
  pruneDailyStats,
  computeActivitySummary,
  shouldRecordUserActivity,
} from "../src/lib/activity-tracker";

describe("使用者在線時間與 30 天使用頻率追蹤 (activity-tracker)", () => {
  it("正確換算台灣時間 (UTC+8) 日期鍵值與 30 天保留邊界", () => {
    // 2026-11-12T16:30:00.000Z 為台灣時間 2026-11-13 00:30:00
    const now = new Date("2026-11-12T16:30:00.000Z");
    expect(getTaipeiDateKey(now)).toBe("2026-11-13");
    // 含今日共 30 天：2026-10-15 ~ 2026-11-13
    expect(getCutoffDateKey(30, now)).toBe("2026-10-15");
    // 含今日共 7 天：2026-11-07 ~ 2026-11-13
    expect(getCutoffDateKey(7, now)).toBe("2026-11-07");
  });

  it("pruneDailyStats 僅保留最近 30 天紀錄並自動清理逾期資料", () => {
    const now = new Date("2026-11-13T04:00:00.000Z"); // 台北 2026-11-13 12:00
    const pruned = pruneDailyStats(
      {
        "2026-10-14": 5, // 第 31 天，應清除
        "2026-10-15": 2, // 第 30 天邊界，應保留
        "2026-11-10": 3,
        "2026-11-13": 1,
        "invalid-date": 99,
        "2026-11-12": 0, // 無效或 0 次應忽略
      },
      30,
      now,
    );

    expect(pruned).toEqual({
      "2026-10-15": 2,
      "2026-11-10": 3,
      "2026-11-13": 1,
    });
  });

  it("computeActivitySummary 正確彙算近 7 天 / 近 30 天活躍天數與最後在線時間", () => {
    const now = new Date("2026-11-13T04:00:00.000Z"); // 台北 2026-11-13 12:00
    const summary = computeActivitySummary(
      {
        lastActiveAt: "2026-11-13T03:50:00.000Z",
        dailyStats: {
          "2026-10-10": 4, // 超過 30 天
          "2026-10-20": 3, // 近 30 天內
          "2026-11-07": 2, // 近 7 天邊界
          "2026-11-13": 5, // 今日
        },
      },
      "2026-11-01T02:00:00.000Z",
      now,
    );

    expect(summary.lastActiveAt).toBe("2026-11-13T03:50:00.000Z");
    expect(summary.activeDays7d).toBe(2);
    expect(summary.activeDays30d).toBe(3);
    expect(summary.activeHits30d).toBe(10);
  });

  it("無活躍紀錄時自動向下相容回退使用最後登入時間", () => {
    const now = new Date("2026-11-13T04:00:00.000Z");
    const summary = computeActivitySummary(null, "2026-11-05T03:40:56.804Z", now);

    expect(summary.lastActiveAt).toBe("2026-11-05T03:40:56.804Z");
    expect(summary.activeDays7d).toBe(0);
    expect(summary.activeDays30d).toBe(0);
    expect(summary.activeHits30d).toBe(0);
  });

  it("shouldRecordUserActivity 落實 10 分鐘節流並在跨日午夜後立即放行", () => {
    const userId = `test_user_${Date.now()}`;
    const t1 = new Date("2026-11-13T15:55:00.000Z"); // 台北 2026-11-13 23:55:00
    const t2 = new Date("2026-11-13T15:59:00.000Z"); // 台北 2026-11-13 23:59:00 (4 分鐘內，同日)
    const t3 = new Date("2026-11-13T16:01:00.000Z"); // 台北 2026-11-14 00:01:00 (僅過 6 分鐘但已跨日)
    const t4 = new Date("2026-11-13T16:12:00.000Z"); // 台北 2026-11-14 00:12:00 (過了 11 分鐘)

    expect(shouldRecordUserActivity(userId, t1, 10 * 60 * 1000)).toBe(true);
    expect(shouldRecordUserActivity(userId, t2, 10 * 60 * 1000)).toBe(false);
    expect(shouldRecordUserActivity(userId, t3, 10 * 60 * 1000)).toBe(true);
    expect(shouldRecordUserActivity(userId, t4, 10 * 60 * 1000)).toBe(true);
  });
});
