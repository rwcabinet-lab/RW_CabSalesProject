import { prisma } from "../prisma";
import { NotFoundError } from "../errors";
import { MILESTONE_DEFAULT_DAYS } from "../constants";
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
      create: { key, value: stringValue },
      update: { value: stringValue },
    });
    appConfigCache.set(key, { value, expiresAt: Date.now() + APP_CONFIG_TTL_MS });
    return updated;
  },

  async getMilestoneDefaultDays(): Promise<Record<string, number>> {
    return ConfigService.getAppConfig<Record<string, number>>("milestone_default_days", MILESTONE_DEFAULT_DAYS);
  },
};
