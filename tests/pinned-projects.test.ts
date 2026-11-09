import { describe, it, expect } from "vitest";
import { sortProjectsWithPins } from "@/hooks/usePinnedProjects";

describe("案件清單圖釘 (置頂) 功能測試", () => {
  const mockProjects = [
    { id: "p1", projectName: "南港科技園區A棟", expectedDate: "2026-11-30", status: "GREEN" },
    { id: "p2", projectName: "大安森林景觀住宅", expectedDate: "2026-12-15", status: "RED" },
    { id: "p3", projectName: "信義之星豪邸裝修", expectedDate: "2026-11-10", status: "YELLOW" },
    { id: "p4", projectName: "板橋文化雙子星案", expectedDate: "2026-12-01", status: "GREEN" },
  ];

  it("已置頂的案件應優先排在所有未置頂案件之前", () => {
    // 置頂 p3
    const pinnedSet = new Set(["p3"]);
    const sorted = sortProjectsWithPins(mockProjects, pinnedSet);

    expect(sorted[0].id).toBe("p3");
    expect(sorted.slice(1).map((p) => p.id)).toEqual(expect.arrayContaining(["p1", "p2", "p4"]));
  });

  it("多個案件同時置頂時，置頂群組內部應遵守基礎排序條件", () => {
    // 置頂 p2 與 p3
    const pinnedSet = new Set(["p2", "p3"]);

    // 依進場日升冪 (ASC)
    const sortedAsc = sortProjectsWithPins(mockProjects, pinnedSet, (a, b) =>
      a.expectedDate.localeCompare(b.expectedDate)
    );

    // p3 (2026-11-10) 早於 p2 (2026-12-15)，因此 p3 排第 1，p2 排第 2
    expect(sortedAsc[0].id).toBe("p3");
    expect(sortedAsc[1].id).toBe("p2");

    // 非置頂群組中：p1 (2026-11-30) 早於 p4 (2026-12-01)
    expect(sortedAsc[2].id).toBe("p1");
    expect(sortedAsc[3].id).toBe("p4");
  });

  it("多個案件同時置頂時，切換為進場日降冪 (DESC) 排序應正確連動", () => {
    const pinnedSet = new Set(["p2", "p3"]);

    // 依進場日降冪 (DESC)
    const sortedDesc = sortProjectsWithPins(mockProjects, pinnedSet, (a, b) =>
      b.expectedDate.localeCompare(a.expectedDate)
    );

    // 置頂群組中：p2 (2026-12-15) 晚於 p3 (2026-11-10)，因此 p2 排第 1，p3 排第 2
    expect(sortedDesc[0].id).toBe("p2");
    expect(sortedDesc[1].id).toBe("p3");

    // 非置頂群組中：p4 (2026-12-01) 晚於 p1 (2026-11-30)
    expect(sortedDesc[2].id).toBe("p4");
    expect(sortedDesc[3].id).toBe("p1");
  });

  it("無任何案件置頂時，列表完全依照原始比較器排序", () => {
    const pinnedSet = new Set<string>();

    const sorted = sortProjectsWithPins(mockProjects, pinnedSet, (a, b) =>
      a.expectedDate.localeCompare(b.expectedDate)
    );

    expect(sorted.map((p) => p.id)).toEqual(["p3", "p1", "p4", "p2"]);
  });

  it("全數案件皆置頂時，全體依比較器排序", () => {
    const pinnedSet = new Set(["p1", "p2", "p3", "p4"]);

    const sorted = sortProjectsWithPins(mockProjects, pinnedSet, (a, b) =>
      a.expectedDate.localeCompare(b.expectedDate)
    );

    expect(sorted.map((p) => p.id)).toEqual(["p3", "p1", "p4", "p2"]);
  });

  it("關鍵字或條件篩選與置頂之結合：不符合篩選之置頂案件正常被排除", () => {
    const pinnedSet = new Set(["p2", "p3"]); // p2: 大安, p3: 信義

    // 使用者搜尋「科技」
    const keyword = "科技";
    const filtered = mockProjects.filter((p) => p.projectName.includes(keyword));

    const sorted = sortProjectsWithPins(filtered, pinnedSet);

    // 只有 p1 符合關鍵字「科技」，置頂的 p2, p3 不符合故不應顯示
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("p1");
  });

  it("多件符合搜尋關鍵字時，符合且置頂者排於最前", () => {
    // 假設 p1 與 p4 都屬於 GREEN，p4 被置頂
    const pinnedSet = new Set(["p4"]);

    const greenProjects = mockProjects.filter((p) => p.status === "GREEN");
    const sorted = sortProjectsWithPins(greenProjects, pinnedSet);

    expect(sorted).toHaveLength(2);
    expect(sorted[0].id).toBe("p4"); // 置頂的 p4 排第 1
    expect(sorted[1].id).toBe("p1");
  });
});
