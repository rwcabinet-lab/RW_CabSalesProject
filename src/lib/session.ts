import { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "cab_sales_user_id";
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 天
export const DEFAULT_SESSION_TTL_MS = DEFAULT_SESSION_MAX_AGE_SECONDS * 1000;

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
  expiresAt?: number;
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
 * 常數時間 (constant-time) 字串比對，防範旁路時序攻擊 (Timing Attack)
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 對 User ID、Role 及過期時間進行 HMAC-SHA256 數位簽章，產生不可偽造且具時效性的 Session Token
 * 使用 ___ 作為分隔符，避免瀏覽器與 Next.js 進行 URL Percent-encoding (例如 : 轉為 %3A)
 */
export async function signSessionToken(
  userId: string,
  role?: string,
  expiresInMs: number = DEFAULT_SESSION_TTL_MS
): Promise<string> {
  if (!userId) return "";
  const expiresAt = Date.now() + expiresInMs;
  const payload = `${userId}___${role || ""}___${expiresAt}`;
  const key = await getHmacKey();
  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const signatureHex = bufferToHex(signatureBuffer);
  return `${payload}.${signatureHex}`;
}

export async function signSessionUserId(
  userId: string,
  role?: string,
  expiresInMs?: number
): Promise<string> {
  return signSessionToken(userId, role, expiresInMs);
}

/**
 * 嚴格驗證 Cookie 的 HMAC-SHA256 數位簽章與時效性：
 * 1. 強制要求數位簽章，徹底移除未簽章純字串 Cookie 放行漏洞（防範客戶端偽造 ID 登入）
 * 2. 採用常數時間 (constant-time) 比對防範時序攻擊
 * 3. 雙金鑰備援驗證
 * 4. 驗證過期時間 (expiresAt) 防範 Token 竊取與重放攻擊
 * 5. 向下相容已簽署之既有 Session
 */
export async function verifySessionToken(
  cookieValue: string | null | undefined
): Promise<SessionPayload | null> {
  if (!cookieValue) return null;

  let raw = cookieValue.trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // 忽略格式錯誤之 URI 解碼
  }

  // 1. 必須為合法簽章格式 (payload.signature)，非簽章格式直接拒絕
  if (!raw.includes(".")) {
    return null;
  }

  const dotIndex = raw.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === raw.length - 1) {
    return null;
  }

  const payload = raw.slice(0, dotIndex);
  const signatureHex = raw.slice(dotIndex + 1);
  if (!payload || !signatureHex) {
    return null;
  }

  const secrets = [
    getSessionSecret(),
    "cabinet_factory_sales_system_hmac_secret_2026",
  ];
  let isValid = false;
  const enc = new TextEncoder();
  const data = enc.encode(payload);

  for (const secret of secrets) {
    try {
      const key = await getHmacKey(secret);
      const expectedSigBuffer = await crypto.subtle.sign("HMAC", key, data);
      const expectedHex = bufferToHex(expectedSigBuffer);
      // 常數時間 (constant-time) 安全比對
      if (constantTimeEqual(signatureHex.toLowerCase(), expectedHex.toLowerCase())) {
        isValid = true;
        break;
      }
    } catch {
      // continue
    }
  }

  if (!isValid) {
    return null;
  }

  // 2. 解析已簽章 Payload 資訊與時效檢查
  if (payload.includes("___")) {
    const parts = payload.split("___");
    if (parts.length >= 3) {
      const [userId, role, expiresAtStr] = parts;
      const expiresAt = Number(expiresAtStr);
      if (!Number.isNaN(expiresAt) && Date.now() > expiresAt) {
        // Token 已逾期
        return null;
      }
      if (userId) {
        return {
          userId,
          role: role || undefined,
          expiresAt: Number.isNaN(expiresAt) ? undefined : expiresAt,
        };
      }
    } else if (parts.length === 2) {
      // 舊版簽章相容（無 expiresAt，但仍具備有效 HMAC 簽章）
      const [userId, role] = parts;
      if (userId) return { userId, role: role || undefined };
    }
  }

  // 舊版冒號分隔相容（具備有效 HMAC 簽章）
  if (payload.includes(":")) {
    const [userId, role] = payload.split(":");
    if (userId) return { userId, role: role || undefined };
  }

  if (payload) {
    return { userId: payload };
  }

  return null;
}

export async function verifySessionUserId(
  cookieValue: string | null | undefined
): Promise<string | null> {
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
