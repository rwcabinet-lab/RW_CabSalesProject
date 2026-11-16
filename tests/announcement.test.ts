import { describe, it, expect } from "vitest";
import {
  createAnnouncementEntry,
  shouldShowAnnouncementModal,
  validateAnnouncementInput,
} from "@/lib/announcement";
import { canRoleAccessPath } from "@/lib/page-access";

describe("System Announcement Board (管理者公告欄與登入提示規則)", () => {
  it("validateAnnouncementInput 正確檢核標題與內容必填及字數上限", () => {
    expect(validateAnnouncementInput("", "內容")).toBe("請填寫公告標題");
    expect(validateAnnouncementInput("   ", "內容")).toBe("請填寫公告標題");
    expect(validateAnnouncementInput("標題", "")).toBe("請填寫公告內容");
    expect(validateAnnouncementInput("a".repeat(121), "內容")).toBe("公告標題不可超過 120 字");
    expect(validateAnnouncementInput("標題", "b".repeat(2001))).toBe("公告內容不可超過 2000 字");
    expect(validateAnnouncementInput("系統公告", "請於本週五前完成對圖作業")).toBeNull();
  });

  it("createAnnouncementEntry 產生啟用中的公告項目並正規化等級", () => {
    const entry = createAnnouncementEntry({
      title: "  系統維護通知  ",
      message: "  今晚 22:00 進行例行維護  ",
      level: "WARNING",
      pushedBy: "管理員",
      now: new Date("2026-11-16T07:00:00.000Z"),
    });

    expect(entry.id).toMatch(/^ann_/);
    expect(entry.title).toBe("系統維護通知");
    expect(entry.message).toBe("今晚 22:00 進行例行維護");
    expect(entry.level).toBe("WARNING");
    expect(entry.isActive).toBe(true);
    expect(entry.pushedAt).toBe("2026-11-16T07:00:00.000Z");

    const fallbackLevel = createAnnouncementEntry({
      title: "標題",
      message: "內容",
      level: "UNKNOWN",
      pushedBy: "",
    });
    expect(fallbackLevel.level).toBe("INFO");
    expect(fallbackLevel.pushedBy).toBe("管理員");
  });

  it("shouldShowAnnouncementModal 嚴格遵守「登入時提示」與「已確認後不重複打擾」規則", () => {
    const activeAnn = createAnnouncementEntry({
      title: "重要公告",
      message: "最新報價規範上線",
      level: "URGENT",
      pushedBy: "ADMIN",
    });

    // 1. 剛登入且公告啟用中 -> 必須顯示（即使先前已看過同則公告，重新登入仍應提醒）
    expect(
      shouldShowAnnouncementModal({
        announcement: activeAnn,
        acknowledgedId: activeAnn.id,
        justLoggedIn: true,
      })
    ).toBe(true);

    // 2. 同工作階段已點擊「我知道了」且尚未推送新公告 -> 不重複彈出
    expect(
      shouldShowAnnouncementModal({
        announcement: activeAnn,
        acknowledgedId: activeAnn.id,
        justLoggedIn: false,
      })
    ).toBe(false);

    // 3. 已登入狀態下管理者推送了新公告（ID 變更）-> 主動彈出提醒
    expect(
      shouldShowAnnouncementModal({
        announcement: activeAnn,
        acknowledgedId: "ann_older_id",
        justLoggedIn: false,
      })
    ).toBe(true);

    // 4. 當次 Render 已關閉 -> 不重複顯示
    expect(
      shouldShowAnnouncementModal({
        announcement: activeAnn,
        acknowledgedId: null,
        justLoggedIn: true,
        dismissedInRender: true,
      })
    ).toBe(false);

    // 5. 公告已暫停 (isActive: false) 或無公告 -> 一律不顯示
    expect(
      shouldShowAnnouncementModal({
        announcement: { ...activeAnn, isActive: false },
        acknowledgedId: null,
        justLoggedIn: true,
      })
    ).toBe(false);
    expect(
      shouldShowAnnouncementModal({
        announcement: null,
        acknowledgedId: null,
        justLoggedIn: true,
      })
    ).toBe(false);
  });

  it("所有已登入角色皆可存取 /api/announcement 讀取公告與回報已讀", () => {
    for (const role of ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER", "SALES", "ASSISTANT", "SITE_ENGINEER"]) {
      expect(canRoleAccessPath(role, "/api/announcement", "GET")).toBe(true);
      expect(canRoleAccessPath(role, "/api/announcement", "PUT")).toBe(true);
    }
  });
});
