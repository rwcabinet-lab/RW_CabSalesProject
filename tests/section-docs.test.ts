import { describe, it, expect } from "vitest";
import { SECTION_DOCS } from "@/config/section-docs";
import { useSectionHelpStore } from "@/stores/useSectionHelpStore";

describe("Section Documentation System (各頁面區塊專用說明文件系統)", () => {
  it("所有已註冊的區塊說明文件皆具備必要欄位與完整內容", () => {
    const docKeys = Object.keys(SECTION_DOCS);
    expect(docKeys.length).toBe(28);

    for (const key of docKeys) {
      const doc = SECTION_DOCS[key];
      expect(doc.id).toBe(key);
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.category.length).toBeGreaterThan(0);
      expect(doc.overview.length).toBeGreaterThan(15);
      expect(doc.keyPoints.length).toBeGreaterThanOrEqual(1);

      for (const point of doc.keyPoints) {
        expect(point.label.length).toBeGreaterThan(0);
        expect(point.desc.length).toBeGreaterThan(0);
      }
    }
  });

  it("useSectionHelpStore 正確切換開啟與關閉說明文件", () => {
    const store = useSectionHelpStore.getState();
    expect(store.activeSectionId).toBeNull();

    // 開啟說明
    store.openHelp("workbench-tasks");
    expect(useSectionHelpStore.getState().activeSectionId).toBe("workbench-tasks");

    // 關閉說明
    store.closeHelp();
    expect(useSectionHelpStore.getState().activeSectionId).toBeNull();
  });

  it("核心關鍵頁面之區塊說明皆已納入清單", () => {
    const expectedKeys = [
      "workbench-tasks",
      "workbench-projects",
      "manager-kpi",
      "manager-assigned-tasks",
      "manager-workload",
      "manager-bottlenecks",
      "manager-all-projects",
      "manager-status-report",
      "manager-customers-kpi",
      "manager-customers-chart",
      "manager-customers-table",
      "milestones-header",
      "milestones-phases",
      "milestones-cards",
      "milestones-completed-tasks",
      "milestones-pending-tasks",
      "views-filters",
      "views-gantt",
      "views-calendar",
      "customers-management",
      "admin-columns",
      "admin-stage-days",
      "admin-theme",
      "admin-users",
      "admin-permissions",
      "settings-account",
      "settings-password",
      "settings-appearance",
    ];

    for (const key of expectedKeys) {
      expect(SECTION_DOCS[key]).toBeDefined();
    }
  });

  it("說明文件用詞與實際網頁標籤、里程碑名稱及按鈕完全相符（不含舊版或不存在之用詞）", () => {
    const serialized = JSON.stringify(SECTION_DOCS);

    // 必須包含實際網頁核心用詞
    expect(serialized).toContain("成交率");
    expect(serialized).toContain("送約/簽約");
    expect(serialized).toContain("進行中總案場數");
    expect(serialized).toContain("已簽約/生產預估總額");
    expect(serialized).toContain("逾期案件");
    expect(serialized).toContain("案件階段分佈與卡關瓶頸");
    expect(serialized).toContain("案件細節");
    expect(serialized).toContain("進度完成");
    expect(serialized).toContain("審核完成");
    expect(serialized).toContain("設定目標");
    expect(serialized).toContain("確認更新密碼");
    expect(serialized).toContain("理級主管");

    // 不得殘留與實際網頁不符之舊詞或不存在按鈕
    const forbiddenTerms = [
      "簽約轉化率",
      "簽約用印",
      "2-2 現場丈量",
      "3-2 報價確認",
      "4-3 系統拆單",
      "5-1 備料生產",
      "請款申請",
      "進度細節",
      "自訂欄位",
      "更換業務",
      "停用帳號",
      "設定月度目標",
      "儲存客戶資料",
      "圓餅/環圈圖",
      "時程延誤與異常警示清單",
      "24 項標準里程碑",
    ];

    for (const badTerm of forbiddenTerms) {
      expect(serialized).not.toContain(badTerm);
    }
  });
});
