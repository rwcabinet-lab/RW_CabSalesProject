/**
 * 登入端點防暴力破解與連線限流機制 (Login Rate Limiter)
 * 1. IP 維度：防止單一 IP 短時間內發動分散式掃描或撞庫（1 分鐘至多 10 次嘗試）
 * 2. 帳號維度：防止針對特定員工編號進行密碼字典暴力破解（15 分鐘內連續失敗 5 次即鎖定 15 分鐘）
 * 3. 登入成功時：自動重設該帳號之失敗計數器
 */

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

export const IP_WINDOW_MS = 60 * 1000; // 1 分鐘
export const IP_MAX_ATTEMPTS = 10; // 1 分鐘至多 10 次

export const ACCOUNT_WINDOW_MS = 15 * 60 * 1000; // 15 分鐘
export const ACCOUNT_MAX_FAILURES = 5; // 連續 5 次失敗
export const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000; // 鎖定 15 分鐘

const globalForRateLimit = globalThis as unknown as {
  loginIpAttempts?: Map<string, AttemptRecord>;
  loginAccountFailures?: Map<string, AttemptRecord>;
};

const ipAttempts = globalForRateLimit.loginIpAttempts ?? new Map<string, AttemptRecord>();
const accountFailures = globalForRateLimit.loginAccountFailures ?? new Map<string, AttemptRecord>();

globalForRateLimit.loginIpAttempts = ipAttempts;
globalForRateLimit.loginAccountFailures = accountFailures;

export interface RateLimitResult {
  allowed: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

/**
 * 檢查當前請求 IP 與目標工號是否處於限流或安全鎖定狀態
 */
export function checkLoginRateLimit(ip: string, employeeNo?: string): RateLimitResult {
  const now = Date.now();

  // 1. IP 維度檢查
  const ipKey = ip.trim() || "unknown";
  const ipRecord = ipAttempts.get(ipKey);
  if (ipRecord) {
    if (now - ipRecord.firstAttemptAt < IP_WINDOW_MS) {
      if (ipRecord.count >= IP_MAX_ATTEMPTS) {
        const retryAfterSeconds = Math.max(1, Math.ceil((ipRecord.firstAttemptAt + IP_WINDOW_MS - now) / 1000));
        return {
          allowed: false,
          error: `連線嘗試過於頻繁，為維護安全，請於 ${retryAfterSeconds} 秒後重試`,
          retryAfterSeconds,
        };
      }
    } else {
      ipAttempts.delete(ipKey);
    }
  }

  // 2. 帳號/工號維度失敗鎖定檢查
  if (employeeNo) {
    const accKey = employeeNo.trim().toLowerCase();
    const accRecord = accountFailures.get(accKey);
    if (accRecord) {
      if (accRecord.lockedUntil && now < accRecord.lockedUntil) {
        const retryAfterSeconds = Math.max(1, Math.ceil((accRecord.lockedUntil - now) / 1000));
        const retryMinutes = Math.ceil(retryAfterSeconds / 60);
        return {
          allowed: false,
          error: `帳號連續登入失敗已達上限，已啟動防護鎖定，請於 ${retryMinutes} 分鐘後再試`,
          retryAfterSeconds,
        };
      }
      if (now - accRecord.firstAttemptAt >= ACCOUNT_WINDOW_MS) {
        accountFailures.delete(accKey);
      }
    }
  }

  return { allowed: true };
}

/**
 * 記錄一次登入請求（用於 IP 維度計數）
 */
export function recordLoginAttempt(ip: string): void {
  const now = Date.now();
  const ipKey = ip.trim() || "unknown";
  const ipRecord = ipAttempts.get(ipKey);

  if (!ipRecord || now - ipRecord.firstAttemptAt >= IP_WINDOW_MS) {
    ipAttempts.set(ipKey, { count: 1, firstAttemptAt: now });
  } else {
    ipRecord.count += 1;
  }
}

/**
 * 記錄一次登入失敗（用於帳號防暴力猜測計數）
 */
export function recordLoginFailure(employeeNo?: string): void {
  if (!employeeNo) return;
  const now = Date.now();
  const accKey = employeeNo.trim().toLowerCase();
  const accRecord = accountFailures.get(accKey);

  if (!accRecord || now - accRecord.firstAttemptAt >= ACCOUNT_WINDOW_MS) {
    accountFailures.set(accKey, { count: 1, firstAttemptAt: now });
  } else {
    accRecord.count += 1;
    if (accRecord.count >= ACCOUNT_MAX_FAILURES) {
      accRecord.lockedUntil = now + ACCOUNT_LOCKOUT_MS;
    }
  }
}

/**
 * 登入成功時，立即清除該帳號累積之失敗計數與鎖定
 */
export function recordLoginSuccess(employeeNo?: string): void {
  if (!employeeNo) return;
  accountFailures.delete(employeeNo.trim().toLowerCase());
}

/**
 * 清除所有限流狀態（供測試與系統維護使用）
 */
export function clearRateLimits(): void {
  ipAttempts.clear();
  accountFailures.clear();
}
