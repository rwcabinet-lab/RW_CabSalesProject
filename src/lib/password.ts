import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";

const SCRYPT_PREFIX = "scrypt$";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_CHANGED_CONFIG_KEY = "user_password_changed";

export type PasswordChangedMap = Record<string, string | boolean>;

/**
 * 判斷指定使用者是否已自行變更過個人密碼
 */
export function hasUserChangedPassword(
  userId: string,
  email: string | null | undefined,
  changedMap: PasswordChangedMap | null | undefined
): boolean {
  if (!changedMap) return false;
  if (changedMap[userId]) return true;
  if (email && changedMap[email]) return true;
  return false;
}

/**
 * 標記使用者已完成自主密碼變更（並清理舊版 email 鍵值）
 */
export function markPasswordChanged(
  changedMap: PasswordChangedMap,
  userId: string,
  email?: string | null,
  changedAt: string = new Date().toISOString()
): PasswordChangedMap {
  const next: PasswordChangedMap = { ...changedMap, [userId]: changedAt };
  if (email && email !== userId && email in next) {
    delete next[email];
  }
  return next;
}

/**
 * 清除使用者的自主改密紀錄（例如管理員新增帳號或重設他人密碼後）
 */
export function clearPasswordChanged(
  changedMap: PasswordChangedMap,
  userId: string,
  email?: string | null
): PasswordChangedMap {
  const next: PasswordChangedMap = { ...changedMap };
  delete next[userId];
  if (email && email !== userId) {
    delete next[email];
  }
  return next;
}

/**
 * 檢查密碼字串是否已為 scrypt 加鹽雜湊格式 (scrypt$<saltHex>$<hashHex>)
 */
export function isPasswordHashed(stored: string): boolean {
  if (!stored.startsWith(SCRYPT_PREFIX)) return false;
  const parts = stored.split("$");
  return (
    parts.length === 3 &&
    /^[0-9a-f]+$/i.test(parts[1]) &&
    /^[0-9a-f]+$/i.test(parts[2])
  );
}

/**
 * 使用 Node.js 內建 scrypt 與隨機 16 bytes salt 產生密碼雜湊
 */
export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = scryptSync(plainPassword, salt, KEY_LENGTH).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

/**
 * 常數時間比對兩個字串之 SHA-256 摘要，避免長度洩漏與時序攻擊
 */
function constantTimeStringEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * 驗證使用者輸入之密碼是否與資料庫紀錄相符。
 * 若資料庫紀錄仍為舊版明文密碼，於比對通過時回傳 needsRehash: true 以便無痛自動升級為 scrypt 雜湊。
 */
export function verifyPassword(
  plainPassword: string,
  storedPassword?: string | null
): { valid: boolean; needsRehash: boolean } {
  if (!plainPassword || !storedPassword) {
    return { valid: false, needsRehash: false };
  }

  if (isPasswordHashed(storedPassword)) {
    const [, salt, hashHex] = storedPassword.split("$");
    try {
      const derived = scryptSync(plainPassword, salt, KEY_LENGTH);
      const expected = Buffer.from(hashHex, "hex");
      if (derived.length !== expected.length) {
        return { valid: false, needsRehash: false };
      }
      return {
        valid: timingSafeEqual(derived, expected),
        needsRehash: false,
      };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // 向下相容舊版明文密碼：以常數時間比對，通過後立即觸發原地升級雜湊
  const valid = constantTimeStringEqual(plainPassword, storedPassword);
  return { valid, needsRehash: valid };
}

/**
 * 校驗新密碼強度：至少 8 碼、最多 128 碼，且須同時包含英文字母與數字
 */
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== "string" || !password) {
    return "請輸入新密碼";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `新密碼長度至少需 ${MIN_PASSWORD_LENGTH} 碼以上`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `新密碼長度不可超過 ${MAX_PASSWORD_LENGTH} 碼`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "新密碼須同時包含英文字母與數字";
  }
  return null;
}

/**
 * 為新建立帳號產生高強度隨機初始密碼（10 碼英數混合，排除易混淆字元）
 */
export function generateInitialPassword(length = 10): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;

  const chars: string[] = [
    letters[randomBytes(1)[0] % letters.length],
    digits[randomBytes(1)[0] % digits.length],
  ];
  while (chars.length < length) {
    chars.push(all[randomBytes(1)[0] % all.length]);
  }
  // Fisher-Yates 洗牌
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
