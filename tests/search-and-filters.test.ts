import { describe, it, expect, beforeEach } from "vitest";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { useManagerStore } from "@/stores/useManagerStore";
import { useViewsStore } from "@/stores/useViewsStore";
import { DEFAULT_PROJECT_COLUMNS, normalizeProjectColumns } from "@/lib/constants";
import type { WorkbenchProjectDTO, ManagerProjectOverviewDTO } from "@/types/dto";

describe("搜尋與篩選條件功能測試", () => {
  describe("useWorkbenchStore 關鍵字搜尋狀態管理", () => {
    it("正確更新與重設 searchQuery", () => {
      const store = useWorkbenchStore.getState();
      expect(store.searchQuery).toBe("");

      store.setSearchQuery("南港案場");
      expect(useWorkbenchStore.getState().searchQuery).toBe("南港案場");

      store.resetFilters();
      expect(useWorkbenchStore.getState().searchQuery).toBe("");
    });
  });

  describe("案場筆記案件清單關鍵字搜尋過濾邏輯", () => {
    const mockProjects: WorkbenchProjectDTO[] = [
      {
        id: "p1",
        projectName: "南港科技園區A棟",
        customerId: "c1",
        customerName: "遠雄營造",
        customerType: "CONSTRUCTION",
        defaultDiscount: 0.85,
        siteCondition: "RC結構",
        expectedDate: "2026-11-30",
        currentStage: "PROPOSAL",
        siteAddress: "台北市南港區經貿二路1號",
        isDelayed: false,
        salesRepId: "u1",
        salesRepName: "陳小明",
        salesAssistantName: "林小華",
        totalAmount: 1500000,
        quoteAmount: 1500000,
        unitCount: 20,
        activeMilestone: {
          id: "m1",
          stageCode: "3-1",
          phase: "PROPOSAL",
          stageName: "設計初稿與報價確認",
          plannedDueDate: "2026-11-15",
          status: "IN_PROGRESS",
        },
        trafficLight: { color: "GREEN", label: "正常", daysDiff: 0 },
      },
      {
        id: "p2",
        projectName: "大安森林景觀住宅",
        customerId: "c2",
        customerName: "宏盛建設",
        customerType: "DESIGNER",
        defaultDiscount: 1,
        siteCondition: "毛胚屋",
        expectedDate: "2026-12-31",
        currentStage: "DEVELOP",
        siteAddress: "台北市大安區信義路三段",
        isDelayed: false,
        salesRepId: "u2",
        salesRepName: "李大同",
        salesAssistantName: null,
        totalAmount: 3200000,
        quoteAmount: 3200000,
        unitCount: 10,
        activeMilestone: {
          id: "m2",
          stageCode: "1-1",
          phase: "DEVELOP",
          stageName: "客戶初訪與需求確認",
          plannedDueDate: "2026-12-05",
          status: "IN_PROGRESS",
        },
        trafficLight: { color: "GREEN", label: "正常", daysDiff: 0 },
      },
    ];

    const filterByKeyword = (projects: WorkbenchProjectDTO[], keyword: string) => {
      const q = keyword.trim().toLowerCase();
      if (!q) return projects;
      return projects.filter((p) => {
        const mProject = p.projectName?.toLowerCase().includes(q);
        const mCustomer = p.customerName?.toLowerCase().includes(q);
        const mAddress = p.siteAddress?.toLowerCase().includes(q);
        const mSales = p.salesRepName?.toLowerCase().includes(q);
        const mAssistant = p.salesAssistantName?.toLowerCase().includes(q);
        return Boolean(mProject || mCustomer || mAddress || mSales || mAssistant);
      });
    };

    it("可依案場名稱進行搜尋", () => {
      const result = filterByKeyword(mockProjects, "南港");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p1");
    });

    it("可依客戶名稱進行搜尋", () => {
      const result = filterByKeyword(mockProjects, "宏盛");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p2");
    });

    it("可依案場地址進行搜尋", () => {
      const result = filterByKeyword(mockProjects, "經貿二路");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p1");
    });

    it("可依負責業務或業助進行搜尋", () => {
      const bySales = filterByKeyword(mockProjects, "李大同");
      expect(bySales).toHaveLength(1);
      expect(bySales[0].id).toBe("p2");

      const byAssistant = filterByKeyword(mockProjects, "林小華");
      expect(byAssistant).toHaveLength(1);
      expect(byAssistant[0].id).toBe("p1");
    });

    it("搜尋無符合結果時應回傳空陣列", () => {
      const result = filterByKeyword(mockProjects, "高雄前鎮");
      expect(result).toHaveLength(0);
    });
  });

  describe("主管總控案件清單與業務選單過濾邏輯", () => {
    const mockOverview: ManagerProjectOverviewDTO[] = [
      {
        id: "p1",
        projectName: "南港科技園區A棟",
        siteAddress: "台北市南港區經貿二路1號",
        customerName: "遠雄營造",
        customerType: "CONSTRUCTION",
        currentStage: "PROPOSAL",
        currentStageLabel: "提案/報價/簽約",
        salesRepName: "陳小明",
        salesAssistantName: "林小華",
        isDelayed: false,
        trafficLight: { color: "GREEN", label: "正常", daysDiff: 0 },
        expectedDate: "2026-11-30",
        totalAmount: 1500000,
        lastCompletedMilestoneName: "客戶初訪",
        activeMilestoneName: "設計初稿與報價確認",
        activeMilestoneId: "m1",
        activeMilestoneAssignedTo: "陳小明",
        unassignedNextMilestoneName: null,
      },
      {
        id: "p2",
        projectName: "新竹竹科廠辦裝修",
        siteAddress: "新竹市東區科學園區一路",
        customerName: "台積工程部",
        customerType: "DIRECT",
        currentStage: "PRE_PROD",
        currentStageLabel: "生產前確認/拆單",
        salesRepName: "未指定",
        salesAssistantName: null,
        isDelayed: true,
        trafficLight: { color: "RED", label: "逾期", daysDiff: -5 },
        expectedDate: "2026-10-25",
        totalAmount: 2800000,
        lastCompletedMilestoneName: "簽約確認",
        activeMilestoneName: "工料拆單確認",
        activeMilestoneId: "m2",
        activeMilestoneAssignedTo: null,
        unassignedNextMilestoneName: null,
      },
      {
        id: "p3",
        projectName: "台中七期豪宅",
        siteAddress: "台中市西屯區市政路",
        customerName: "聯聚建設",
        customerType: "CONSTRUCTION",
        currentStage: "INSTALL",
        currentStageLabel: "安裝及驗收",
        salesRepName: "未指派",
        salesAssistantName: null,
        isDelayed: false,
        trafficLight: { color: "GREEN", label: "正常", daysDiff: 0 },
        expectedDate: "2026-12-15",
        totalAmount: 5000000,
        lastCompletedMilestoneName: "生產及派送",
        activeMilestoneName: "現場安裝施作",
        activeMilestoneId: "m3",
        activeMilestoneAssignedTo: null,
        unassignedNextMilestoneName: null,
      },
      {
        id: "p4",
        projectName: "板橋江翠新居",
        siteAddress: "新北市板橋區華江一路",
        customerName: "張設計師",
        customerType: "DESIGNER",
        currentStage: "DEVELOP",
        currentStageLabel: "案件開發",
        salesRepName: "王專員",
        salesAssistantName: null,
        isDelayed: false,
        trafficLight: { color: "GREEN", label: "正常", daysDiff: 0 },
        expectedDate: "2027-01-10",
        totalAmount: 800000,
        lastCompletedMilestoneName: null,
        activeMilestoneName: "需求確認",
        activeMilestoneId: "m4",
        activeMilestoneAssignedTo: "王專員",
        unassignedNextMilestoneName: null,
      },
    ];

    it("業務選單項目應排除「未指定」與「未指派」", () => {
      const businessOptions = Array.from(
        new Set(
          mockOverview
            .map((project) => project.salesRepName)
            .filter((name): name is string => Boolean(name && name !== "未指定" && name !== "未指派"))
        )
      ).sort((a, b) => a.localeCompare(b, "zh-TW"));

      expect(businessOptions).toEqual(["王專員", "陳小明"]);
      expect(businessOptions).not.toContain("未指定");
      expect(businessOptions).not.toContain("未指派");
    });

    it("主管總控關鍵字搜尋能正確比對案名、地址、客戶與業務", () => {
      const filterOverview = (projects: ManagerProjectOverviewDTO[], keyword: string) => {
        const q = keyword.trim().toLowerCase();
        if (!q) return projects;
        return projects.filter((p) => {
          const mProject = p.projectName?.toLowerCase().includes(q);
          const mCustomer = p.customerName?.toLowerCase().includes(q);
          const mAddress = p.siteAddress?.toLowerCase().includes(q);
          const mSales = p.salesRepName?.toLowerCase().includes(q);
          const mAssistant = p.salesAssistantName?.toLowerCase().includes(q);
          return Boolean(mProject || mCustomer || mAddress || mSales || mAssistant);
        });
      };

      expect(filterOverview(mockOverview, "新竹")).toHaveLength(1);
      expect(filterOverview(mockOverview, "新竹")[0].id).toBe("p2");

      expect(filterOverview(mockOverview, "台積")).toHaveLength(1);
      expect(filterOverview(mockOverview, "台積")[0].id).toBe("p2");

      expect(filterOverview(mockOverview, "陳小明")).toHaveLength(1);
      expect(filterOverview(mockOverview, "陳小明")[0].id).toBe("p1");

      expect(filterOverview(mockOverview, "不存在關鍵字")).toHaveLength(0);
    });

    it("人員案場負載計算除了業務外，應包含業助與工務等現階段負責同仁", () => {
      const mockStaff = [
        { id: "u-sales", name: "王業務", role: "SALES" },
        { id: "u-asst", name: "林業助", role: "ASSISTANT" },
        { id: "u-eng", name: "張工務", role: "SITE_ENGINEER" },
      ];

      const mockProjects = [
        {
          id: "proj-1",
          salesRepId: "u-sales",
          salesAssistantId: "u-asst",
          activeMilestone: { assignedToId: "u-eng", status: "IN_PROGRESS" },
          isDelayed: false,
        },
        {
          id: "proj-2",
          salesRepId: "u-sales",
          salesAssistantId: null,
          activeMilestone: { assignedToId: "u-sales", status: "OVERDUE" },
          isDelayed: true,
        },
      ];

      const workloadMap = new Map<string, { total: number; delayed: number }>();
      mockStaff.forEach((s) => workloadMap.set(s.id, { total: 0, delayed: 0 }));

      mockProjects.forEach((p) => {
        const involvedIds = new Set<string>();
        if (p.salesRepId) involvedIds.add(p.salesRepId);
        if (p.salesAssistantId) involvedIds.add(p.salesAssistantId);
        if (p.activeMilestone?.assignedToId) involvedIds.add(p.activeMilestone.assignedToId);

        involvedIds.forEach((uid) => {
          const entry = workloadMap.get(uid);
          if (entry) {
            entry.total++;
            if (p.isDelayed || p.activeMilestone?.status === "OVERDUE") {
              entry.delayed++;
            }
          }
        });
      });

      // 業務 (proj-1 + proj-2)
      expect(workloadMap.get("u-sales")?.total).toBe(2);
      expect(workloadMap.get("u-sales")?.delayed).toBe(1);

      // 業助 (proj-1)
      expect(workloadMap.get("u-asst")?.total).toBe(1);
      expect(workloadMap.get("u-asst")?.delayed).toBe(0);

      // 工務 (proj-1 現階段里程碑負責人)
      expect(workloadMap.get("u-eng")?.total).toBe(1);
      expect(workloadMap.get("u-eng")?.delayed).toBe(0);
    });
  });

  describe("案場筆記與主管總控之篩選與排序管理機制", () => {
    it("useWorkbenchStore 正確管理 statusFilter、stageFilter、searchQuery 與 resetFilters", () => {
      const store = useWorkbenchStore.getState();
      expect(store.searchQuery).toBe("");
      expect(store.statusFilter).toBe("");
      expect(store.stageFilter).toBe("ACTIVE");
      expect(store.dateSort).toBe("NONE");
      expect(store.statusSort).toBe("NONE");

      store.setSearchQuery("遠雄");
      store.setStatusFilter("RED");
      store.setStageFilter("PROPOSAL");
      store.toggleDateSort();
      expect(useWorkbenchStore.getState().searchQuery).toBe("遠雄");
      expect(useWorkbenchStore.getState().statusFilter).toBe("RED");
      expect(useWorkbenchStore.getState().stageFilter).toBe("PROPOSAL");
      expect(useWorkbenchStore.getState().dateSort).toBe("ASC");

      store.resetFilters();
      expect(useWorkbenchStore.getState().searchQuery).toBe("");
      expect(useWorkbenchStore.getState().statusFilter).toBe("");
      expect(useWorkbenchStore.getState().stageFilter).toBe("ACTIVE");
      expect(useWorkbenchStore.getState().dateSort).toBe("NONE");
      expect(useWorkbenchStore.getState().statusSort).toBe("NONE");
    });

    it("useManagerStore 正確持久化管理主管總控之篩選狀態、排序與 resetFilters", () => {
      const store = useManagerStore.getState();
      store.resetFilters();

      expect(store.searchQuery).toBe("");
      expect(store.statusFilter).toBe("");
      expect(store.businessFilter).toBe("");
      expect(store.stageFilter).toBe("ACTIVE");
      expect(store.dateSort).toBe("NONE");
      expect(store.statusSort).toBe("NONE");

      store.setSearchQuery("南港");
      store.setStatusFilter("YELLOW");
      store.setBusinessFilter("陳小明");
      store.setStageFilter("PRE_PROD");
      store.toggleDateSort();
      store.toggleStatusSort();

      expect(useManagerStore.getState().searchQuery).toBe("南港");
      expect(useManagerStore.getState().statusFilter).toBe("YELLOW");
      expect(useManagerStore.getState().businessFilter).toBe("陳小明");
      expect(useManagerStore.getState().stageFilter).toBe("PRE_PROD");
      expect(useManagerStore.getState().dateSort).toBe("ASC");
      expect(useManagerStore.getState().statusSort).toBe("URGENT_FIRST");

      // 點擊【回復預設】
      store.resetFilters();
      expect(useManagerStore.getState().searchQuery).toBe("");
      expect(useManagerStore.getState().statusFilter).toBe("");
      expect(useManagerStore.getState().businessFilter).toBe("");
      expect(useManagerStore.getState().stageFilter).toBe("ACTIVE");
      expect(useManagerStore.getState().dateSort).toBe("NONE");
      expect(useManagerStore.getState().statusSort).toBe("NONE");
    });

    it("useViewsStore 正確管理視覺時程之篩選狀態與 resetFilters", () => {
      const store = useViewsStore.getState();
      store.resetFilters();

      expect(store.searchQuery).toBe("");
      expect(store.salesFilter).toBe("");
      expect(store.typeFilter).toBe("");
      expect(store.stageFilter).toBe("");
      expect(store.statusFilter).toBe("");

      store.setSearchQuery("別墅");
      store.setSalesFilter("王大明");
      store.setTypeFilter("DESIGN_COMPANY");
      store.setStageFilter("INSTALL");
      store.setStatusFilter("GREEN");

      expect(useViewsStore.getState().searchQuery).toBe("別墅");
      expect(useViewsStore.getState().salesFilter).toBe("王大明");
      expect(useViewsStore.getState().typeFilter).toBe("DESIGN_COMPANY");
      expect(useViewsStore.getState().stageFilter).toBe("INSTALL");
      expect(useViewsStore.getState().statusFilter).toBe("GREEN");

      // 點擊【回復預設】
      store.resetFilters();
      expect(useViewsStore.getState().searchQuery).toBe("");
      expect(useViewsStore.getState().salesFilter).toBe("");
      expect(useViewsStore.getState().typeFilter).toBe("");
      expect(useViewsStore.getState().stageFilter).toBe("");
      expect(useViewsStore.getState().statusFilter).toBe("");
    });
  });

  describe("案件清單欄位定義與規範", () => {
    it("預設進場日期欄位標籤應統一為「預定進場」", () => {
      const expectedDateCol = DEFAULT_PROJECT_COLUMNS.find((c) => c.key === "expectedDate");
      expect(expectedDateCol).toBeDefined();
      expect(expectedDateCol?.label).toBe("預定進場");

      // 測試 normalizeProjectColumns 是否亦強制更新為「預定進場」
      const savedWithOldLabel = [
        { key: "expectedDate", label: "預定進場日", visible: true, order: 6 },
      ];
      const normalized = normalizeProjectColumns(savedWithOldLabel);
      const normalizedExpectedDate = normalized.find((c) => c.key === "expectedDate");
      expect(normalizedExpectedDate?.label).toBe("預定進場");
    });
  });
});
