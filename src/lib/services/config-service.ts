import { prisma } from "../prisma";
import { NotFoundError } from "../errors";
import {
  CUSTOMER_TYPE_START_STAGE_CODES,
  MILESTONE_DEFAULT_DAYS,
  MilestoneStageCode,
} from "../constants";
import { appConfigCache, APP_CONFIG_TTL_MS } from "./shared";

export const LOGIN_LOG_RETENTION_DAYS = 30;
const LOGIN_LOG_MAX_RECORDS = 500;

export interface LoginLogRecord {
  id: string;
  userId: string;
  employeeNo: string;
  userName: string;
  role: string;
  loginAt: string;
  ipAddress?: string;
  userAgent?: string;
  status: "SUCCESS" | "FAILED";
  failureReason?: string;
}

/**
 * 過濾並僅保留最近 N 天（預設 30 天）內的登入紀錄
 */
export function pruneLoginLogs<T extends { loginAt: string }>(
  records: T[],
  retentionDays: number = LOGIN_LOG_RETENTION_DAYS,
  now: Date = new Date(),
): T[] {
  const cutoffMs = now.getTime() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  return records.filter((r) => {
    const ms = new Date(r.loginAt).getTime();
    return !Number.isNaN(ms) && ms >= cutoffMs;
  });
}

export const ConfigService = {
  async getAppConfig<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    const cached = appConfigCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    const config = await prisma.appConfig.findUnique({ where: { key } });
    if (!config) {
      if (defaultValue !== undefined) return defaultValue;
      throw new NotFoundError(`找不到設定項目: ${key}`);
    }
    const parsed = JSON.parse(config.value) as T;
    appConfigCache.set(key, { value: parsed, expiresAt: Date.now() + APP_CONFIG_TTL_MS });
    return parsed;
  },

  async setAppConfig(key: string, value: unknown) {
    const stringValue = JSON.stringify(value);
    const updated = await prisma.appConfig.upsert({
      where: { key },
      create: { id: key, key, value: stringValue },
      update: { value: stringValue },
    });
    appConfigCache.set(key, { value, expiresAt: Date.now() + APP_CONFIG_TTL_MS });
    return updated;
  },

  async getMilestoneDefaultDays(): Promise<Record<string, number>> {
    return ConfigService.getAppConfig<Record<string, number>>("milestone_default_days", MILESTONE_DEFAULT_DAYS);
  },

  async getCustomerTypeStartStages(): Promise<Record<string, MilestoneStageCode>> {
    return ConfigService.getAppConfig<Record<string, MilestoneStageCode>>(
      "customer_type_start_stages",
      CUSTOMER_TYPE_START_STAGE_CODES as Record<string, MilestoneStageCode>
    );
  },

  async recordLoginLog(log: {
    userId: string;
    employeeNo: string;
    userName: string;
    role: string;
    loginAt: string;
    ipAddress?: string;
    userAgent?: string;
    status: "SUCCESS" | "FAILED";
    failureReason?: string;
  }) {
    try {
      const records = await ConfigService.getAppConfig<LoginLogRecord[]>("login_records", []);

      const newRecord: LoginLogRecord = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ...log,
      };

      // 僅保留最近 30 天且上限 500 筆紀錄，避免資料無限增長
      const updated = pruneLoginLogs([newRecord, ...records]).slice(0, LOGIN_LOG_MAX_RECORDS);
      await ConfigService.setAppConfig("login_records", updated);
    } catch (error) {
      console.error("Failed to record login log:", error);
    }
  },

  async getLoginLogsByUser(targetUserId: string) {
    const [records, targetUser] = await Promise.all([
      ConfigService.getAppConfig<LoginLogRecord[]>("login_records", []),
      prisma.user.findFirst({
        where: {
          OR: [{ id: targetUserId }, { email: targetUserId }],
        },
        select: { id: true, email: true },
      }),
    ]);

    const targetId = targetUser?.id || targetUserId;
    const targetEmployeeNo = targetUser?.email;

    return pruneLoginLogs(records)
      .filter((r) => {
        if (r.userId === targetId) return true;
        if (targetEmployeeNo && r.employeeNo?.toLowerCase() === targetEmployeeNo.toLowerCase()) return true;
        return false;
      })
      .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime());
  },
};
