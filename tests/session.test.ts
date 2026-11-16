import { describe, it, expect } from "vitest";
import {
  signSessionToken,
  signSessionUserId,
  verifySessionToken,
  verifySessionUserId,
} from "@/lib/session";

describe("Session HMAC Security & Verification (憑證簽章與安全性防護)", () => {
  it("正常對 User ID 與 Role 進行簽章並成功驗證", async () => {
    const token = await signSessionUserId("USER_01", "SALES");
    expect(token).toContain("___");
    expect(token).toContain(".");

    const session = await verifySessionToken(token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("USER_01");
    expect(session?.role).toBe("SALES");
    expect(typeof session?.expiresAt).toBe("number");
  });

  it("提取已驗證之 User ID", async () => {
    const token = await signSessionUserId("ADMIN_MASTER", "ADMIN");
    const userId = await verifySessionUserId(token);
    expect(userId).toBe("ADMIN_MASTER");
  });

  it("竄改 Payload 內容應直接遭拒絕 (驗證失敗回傳 null)", async () => {
    const validToken = await signSessionUserId("USER_01", "SALES");
    const [payload, sig] = validToken.split(".");

    // 企圖將角色偽造竄改為 ADMIN
    const tamperedPayload = payload.replace("SALES", "ADMIN");
    const tamperedToken = `${tamperedPayload}.${sig}`;

    const session = await verifySessionToken(tamperedToken);
    expect(session).toBeNull();
  });

  it("竄改數位簽章雜湊應遭拒絕", async () => {
    const validToken = await signSessionUserId("USER_01", "SALES");
    const [payload, sig] = validToken.split(".");

    // 竄改簽章最後一位
    const forgedSig = sig.slice(0, -1) + (sig.slice(-1) === "a" ? "b" : "a");
    const forgedToken = `${payload}.${forgedSig}`;

    const session = await verifySessionToken(forgedToken);
    expect(session).toBeNull();
  });

  it("已逾期之 Token (過期時間小於 Date.now()) 應遭拒絕", async () => {
    // 建立 10 秒前已逾期之 Token
    const expiredToken = await signSessionToken("EXPIRED_USER", "SALES", -10000);
    const session = await verifySessionToken(expiredToken);
    expect(session).toBeNull();
  });

  it("支援 RFC 6265 瀏覽器外層雙引號包裹", async () => {
    const token = await signSessionUserId("QUOTED_USER", "ASSISTANT");
    const quotedToken = `"${token}"`;

    const session = await verifySessionToken(quotedToken);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("QUOTED_USER");
    expect(session?.role).toBe("ASSISTANT");
  });

  it("拒絕無效期 (expiresAt) 之舊版 2 段式簽章與冒號格式 Token", async () => {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(process.env.SESSION_SECRET!),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const legacyPayload = "LEGACY_USER___ADMIN";
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(legacyPayload));
    const sigHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(await verifySessionToken(`${legacyPayload}.${sigHex}`)).toBeNull();
  });

  it("拒絕以公開舊備援密鑰偽造簽發之 Token", async () => {
    const leakedSecret = "cabinet_factory_sales_system_hmac_secret_2026";
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(leakedSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const payload = `ADMIN_MASTER___ADMIN___${Date.now() + 60_000}`;
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const sigHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(await verifySessionToken(`${payload}.${sigHex}`)).toBeNull();
  });

  it("未設定 SESSION_SECRET / AUTH_SECRET 時拒絕簽發 Token", async () => {
    const originalSessionSecret = process.env.SESSION_SECRET;
    const originalAuthSecret = process.env.AUTH_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      await expect(signSessionUserId("USER_01", "SALES")).rejects.toThrow();
    } finally {
      process.env.SESSION_SECRET = originalSessionSecret;
      if (originalAuthSecret !== undefined) process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it("非合法簽章格式（未簽章字串）直接拒絕", async () => {
    expect(await verifySessionToken("PLAIN_USER_ID")).toBeNull();
    expect(await verifySessionToken("ADMIN_00___ADMIN")).toBeNull();
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });
});
