import { prisma } from "../prisma";
import { NotFoundError } from "../errors";
import {
  CUSTOMER_TYPE_START_STAGE_CODES,
  MILESTONE_DEFAULT_DAYS,
  MilestoneStageCode,
} from "../constants";
import { appConfigCache, APP_CONFIG_TTL_MS } from "./shared";

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
      const records = await ConfigService.getAppConfig<Array<{
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
      }>>("login_records", []);

      const newRecord = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ...log,
      };

      // 保留最新 500 筆紀錄，避免資料無限增長
      const updated = [newRecord, ...records].slice(0, 500);
      await ConfigService.setAppConfig("login_records", updated);
    } catch (error) {
      console.error("Failed to record login log:", error);
    }
  },

  async getLoginLogsByUser(targetUserId: string) {
    const [records, targetUser] = await Promise.all([
      ConfigService.getAppConfig<Array<{
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
      }>>("login_records", []),
      prisma.user.findFirst({
        where: {
          OR: [{ id: targetUserId }, { email: targetUserId }],
        },
        select: { id: true, email: true },
      }),
    ]);

    const targetId = targetUser?.id || targetUserId;
    const targetEmployeeNo = targetUser?.email;

    return records
      .filter((r) => {
        if (r.userId === targetId) return true;
        if (targetEmployeeNo && r.employeeNo?.toLowerCase() === targetEmployeeNo.toLowerCase()) return true;
        return false;
      })
      .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime());
  },
};
