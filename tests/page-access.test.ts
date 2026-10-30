import { describe, it, expect } from "vitest";
import {
  getRoleLandingPath,
  canRoleAccessPath,
  getPageAccessKey,
  DEFAULT_ROLE_PAGES,
} from "@/lib/page-access";

describe("RBAC Page Access & Landing Rules (角色權限與著陸頁規則)", () => {
  describe("getRoleLandingPath (角色著陸頁預設優先權)", () => {
    it("ADMIN 優先著陸於 /dashboard/workbench", () => {
      const path = getRoleLandingPath("ADMIN", DEFAULT_ROLE_PAGES.ADMIN);
      expect(path).toBe("/dashboard/workbench");
    });

    it("LEVEL_MANAGER / SALES_MANAGER 優先著陸於 /dashboard/manager", () => {
      expect(
        getRoleLandingPath("LEVEL_MANAGER", DEFAULT_ROLE_PAGES.LEVEL_MANAGER)
      ).toBe("/dashboard/manager");
      expect(
        getRoleLandingPath("SALES_MANAGER", DEFAULT_ROLE_PAGES.SALES_MANAGER)
      ).toBe("/dashboard/manager");
    });

    it("SALES / ASSISTANT / SITE_ENGINEER 優先著陸於 /dashboard/workbench", () => {
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

    it("公開路徑一律放行 (/login, /forbidden, /settings)", () => {
      expect(canRoleAccessPath("SALES", "/login")).toBe(true);
      expect(canRoleAccessPath("SITE_ENGINEER", "/forbidden")).toBe(true);
      expect(canRoleAccessPath("ASSISTANT", "/settings")).toBe(true);
      expect(canRoleAccessPath("SALES", "/api/auth/login")).toBe(true);
    });

    it("SALES 具備業務工作台與多元可視化存取權", () => {
      expect(canRoleAccessPath("SALES", "/dashboard/workbench")).toBe(true);
      expect(canRoleAccessPath("SALES", "/views")).toBe(true);
      expect(canRoleAccessPath("SALES", "/customers")).toBe(true);
    });
  });

  describe("getPageAccessKey (路徑轉換為權限鍵值)", () => {
    it("正確辨識工作台、主管看板與設定路徑", () => {
      expect(getPageAccessKey("/dashboard/workbench")).toBe("workbench");
      expect(getPageAccessKey("/dashboard/manager")).toBe("manager");
      expect(getPageAccessKey("/views")).toBe("views");
      expect(getPageAccessKey("/customers")).toBe("customers");
      expect(getPageAccessKey("/admin")).toBe("admin");
      expect(getPageAccessKey("/")).toBe("home");
    });
  });
});
