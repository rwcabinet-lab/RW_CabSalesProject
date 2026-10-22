import { CustomerType, Role } from "@prisma/client";
import type {
  CustomerDTO as CustomerItem,
  CustomerTypeDTO,
} from "@/types/dto";
import { getTaiwanDateString } from "../schedule-engine";

export const dateValue = (value: Date | null | undefined) => value?.toISOString() || undefined;
export const dateOnlyValue = (value: Date | null | undefined) => (value ? getTaiwanDateString(value) : null);

export const LOGIN_USERS_TTL_MS = 5 * 60_000;
export const APP_CONFIG_TTL_MS = 10 * 60_000;

export const globalForDataService = globalThis as unknown as {
  loginUsersCache?: { data: Array<{ id: string; name: string; role: Role }>; expiresAt: number };
  appConfigCache?: Map<string, { value: unknown; expiresAt: number }>;
};

export const appConfigCache =
  globalForDataService.appConfigCache ??
  (globalForDataService.appConfigCache = new Map<string, { value: unknown; expiresAt: number }>());

export function invalidateLoginUsersCache() {
  globalForDataService.loginUsersCache = undefined;
}

export const projectInclude = {
  customer: {
    select: {
      name: true,
      customerType: true,
      defaultDiscount: true,
      salesRepId: true,
      salesRep: { select: { name: true } },
    },
  },
  salesRep: { select: { id: true, name: true } },
  salesAssistant: { select: { id: true, name: true } },
} as const;

export const milestoneInclude = {
  assignedTo: { select: { id: true, name: true } },
  salesTask: { select: { id: true, subject: true, isCompleted: true } },
} as const;

export const customerTypeFromDatabase = (type: CustomerType): CustomerItem["customerType"] =>
  type === "CONTRACTOR" ? "PR" : type;

export const customerTypeForDatabase = (type: CustomerTypeDTO): CustomerType =>
  type === "PR" ? CustomerType.CONTRACTOR : (type as CustomerType);
