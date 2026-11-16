import { describe, it, expect } from "vitest";
import {
  clearPasswordChanged,
  generateInitialPassword,
  hashPassword,
  hasUserChangedPassword,
  isPasswordHashed,
  markPasswordChanged,
  validateNewPassword,
  verifyPassword,
} from "@/lib/password";
import { isManagerRole } from "@/lib/access-control";

describe("Password Security & Salted Hashing (密碼雜湊與強度防護)", () => {
  it("使用 scrypt 產生含隨機鹽值之雜湊，同密碼每次輸出不同且可正確驗證", () => {
    const hash1 = hashPassword("CabSales2026");
    const hash2 = hashPassword("CabSales2026");

    expect(isPasswordHashed(hash1)).toBe(true);
    expect(isPasswordHashed(hash2)).toBe(true);
    expect(hash1).not.toBe(hash2);

    expect(verifyPassword("CabSales2026", hash1)).toEqual({ valid: true, needsRehash: false });
    expect(verifyPassword("CabSales2026", hash2)).toEqual({ valid: true, needsRehash: false });
    expect(verifyPassword("WrongPass123", hash1)).toEqual({ valid: false, needsRehash: false });
  });

  it("向下相容舊版明文密碼並在驗證成功時標記 needsRehash 以便自動升級", () => {
    const legacyStored = "oldPlain123";
    expect(isPasswordHashed(legacyStored)).toBe(false);
    expect(verifyPassword("oldPlain123", legacyStored)).toEqual({ valid: true, needsRehash: true });
    expect(verifyPassword("wrong", legacyStored)).toEqual({ valid: false, needsRehash: false });
  });

  it("未設定密碼之帳號（undefined / null / 空字串）一律拒絕登入，不退回 0000", () => {
    expect(verifyPassword("0000", undefined)).toEqual({ valid: false, needsRehash: false });
    expect(verifyPassword("0000", null)).toEqual({ valid: false, needsRehash: false });
    expect(verifyPassword("0000", "")).toEqual({ valid: false, needsRehash: false });
  });

  it("新密碼強度驗證：至少 8 碼且同時包含英文字母與數字", () => {
    expect(validateNewPassword("")).not.toBeNull();
    expect(validateNewPassword("0000")).not.toBeNull();
    expect(validateNewPassword("abc1234")).not.toBeNull(); // 7 碼
    expect(validateNewPassword("12345678")).not.toBeNull(); // 純數字
    expect(validateNewPassword("abcdefgh")).not.toBeNull(); // 純英文
    expect(validateNewPassword("a1".repeat(65))).not.toBeNull(); // 超過 128 碼

    expect(validateNewPassword("Cab20268")).toBeNull();
    expect(validateNewPassword("rw#12345")).toBeNull();
  });

  it("自動產生之隨機初始密碼均通過密碼強度規則", () => {
    for (let i = 0; i < 10; i++) {
      const initPw = generateInitialPassword();
      expect(initPw.length).toBe(10);
      expect(validateNewPassword(initPw)).toBeNull();
    }
  });

  it("正確識別主管層級與非主管層級角色", () => {
    expect(isManagerRole("ADMIN")).toBe(true);
    expect(isManagerRole("LEVEL_MANAGER")).toBe(true);
    expect(isManagerRole("SALES_MANAGER")).toBe(true);
    expect(isManagerRole("SALES")).toBe(false);
    expect(isManagerRole("ASSISTANT")).toBe(false);
    expect(isManagerRole("SITE_ENGINEER")).toBe(false);
    expect(isManagerRole(undefined)).toBe(false);
  });

  it("追蹤帳號是否尚未自主變更密碼（建立/重設後待變更，改密後解除）", () => {
    // 1. 尚未變更過密碼的帳號應回傳 false（即 mustChangePassword = true）
    expect(hasUserChangedPassword("u1", "03328", {})).toBe(false);
    expect(hasUserChangedPassword("u1", "03328", undefined)).toBe(false);

    // 2. 使用者自主改密後應標記為已變更，並清除舊版 email 鍵值
    const legacyMap = { "03328": "2026-10-01T00:00:00.000Z" };
    const afterChange = markPasswordChanged(legacyMap, "u1", "03328", "2026-11-16T08:00:00.000Z");
    expect(hasUserChangedPassword("u1", "03328", afterChange)).toBe(true);
    expect(afterChange["03328"]).toBeUndefined();
    expect(afterChange["u1"]).toBe("2026-11-16T08:00:00.000Z");

    // 3. 管理員重設他人密碼後應清除改密標記，促使其登入後重新改密
    const afterAdminReset = clearPasswordChanged(afterChange, "u1", "03328");
    expect(hasUserChangedPassword("u1", "03328", afterAdminReset)).toBe(false);
  });
});
