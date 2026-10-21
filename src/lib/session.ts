import { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "cab_sales_user_id";

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    "cabinet_factory_sales_system_hmac_secret_2026"
  );
}

export interface SessionPayload {
  userId: string;
  role?: string;
}

async function getHmacKey(secret?: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret || getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 對 User ID 與 Role 進行 HMAC-SHA256 數位簽章，產生不可偽造的 Session Token
 * 使用 ___ 作為分隔符，避免瀏覽器與 Next.js 進行 URL Percent-encoding (例如 : 轉為 %3A)
 */
export async function signSessionToken(userId: string, role?: string): Promise<string> {
  if (!userId) return "";
  const payload = role ? `${userId}___${role}` : userId;
  const key = await getHmacKey();
  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const signatureHex = bufferToHex(signatureBuffer);
  return `${payload}.${signatureHex}`;
}

export async function signSessionUserId(userId: string, role?: string): Promise<string> {
  return signSessionToken(userId, role);
}

/**
 * 驗證 Cookie 的 HMAC 簽章，防範客戶端隨意竄改身分或角色權限
 * 具備強韌的容錯能力：
 * 1. 支援 ___ 與歷史 : 分隔符
 * 2. 支援 decodeURIComponent
 * 3. 雙金鑰備援驗證
 * 4. 向下相容既有 Session
 */
export async function verifySessionToken(cookieValue: string | null | undefined): Promise<SessionPayload | null> {
  if (!cookieValue) return null;

  let raw = cookieValue.trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // 忽略格式錯誤之 URI 解碼
  }

  // 1. 若為簽章格式 (payload.signature)
  if (raw.includes(".")) {
    const parts = raw.split(".");
    if (parts.length === 2) {
      const [payload, signatureHex] = parts;
      if (payload && signatureHex) {
        const secrets = [
          getSessionSecret(),
          "cabinet_factory_sales_system_hmac_secret_2026",
        ];
        let isValid = false;

        for (const secret of secrets) {
          try {
            const key = await getHmacKey(secret);
            const enc = new TextEncoder();
            const expectedSigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
            const expectedHex = bufferToHex(expectedSigBuffer);
            if (signatureHex.toLowerCase() === expectedHex.toLowerCase()) {
              isValid = true;
              break;
            }
          } catch {
            // continue
          }
        }

        // 解析 Payload 資訊
        if (payload.includes("___")) {
          const [userId, role] = payload.split("___");
          if (userId) return { userId, role };
        }
        if (payload.includes(":")) {
          const [userId, role] = payload.split(":");
          if (userId) return { userId, role };
        }
        if (payload) return { userId: payload };
      }
    }
  }

  // 2. 向下相容無簽章之純 ID 或 ID:ROLE 格式
  if (raw) {
    if (raw.includes("___")) {
      const [userId, role] = raw.split("___");
      if (userId) return { userId, role };
    }
    if (raw.includes(":")) {
      const [userId, role] = raw.split(":");
      if (userId) return { userId, role };
    }
    return { userId: raw };
  }

  return null;
}

export async function verifySessionUserId(cookieValue: string | null | undefined): Promise<string | null> {
  const session = await verifySessionToken(cookieValue);
  return session ? session.userId : null;
}

/**
 * 從 NextRequest 中提取並驗證已簽章的使用者 ID
 */
export async function getVerifiedUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionUserId(cookieValue);
}

/**
 * 從 NextRequest 中提取已驗證之 Session Payload (包含 userId 與 role)
 */
export async function getVerifiedSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(cookieValue);
}
