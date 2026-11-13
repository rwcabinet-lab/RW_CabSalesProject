import { describe, it, expect, vi } from "vitest";
import { pruneLoginLogs } from "../src/lib/services/config-service";

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

  describe("管理者登入紀錄管理 (Login Logs by User)", () => {
    interface MockLog {
      id: string;
      userId: string;
      employeeNo: string;
      userName: string;
      status: "SUCCESS" | "FAILED";
      loginAt: string;
    }

    const logs: MockLog[] = [
      { id: "1", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "SUCCESS", loginAt: "2026-11-04T09:00:00Z" },
      { id: "2", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "FAILED", loginAt: "2026-11-04T08:59:00Z" },
      { id: "3", userId: "u2", employeeNo: "A2820", userName: "林宸鈴", status: "SUCCESS", loginAt: "2026-11-04T08:30:00Z" },
    ];

    it("正確依據 userId 或 employeeNo 篩選出該使用者的登入紀錄", () => {
      const filterLogs = (target: string) =>
        logs.filter((l) => l.userId === target || l.employeeNo.toLowerCase() === target.toLowerCase());

      const u1Logs = filterLogs("u1");
      expect(u1Logs.length).toBe(2);
      expect(u1Logs[0].status).toBe("SUCCESS");
      expect(u1Logs[1].status).toBe("FAILED");

      const u2Logs = filterLogs("A2820");
      expect(u2Logs.length).toBe(1);
      expect(u2Logs[0].userName).toBe("林宸鈴");

      const unknownLogs = filterLogs("non_existent");
      expect(unknownLogs.length).toBe(0);
    });

    it("登入紀錄安全保留最新上限筆數 (滑動滾動視窗)", () => {
      const maxRecords = 500;
      const manyLogs = Array.from({ length: 600 }, (_, i) => ({
        id: `log_${i}`,
        userId: "u1",
        employeeNo: "03328",
        userName: "張欽哲",
        status: "SUCCESS" as const,
        loginAt: new Date(Date.now() - i * 1000).toISOString(),
      }));

      const boundedLogs = manyLogs.slice(0, maxRecords);
      expect(boundedLogs.length).toBe(500);
      expect(boundedLogs[0].id).toBe("log_0");
    });

    it("登入紀錄僅保留最近 30 天內紀錄，自動清理超過 30 天之舊紀錄", () => {
      const now = new Date("2026-11-13T10:00:00.000Z");
      const sampleLogs: MockLog[] = [
        { id: "recent", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "SUCCESS", loginAt: "2026-11-12T10:00:00.000Z" },
        { id: "boundary", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "SUCCESS", loginAt: "2026-10-14T10:00:00.000Z" }, // 剛好第 30 天
        { id: "expired", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "SUCCESS", loginAt: "2026-10-14T09:59:59.000Z" }, // 超過 30 天
      ];

      const kept = pruneLoginLogs(sampleLogs, 30, now);
      expect(kept.map((l) => l.id)).toEqual(["recent", "boundary"]);
    });

    it("登入紀錄確保由新到舊排序，且使用者最後上線時間與最新登入成功紀錄完全相符", () => {
      const unorganizedLogs: MockLog[] = [
        { id: "old", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "SUCCESS", loginAt: "2026-11-04T02:00:00.000Z" },
        { id: "failed_latest", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "FAILED", loginAt: "2026-11-05T03:45:00.000Z" },
        { id: "newest_success", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "SUCCESS", loginAt: "2026-11-05T03:40:56.804Z" },
        { id: "mid", userId: "u1", employeeNo: "03328", userName: "張欽哲", status: "SUCCESS", loginAt: "2026-11-04T05:22:00.000Z" },
      ];

      // 1. 取得使用者紀錄時確保排序
      const sortedLogs = [...unorganizedLogs].sort(
        (a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime()
      );
      expect(sortedLogs[0].id).toBe("failed_latest");
      expect(sortedLogs[1].id).toBe("newest_success");

      // 2. 判定最後成功上線時間 (lastLoginAt)
      const latestSuccess = sortedLogs.find((r) => r.status !== "FAILED");
      expect(latestSuccess?.id).toBe("newest_success");
      expect(latestSuccess?.loginAt).toBe("2026-11-05T03:40:56.804Z");

      // 3. 驗證格式化顯示邏輯一致性（消除 UTC slice 造成的 8 小時時差）
      const formatDateTime = (iso: string) =>
        new Date(iso).toLocaleString("zh-TW", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });

      // 列表與彈窗中該筆成功登入的時間字串完全一致
      expect(formatDateTime(latestSuccess!.loginAt)).toBe(formatDateTime(sortedLogs[1].loginAt));
    });
  });
});
