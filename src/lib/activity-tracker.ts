import { prisma } from "./prisma";

export const USER_ACTIVITY_CONFIG_PREFIX = "user_activity_";
export const USER_ACTIVITY_RETENTION_DAYS = 30;
export const USER_ACTIVITY_THROTTLE_MS = 10 * 60 * 1000; // 10 分鐘節流冷卻

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface UserActivityRecord {
  lastActiveAt: string;
  dailyStats: Record<string, number>;
}

export interface UserActivitySummary {
  lastActiveAt: string | null;
  activeDays7d: number;
  activeDays30d: number;
  activeHits30d: number;
}

const globalForActivity = globalThis as unknown as {
  userActivityThrottleMap?: Map<string, { lastRecordedMs: number; lastDateKey: string }>;
};

const userActivityThrottleMap =
  globalForActivity.userActivityThrottleMap ??
  (globalForActivity.userActivityThrottleMap = new Map<string, { lastRecordedMs: number; lastDateKey: string }>());

/**
 * 取得台灣時間 (UTC+8) 的 YYYY-MM-DD 日期鍵值
 */
export function getTaipeiDateKey(date: Date = new Date()): string {
  return new Date(date.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 計算保留天數的起始日期鍵值（含今日共 retentionDays 天）
 */
export function getCutoffDateKey(
  retentionDays: number = USER_ACTIVITY_RETENTION_DAYS,
  now: Date = new Date(),
): string {
  const safeDays = Math.max(1, Math.floor(retentionDays));
  const cutoffDate = new Date(now.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000);
  return getTaipeiDateKey(cutoffDate);
}

/**
 * 清理超過保留天數（預設 30 天）的每日活躍統計
 */
export function pruneDailyStats(
  dailyStats: Record<string, number> | null | undefined,
  retentionDays: number = USER_ACTIVITY_RETENTION_DAYS,
  now: Date = new Date(),
): Record<string, number> {
  if (!dailyStats || typeof dailyStats !== "object") return {};
  const cutoffKey = getCutoffDateKey(retentionDays, now);
  const pruned: Record<string, number> = {};

  for (const [dateKey, count] of Object.entries(dailyStats)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    if (dateKey < cutoffKey) continue;
    if (typeof count === "number" && Number.isFinite(count) && count > 0) {
      pruned[dateKey] = Math.floor(count);
    }
  }
  return pruned;
}

/**
 * 彙算單一使用者的最後在線時間與近 7 / 30 天活躍統計
 */
export function computeActivitySummary(
  record: UserActivityRecord | null | undefined,
  fallbackLastLoginAt?: string | null,
  now: Date = new Date(),
): UserActivitySummary {
  const pruned = pruneDailyStats(record?.dailyStats, USER_ACTIVITY_RETENTION_DAYS, now);
  const cutoff7d = getCutoffDateKey(7, now);
  const cutoff30d = getCutoffDateKey(USER_ACTIVITY_RETENTION_DAYS, now);

  let activeDays7d = 0;
  let activeDays30d = 0;
  let activeHits30d = 0;

  for (const [dateKey, count] of Object.entries(pruned)) {
    if (count <= 0) continue;
    if (dateKey >= cutoff30d) {
      activeDays30d += 1;
      activeHits30d += count;
    }
    if (dateKey >= cutoff7d) {
      activeDays7d += 1;
    }
  }

  let lastActiveAt: string | null = record?.lastActiveAt || fallbackLastLoginAt || null;
  if (record?.lastActiveAt && fallbackLastLoginAt) {
    const activeMs = new Date(record.lastActiveAt).getTime();
    const loginMs = new Date(fallbackLastLoginAt).getTime();
    if (!Number.isNaN(loginMs) && (Number.isNaN(activeMs) || loginMs > activeMs)) {
      lastActiveAt = fallbackLastLoginAt;
    }
  }

  return {
    lastActiveAt,
    activeDays7d,
    activeDays30d,
    activeHits30d,
  };
}

/**
 * 判斷是否通過記憶體節流條件（超過冷卻時間或已跨台灣時間午夜）
 */
export function shouldRecordUserActivity(
  userId: string,
  now: Date = new Date(),
  throttleMs: number = USER_ACTIVITY_THROTTLE_MS,
): boolean {
  if (!userId) return false;
  const nowMs = now.getTime();
  const todayKey = getTaipeiDateKey(now);
  const prev = userActivityThrottleMap.get(userId);

  if (prev && prev.lastDateKey === todayKey && nowMs - prev.lastRecordedMs < throttleMs) {
    return false;
  }

  userActivityThrottleMap.set(userId, { lastRecordedMs: nowMs, lastDateKey: todayKey });
  return true;
}

async function persistUserActivity(userId: string, now: Date): Promise<void> {
  const key = `${USER_ACTIVITY_CONFIG_PREFIX}${userId}`;
  const todayKey = getTaipeiDateKey(now);

  try {
    const existing = await prisma.appConfig.findUnique({ where: { key } });
    let current: UserActivityRecord = { lastActiveAt: now.toISOString(), dailyStats: {} };

    if (existing?.value) {
      try {
        const parsed = JSON.parse(existing.value) as Partial<UserActivityRecord>;
        current = {
          lastActiveAt: parsed.lastActiveAt || now.toISOString(),
          dailyStats: parsed.dailyStats || {},
        };
      } catch {
        current = { lastActiveAt: now.toISOString(), dailyStats: {} };
      }
    }

    const prunedStats = pruneDailyStats(current.dailyStats, USER_ACTIVITY_RETENTION_DAYS, now);
    prunedStats[todayKey] = (prunedStats[todayKey] || 0) + 1;

    const nextRecord: UserActivityRecord = {
      lastActiveAt: now.toISOString(),
      dailyStats: prunedStats,
    };

    const stringValue = JSON.stringify(nextRecord);
    await prisma.appConfig.upsert({
      where: { key },
      create: { id: key, key, value: stringValue },
      update: { value: stringValue },
    });
  } catch (error) {
    console.error("Failed to record user activity:", error);
  }
}

/**
 * 非同步節流記錄使用者在線狀態與每日活躍次數（不阻塞主請求）
 */
export function recordUserActivityThrottled(userId: string): void {
  const now = new Date();
  if (!shouldRecordUserActivity(userId, now)) return;
  void persistUserActivity(userId, now);
}

/**
 * 批次讀取全體使用者的活躍統計紀錄
 */
export async function getAllUserActivityRecords(): Promise<Map<string, UserActivityRecord>> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { startsWith: USER_ACTIVITY_CONFIG_PREFIX } },
  });

  const map = new Map<string, UserActivityRecord>();
  for (const row of rows) {
    const userId = row.key.slice(USER_ACTIVITY_CONFIG_PREFIX.length);
    if (!userId) continue;
    try {
      const parsed = JSON.parse(row.value) as UserActivityRecord;
      if (parsed && typeof parsed === "object") {
        map.set(userId, parsed);
      }
    } catch {
      // 忽略損毀之單筆紀錄
    }
  }
  return map;
}
