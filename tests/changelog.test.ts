import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_CHANGELOG,
  CHANGELOG_CATEGORY_CONFIG,
  ChangelogEntry,
} from "@/lib/changelog";
import { GET, POST, PUT, DELETE } from "@/app/api/changelog/route";
import { NextRequest } from "next/server";
import * as accessControl from "@/lib/access-control";
import { DataService } from "@/lib/data-service";

describe("改版資訊功能測試 (Changelog Feature Tests)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("預設改版資料結構與完整性 (Default Changelog Integrity)", () => {
    it("預設改版資料應包含有效陣列且數量大於等於 10 筆", () => {
      expect(Array.isArray(DEFAULT_CHANGELOG)).toBe(true);
      expect(DEFAULT_CHANGELOG.length).toBeGreaterThanOrEqual(10);
    });

    it("每筆改版紀錄皆具備完整必填欄位 (id, version, date, title, category, details)", () => {
      for (const item of DEFAULT_CHANGELOG) {
        expect(item.id).toBeTruthy();
        expect(item.version).toMatch(/^v\d+\.\d+\.\d+/);
        expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(item.title).toBeTruthy();
        expect(["FEAT", "RULE", "OPTIMIZE", "FIX"]).toContain(item.category);
        expect(Array.isArray(item.details)).toBe(true);
        expect(item.details.length).toBeGreaterThan(0);
      }
    });

    it("四種改版類別皆具備標準中文標籤與樣式設定", () => {
      expect(CHANGELOG_CATEGORY_CONFIG.FEAT.label).toBe("功能新增");
      expect(CHANGELOG_CATEGORY_CONFIG.RULE.label).toBe("業務規則");
      expect(CHANGELOG_CATEGORY_CONFIG.OPTIMIZE.label).toBe("體驗優化");
      expect(CHANGELOG_CATEGORY_CONFIG.FIX.label).toBe("系統修復");
    });
  });

  describe("API 存取權限與 RBAC 檢驗 (API RBAC & Validation)", () => {
    it("未登入使用者呼叫 GET /api/changelog 應回傳 401", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/changelog");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("登入之一般使用者 (業務) 可成功檢視改版紀錄", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-sales",
        name: "一般業務",
        role: "SALES",
        email: "sales@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(DataService, "getAppConfig").mockResolvedValue(DEFAULT_CHANGELOG);

      const req = new NextRequest("http://localhost:3000/api/changelog");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.changelogs)).toBe(true);
      expect(json.changelogs.length).toBeGreaterThan(0);
    });

    it("非管理者身分 (SALES) 呼叫 POST 新增改版資訊應被攔截回傳 403", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-sales",
        name: "一般業務",
        role: "SALES",
        email: "sales@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/changelog", {
        method: "POST",
        body: JSON.stringify({
          version: "v9.9.9",
          date: "2026-11-11",
          title: "非管理者嘗試新增",
          category: "FEAT",
          details: ["測試項目"],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("僅系統管理者身分可直接新增或編輯改版資訊內容");
    });

    it("非管理者身分 (LEVEL_MANAGER) 呼叫 PUT 編輯改版資訊應被攔截回傳 403", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-mgr",
        name: "理級主管",
        role: "LEVEL_MANAGER",
        email: "mgr@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/changelog", {
        method: "PUT",
        body: JSON.stringify({
          id: "cl-test",
          version: "v9.9.9",
          date: "2026-11-11",
          title: "主管嘗試編輯",
          category: "FEAT",
          details: ["測試項目"],
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(403);
    });

    it("非管理者身分 (ASSISTANT) 呼叫 DELETE 刪除改版資訊應被攔截回傳 403", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-asst",
        name: "業務助理",
        role: "ASSISTANT",
        email: "asst@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/changelog?id=cl-test", {
        method: "DELETE",
      });

      const res = await DELETE(req);
      expect(res.status).toBe(403);
    });

    it("管理者身分呼叫 POST 缺少必填參數應回傳 400", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-admin",
        name: "系統管理員",
        role: "ADMIN",
        email: "admin@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/changelog", {
        method: "POST",
        body: JSON.stringify({
          version: "", // 缺少版本號
          date: "2026-11-11",
          title: "測試缺少參數",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("必填項目");
    });

    it("管理者身分可成功新增改版紀錄，且新版本自動排列於第一位", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-admin",
        name: "系統管理員",
        role: "ADMIN",
        email: "admin@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      let storedConfig = [...DEFAULT_CHANGELOG];
      vi.spyOn(DataService, "getAppConfig").mockImplementation(async () => storedConfig);
      vi.spyOn(DataService, "setAppConfig").mockImplementation(async (_key, val) => {
        storedConfig = val as ChangelogEntry[];
        return { id: "global", key: "system_changelog", value: JSON.stringify(val), createdAt: new Date(), updatedAt: new Date() };
      });

      const req = new NextRequest("http://localhost:3000/api/changelog", {
        method: "POST",
        body: JSON.stringify({
          version: "v2.0.0",
          date: "2026-11-12",
          title: "全站次世代架構升級",
          category: "FEAT",
          details: ["第一項更新", "第二項更新"],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.changelogs[0].version).toBe("v2.0.0");
      expect(json.changelogs[0].title).toBe("全站次世代架構升級");
      expect(json.latestVersion).toBe("v2.0.0");
    });

    it("管理者呼叫 POST reset 動作可成功還原初始預設改版紀錄", async () => {
      vi.spyOn(accessControl, "getUserFromRequest").mockResolvedValue({
        id: "u-admin",
        name: "系統管理員",
        role: "ADMIN",
        email: "admin@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const setAppConfigSpy = vi.spyOn(DataService, "setAppConfig").mockResolvedValue({
        id: "global",
        key: "system_changelog",
        value: JSON.stringify(DEFAULT_CHANGELOG),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = new NextRequest("http://localhost:3000/api/changelog", {
        method: "POST",
        body: JSON.stringify({ action: "reset" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("已成功回復系統初始改版紀錄");
      expect(setAppConfigSpy).toHaveBeenCalledWith("system_changelog", DEFAULT_CHANGELOG);
    });
  });
});
