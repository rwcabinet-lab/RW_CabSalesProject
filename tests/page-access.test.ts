import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  getRoleLandingPath,
  canRoleAccessPath,
  getPageAccessKey,
  DEFAULT_ROLE_PAGES,
  PAGE_ACCESS_OPTIONS,
} from "@/lib/page-access";
import { POST as createCustomerPost } from "@/app/api/customers/route";
import * as accessControl from "@/lib/access-control";
import { DataService } from "@/lib/data-service";
import { prisma } from "@/lib/prisma";

describe("RBAC Page Access & Landing Rules (角色權限與著陸頁規則)", () => {
  it("已取消獨立首頁設定：PAGE_ACCESS_OPTIONS 與預設權限不再包含 home", () => {
    expect(PAGE_ACCESS_OPTIONS.some((item) => (item.key as string) === "home")).toBe(false);
    for (const pages of Object.values(DEFAULT_ROLE_PAGES)) {
      expect(pages as string[]).not.toContain("home");
    }
  });

  describe("getRoleLandingPath (角色著陸頁預設優先權)", () => {
    it("具備 [主管總控] 權限者（ADMIN / LEVEL_MANAGER / SALES_MANAGER）預設首頁為 /dashboard/manager", () => {
      expect(getRoleLandingPath("ADMIN", DEFAULT_ROLE_PAGES.ADMIN)).toBe("/dashboard/manager");
      expect(
        getRoleLandingPath("LEVEL_MANAGER", DEFAULT_ROLE_PAGES.LEVEL_MANAGER)
      ).toBe("/dashboard/manager");
      expect(
        getRoleLandingPath("SALES_MANAGER", DEFAULT_ROLE_PAGES.SALES_MANAGER)
      ).toBe("/dashboard/manager");
    });

    it("沒有 [主管總控] 權限者（SALES / ASSISTANT / SITE_ENGINEER）預設首頁為 /dashboard/workbench", () => {
      expect(getRoleLandingPath("SALES", DEFAULT_ROLE_PAGES.SALES)).toBe(
        "/dashboard/workbench"
      );
      expect(getRoleLandingPath("ASSISTANT", DEFAULT_ROLE_PAGES.ASSISTANT)).toBe(
        "/dashboard/workbench"
      );
      expect(
        getRoleLandingPath("SITE_ENGINEER", DEFAULT_ROLE_PAGES.SITE_ENGINEER)
      ).toBe("/dashboard/workbench");
    });

    it("動態調整權限時：有 manager 優先進主管總控，移除 manager 則退回案場筆記", () => {
      expect(getRoleLandingPath("SALES", ["workbench", "manager"])).toBe("/dashboard/manager");
      expect(getRoleLandingPath("SALES_MANAGER", ["workbench", "views"])).toBe("/dashboard/workbench");
    });
  });

  describe("canRoleAccessPath (Edge 高效角色路由權限檢驗)", () => {
    it("ADMIN 具備全域管理存取權限 (包含 /admin)", () => {
      expect(canRoleAccessPath("ADMIN", "/admin")).toBe(true);
      expect(canRoleAccessPath("ADMIN", "/dashboard/workbench")).toBe(true);
      expect(canRoleAccessPath("ADMIN", "/dashboard/manager")).toBe(true);
    });

    it("非 ADMIN 角色禁止存取 /admin 頁面與 /api/admin 路由", () => {
      expect(canRoleAccessPath("SALES", "/admin")).toBe(false);
      expect(canRoleAccessPath("LEVEL_MANAGER", "/admin")).toBe(false);
      expect(canRoleAccessPath("SITE_ENGINEER", "/api/admin/users")).toBe(false);
    });

    it("已登入同仁可存取 /api/auth/users 作為指派選單資料來源", () => {
      expect(canRoleAccessPath("SALES", "/api/auth/users")).toBe(true);
      expect(canRoleAccessPath("ASSISTANT", "/api/auth/users")).toBe(true);
      expect(canRoleAccessPath("ADMIN", "/api/auth/users")).toBe(true);
    });

    it("根路徑 / 與公開路徑一律放行 (/ , /login, /forbidden, /settings)", () => {
      expect(canRoleAccessPath("SALES", "/")).toBe(true);
      expect(canRoleAccessPath("LEVEL_MANAGER", "/")).toBe(true);
      expect(canRoleAccessPath("SALES", "/login")).toBe(true);
      expect(canRoleAccessPath("SITE_ENGINEER", "/forbidden")).toBe(true);
      expect(canRoleAccessPath("ASSISTANT", "/settings")).toBe(true);
      expect(canRoleAccessPath("SALES", "/api/auth/login")).toBe(true);
    });

    it("SALES 具備案場筆記與視覺時程存取權", () => {
      expect(canRoleAccessPath("SALES", "/dashboard/workbench")).toBe(true);
      expect(canRoleAccessPath("SALES", "/views")).toBe(true);
      expect(canRoleAccessPath("SALES", "/customers")).toBe(true);
    });

    it("除工務人員 (SITE_ENGINEER) 外，其餘所有角色皆可存取 /customers 與建立客戶 API", () => {
      const allowedRoles = ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER", "SALES", "ASSISTANT"] as const;
      for (const role of allowedRoles) {
        expect(DEFAULT_ROLE_PAGES[role]).toContain("customers");
        expect(canRoleAccessPath(role, "/customers")).toBe(true);
        expect(canRoleAccessPath(role, "/api/customers", "POST")).toBe(true);
      }

      expect(DEFAULT_ROLE_PAGES.SITE_ENGINEER).not.toContain("customers");
      expect(canRoleAccessPath("SITE_ENGINEER", "/customers")).toBe(false);
      expect(canRoleAccessPath("SITE_ENGINEER", "/api/customers", "POST")).toBe(false);
    });
  });

  describe("POST /api/customers 建立客戶主檔授權檢查", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("未登入應回傳 401", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/customers", {
        method: "POST",
        body: JSON.stringify({ name: "測試客戶", phone: "0912345678", customerType: "INDIVIDUAL" }),
      });
      const res = await createCustomerPost(req);
      expect(res.status).toBe(401);
    });

    it("工務人員 (SITE_ENGINEER) 即使資料庫權限誤開仍應回傳 403 拒絕建立", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-eng",
        name: "工務人員",
        role: "SITE_ENGINEER",
        email: "E0001",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(accessControl, "canUserAccessPath").mockResolvedValue(true);

      const req = new NextRequest("http://localhost:3000/api/customers", {
        method: "POST",
        body: JSON.stringify({ name: "測試客戶", phone: "0912345678", customerType: "INDIVIDUAL" }),
      });
      const res = await createCustomerPost(req);
      expect(res.status).toBe(403);
    });

    it("業務助理 (ASSISTANT) 具備權限且可成功建立客戶主檔回傳 201", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-asst",
        name: "業務助理",
        role: "ASSISTANT",
        email: "A0001",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(accessControl, "canUserAccessPath").mockResolvedValue(true);
      vi.spyOn(prisma.customer, "findFirst").mockResolvedValue(null);
      vi.spyOn(DataService, "addCustomer").mockResolvedValue({
        id: "cust-new",
        customerType: "INDIVIDUAL",
        name: "測試新客戶",
        phone: "0912345678",
        defaultDiscount: 1.0,
        paymentTerms: "DEPOSIT_BALANCE",
        salesRepId: "u-sales",
        salesRepName: "業務人員",
      });

      const req = new NextRequest("http://localhost:3000/api/customers", {
        method: "POST",
        body: JSON.stringify({
          name: "測試新客戶",
          phone: "0912345678",
          customerType: "INDIVIDUAL",
          salesRepId: "u-sales",
        }),
      });
      const res = await createCustomerPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe("cust-new");
    });
  });

  describe("getPageAccessKey (路徑轉換為權限鍵值)", () => {
    it("正確辨識工作台、主管看板與設定路徑", () => {
      expect(getPageAccessKey("/dashboard/workbench")).toBe("workbench");
      expect(getPageAccessKey("/dashboard/manager")).toBe("manager");
      expect(getPageAccessKey("/views")).toBe("views");
      expect(getPageAccessKey("/customers")).toBe("customers");
      expect(getPageAccessKey("/admin")).toBe("admin");
    });
  });
});
