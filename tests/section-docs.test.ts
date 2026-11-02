import { describe, it, expect } from "vitest";
import { SECTION_DOCS } from "@/config/section-docs";
import { useSectionHelpStore } from "@/stores/useSectionHelpStore";

describe("Section Documentation System (各頁面區塊專用說明文件系統)", () => {
  it("所有已註冊的區塊說明文件皆具備必要欄位與完整內容", () => {
    const docKeys = Object.keys(SECTION_DOCS);
    expect(docKeys.length).toBeGreaterThanOrEqual(25);

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
      "manager-alerts",
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
});
