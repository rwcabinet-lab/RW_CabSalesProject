import { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "cab_sales_user_id";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  "cabinet_factory_sales_system_hmac_secret_2026";

export interface SessionPayload {
  userId: string;
  role?: string;
}

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(SESSION_SECRET),
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
 */
export async function signSessionToken(userId: string, role?: string): Promise<string> {
  if (!userId) return "";
  const payload = role ? `${userId}:${role}` : userId;
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
 */
export async function verifySessionToken(cookieValue: string | null | undefined): Promise<SessionPayload | null> {
  if (!cookieValue) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 2) {
    // 過渡相容：若為既有登入的標準 cuid 格式 (c 開頭接英數字)，暫時允許通過
    if (/^c[a-z0-9]{20,32}$/.test(cookieValue)) {
      return { userId: cookieValue };
    }
    return null;
  }

  const [payload, signatureHex] = parts;
  if (!payload || !signatureHex) return null;

  try {
    const key = await getHmacKey();
    const enc = new TextEncoder();
    const expectedSigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    const expectedHex = bufferToHex(expectedSigBuffer);
    if (signatureHex === expectedHex) {
      if (payload.includes(":")) {
        const [userId, role] = payload.split(":");
        return { userId, role };
      }
      return { userId: payload };
    }
    return null;
  } catch (err) {
    console.error("Session verification failed:", err);
    return null;
  }
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
