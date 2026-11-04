import { describe, it, expect, beforeEach } from "vitest";
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
  clearRateLimits,
  IP_MAX_ATTEMPTS,
  ACCOUNT_MAX_FAILURES,
} from "@/lib/rate-limiter";

describe("Login Brute-Force Protection & Rate Limiting (登入端點防暴力破解與限流測試)", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  describe("IP 維度頻率限制", () => {
    it("未超過上限前允許連線", () => {
      const testIp = "192.168.1.101";
      for (let i = 0; i < IP_MAX_ATTEMPTS - 1; i++) {
        recordLoginAttempt(testIp);
        const result = checkLoginRateLimit(testIp);
        expect(result.allowed).toBe(true);
      }
    });

    it(`超過上限 (${IP_MAX_ATTEMPTS} 次) 時應啟動限流攔截並回傳 429 提示與等待秒數`, () => {
      const testIp = "192.168.1.102";
      for (let i = 0; i < IP_MAX_ATTEMPTS; i++) {
        recordLoginAttempt(testIp);
      }

      const result = checkLoginRateLimit(testIp);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("連線嘗試過於頻繁");
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("不同 IP 彼此計數獨立，互不干擾", () => {
      const badIp = "192.168.1.200";
      const goodIp = "192.168.1.201";

      for (let i = 0; i < IP_MAX_ATTEMPTS; i++) {
        recordLoginAttempt(badIp);
      }

      expect(checkLoginRateLimit(badIp).allowed).toBe(false);
      expect(checkLoginRateLimit(goodIp).allowed).toBe(true);
    });
  });

  describe("工號/帳號維度密碼暴力猜測鎖定", () => {
    it(`同一工號連續密碼錯誤達 ${ACCOUNT_MAX_FAILURES} 次時應啟動防護鎖定`, () => {
      const targetEmp = "A2820";

      // 連續 4 次失敗，尚未達鎖定門檻
      for (let i = 0; i < ACCOUNT_MAX_FAILURES - 1; i++) {
        recordLoginFailure(targetEmp);
        const check = checkLoginRateLimit("127.0.0.1", targetEmp);
        expect(check.allowed).toBe(true);
      }

      // 第 5 次失敗，觸發鎖定
      recordLoginFailure(targetEmp);
      const lockedCheck = checkLoginRateLimit("127.0.0.1", targetEmp);
      expect(lockedCheck.allowed).toBe(false);
      expect(lockedCheck.error).toContain("帳號連續登入失敗已達上限，已啟動防護鎖定");
      expect(lockedCheck.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("工號比對支援大小寫不敏感", () => {
      const empLower = "a2835";
      const empUpper = "A2835";

      for (let i = 0; i < ACCOUNT_MAX_FAILURES; i++) {
        recordLoginFailure(empLower);
      }

      // 以大寫查詢同樣判定為鎖定
      const checkUpper = checkLoginRateLimit("127.0.0.1", empUpper);
      expect(checkUpper.allowed).toBe(false);
    });

    it("登入成功應立即重設並清除該帳號累積之失敗計數", () => {
      const emp = "03328";

      // 失敗 3 次
      recordLoginFailure(emp);
      recordLoginFailure(emp);
      recordLoginFailure(emp);

      // 登入成功
      recordLoginSuccess(emp);

      // 接續再失敗 4 次，因已重設計數，不應被鎖定
      for (let i = 0; i < ACCOUNT_MAX_FAILURES - 1; i++) {
        recordLoginFailure(emp);
      }

      const check = checkLoginRateLimit("127.0.0.1", emp);
      expect(check.allowed).toBe(true);
    });
  });
});
