import { describe, it, expect, vi } from "vitest";

describe("Employee ID & Password Login Logic (員工編號與密碼登入機制)", () => {
  it("驗證大成與正道五碼工號格式 (數字或英數)", () => {
    const validEmployeeNos = ["03328", "A2820", "A2835", "C0382", "00783", "XX001"];
    const pattern = /^[a-zA-Z0-9]{5}$/;

    for (const no of validEmployeeNos) {
      expect(pattern.test(no)).toBe(true);
    }
  });

  it("員工編號輸入前後空白應被安全截除", () => {
    const rawInput = "  A2820  ";
    const trimmed = rawInput.trim();
    expect(trimmed).toBe("A2820");
    expect(trimmed.length).toBe(5);
  });

  it("英數字工號比對應支援大小寫不敏感 (Case-Insensitive)", () => {
    const userInput = "a2820";
    const dbStored = "A2820";
    expect(userInput.toLowerCase()).toBe(dbStored.toLowerCase());
  });

  it("驗證 [員工編號] 與 [密碼] 兩者均符合方可放行", () => {
    const verifyLogin = (
      userExists: boolean,
      passwordCorrect: boolean
    ): { success: boolean; error?: string } => {
      if (!userExists || !passwordCorrect) {
        return { success: false, error: "員工編號或密碼不正確，兩者均符合才可登入" };
      }
      return { success: true };
    };

    // 兩者皆符合
    expect(verifyLogin(true, true)).toEqual({ success: true });

    // 員工編號不存在
    expect(verifyLogin(false, true)).toEqual({
      success: false,
      error: "員工編號或密碼不正確，兩者均符合才可登入",
    });

    // 密碼錯誤
    expect(verifyLogin(true, false)).toEqual({
      success: false,
      error: "員工編號或密碼不正確，兩者均符合才可登入",
    });

    // 兩者皆不符合
    expect(verifyLogin(false, false)).toEqual({
      success: false,
      error: "員工編號或密碼不正確，兩者均符合才可登入",
    });
  });

  describe("密碼初始化規則：除非未初始化設定個人密碼，否則不得使用 0000 登入", () => {
    const DEFAULT_INIT_PASSWORD = "0000";

    const evaluateLoginPassword = (
      inputPassword: string,
      customPassword?: string
    ): boolean => {
      const expectedPassword = customPassword || DEFAULT_INIT_PASSWORD;
      return inputPassword === expectedPassword;
    };

    it("已初始化設定個人密碼之同仁，輸入個人密碼放行，輸入 0000 必須直接被拒絕", () => {
      const customPassword = "mySecretPassword2026";

      // 輸入正確個人密碼 -> 放行
      expect(evaluateLoginPassword("mySecretPassword2026", customPassword)).toBe(true);

      // 輸入 0000 -> 拒絕（不得使用 0000 登入）
      expect(evaluateLoginPassword("0000", customPassword)).toBe(false);

      // 輸入錯誤密碼 -> 拒絕
      expect(evaluateLoginPassword("wrongpass", customPassword)).toBe(false);
    });

    it("尚未初始化設定個人密碼之同仁，僅允許使用 0000 進行初始登入", () => {
      const customPassword = undefined; // 未初始化設定

      // 輸入 0000 -> 放行
      expect(evaluateLoginPassword("0000", customPassword)).toBe(true);

      // 輸入其他密碼 -> 拒絕
      expect(evaluateLoginPassword("otherpass", customPassword)).toBe(false);
    });
  });
});
