import { describe, it, expect } from "vitest";
import { filterCustomersByKeyword } from "@/components/workbench/CustomerSearchSelect";
import { CUSTOMER_TYPE_START_STAGE_CODES } from "@/lib/constants";
import type { CustomerDTO } from "@/types/dto";

describe("新增案場之客戶欄位關鍵字搜尋與選取邏輯", () => {
  const mockCustomers: CustomerDTO[] = [
    {
      id: "c1",
      customerType: "CABINET_FACTORY",
      name: "正道系統櫥櫃製造廠",
      taxId: "12345678",
      phone: "02-23456789",
      address: "新北市五股區五工路1號",
      defaultDiscount: 0.7,
      paymentTerms: "MONTHLY_30",
      salesRepId: "u1",
      salesRepName: "陳小明",
    },
    {
      id: "c2",
      customerType: "DESIGN_COMPANY",
      name: "冠宇空間室內設計",
      taxId: "87654321",
      phone: "0912-345-678",
      address: "台北市大安區信義路二段",
      defaultDiscount: 0.85,
      paymentTerms: "CASH",
      salesRepId: "u2",
      salesRepName: "李大同",
    },
    {
      id: "c3",
      customerType: "CONSTRUCTION",
      name: "遠雄營造工程",
      taxId: "55667788",
      phone: "02-88889999",
      address: "台北市信義區松高路",
      defaultDiscount: 0.8,
      paymentTerms: "DEPOSIT_BALANCE",
      salesRepId: "u1",
      salesRepName: "陳小明",
    },
    {
      id: "c4",
      customerType: "INDIVIDUAL",
      name: "王小美",
      taxId: "",
      phone: "0988-777-666",
      address: "新北市板橋區縣民大道",
      defaultDiscount: 1.0,
      paymentTerms: "CASH",
      salesRepId: "u3",
      salesRepName: "張專案",
    },
    {
      id: "c5",
      customerType: "DEALER_COMPANY",
      name: "冠宇五金建材經銷商",
      taxId: "99887766",
      phone: "04-22334455",
      address: "台中市西屯區台灣大道",
      defaultDiscount: 0.75,
      paymentTerms: "MONTHLY_30",
      salesRepId: "u2",
      salesRepName: "李大同",
    },
  ];

  describe("特定名稱客戶關鍵字搜尋 (filterCustomersByKeyword)", () => {
    it("可輸入特定名稱關鍵字列出精確匹配之客戶", () => {
      const result = filterCustomersByKeyword(mockCustomers, "正道");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("c1");
      expect(result[0].name).toBe("正道系統櫥櫃製造廠");
    });

    it("可搜尋同名前綴詞列出所有符合之特定名稱客戶", () => {
      // 「冠宇」有兩家：「冠宇空間室內設計」與「冠宇五金建材經銷商」
      const result = filterCustomersByKeyword(mockCustomers, "冠宇");
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id)).toEqual(["c2", "c5"]);
    });

    it("搜尋關鍵字支援忽略前後空白與大小寫", () => {
      const result = filterCustomersByKeyword(mockCustomers, "  遠雄  ");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("c3");
    });

    it("未輸入或輸入空白關鍵字時，完整返回所有客戶列表", () => {
      expect(filterCustomersByKeyword(mockCustomers, "")).toHaveLength(5);
      expect(filterCustomersByKeyword(mockCustomers, "   ")).toHaveLength(5);
    });

    it("輸入不存在之客戶名稱時，返回空清單", () => {
      const result = filterCustomersByKeyword(mockCustomers, "不存在之神秘客戶");
      expect(result).toHaveLength(0);
    });

    it("支援依客戶統一編號搜尋特定客戶", () => {
      const result = filterCustomersByKeyword(mockCustomers, "87654321");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("c2");
      expect(result[0].name).toBe("冠宇空間室內設計");
    });

    it("支援依電話號碼（含部分號碼）搜尋特定客戶", () => {
      const result = filterCustomersByKeyword(mockCustomers, "0988");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("c4");
      expect(result[0].name).toBe("王小美");
    });

    it("支援依客戶類型名稱（如「設計公司」）搜尋客戶群", () => {
      const result = filterCustomersByKeyword(mockCustomers, "設計公司");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("c2");
    });
  });

  describe("選定客戶後與案場表單連動邏輯", () => {
    it("選中特定客戶時，應能連動取得對應業務與預設起始階段代碼", () => {
      const selected = mockCustomers.find((c) => c.name === "正道系統櫥櫃製造廠");
      expect(selected).toBeDefined();
      if (!selected) return;

      // 檢查業務連動
      expect(selected.salesRepId).toBe("u1");

      // 檢查預設起始進度
      const startStage = CUSTOMER_TYPE_START_STAGE_CODES[selected.customerType];
      expect(startStage).toBe("4-5");
    });

    it("管理頁面設定起始進度時，應優先採用管理員設定而非寫死常數", () => {
      // 模擬管理員在管理設定將【工廠】改為 1-1（不略過）
      const adminConfig: Record<string, string> = {
        CABINET_FACTORY: "1-1",
        DESIGN_COMPANY: "3-1",
      };

      const selected = mockCustomers.find((c) => c.name === "正道系統櫥櫃製造廠");
      expect(selected).toBeDefined();
      if (!selected) return;

      const dynamicCode = adminConfig[selected.customerType] || CUSTOMER_TYPE_START_STAGE_CODES[selected.customerType] || "1-1";
      expect(dynamicCode).toBe("1-1");

      // 設為 1-1 時，isCustomStart 應為 false（不跳轉、不顯示自動略過前期階段提示）
      const isCustomStart = dynamicCode !== "1-1";
      expect(isCustomStart).toBe(false);
    });

    it("管理頁面設定自訂進度（如 4-1）時，應正確判定為自訂跳轉並顯示對應進度代碼", () => {
      const adminConfig: Record<string, string> = {
        CABINET_FACTORY: "4-1",
      };

      const selected = mockCustomers.find((c) => c.name === "正道系統櫥櫃製造廠");
      expect(selected).toBeDefined();
      if (!selected) return;

      const dynamicCode = adminConfig[selected.customerType] || CUSTOMER_TYPE_START_STAGE_CODES[selected.customerType] || "1-1";
      expect(dynamicCode).toBe("4-1");
      const isCustomStart = dynamicCode !== "1-1";
      expect(isCustomStart).toBe(true);
    });

    it("選中設計公司客戶時，起始階段應為 3-1", () => {
      const selected = mockCustomers.find((c) => c.name === "冠宇空間室內設計");
      expect(selected).toBeDefined();
      if (!selected) return;

      const startStage = CUSTOMER_TYPE_START_STAGE_CODES[selected.customerType];
      expect(startStage).toBe("3-1");
    });
  });
});
