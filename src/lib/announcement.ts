export type AnnouncementLevel = "INFO" | "WARNING" | "URGENT";

export interface SystemAnnouncement {
  id: string;
  title: string;
  message: string;
  level: AnnouncementLevel;
  isActive: boolean;
  pushedAt: string;
  pushedBy: string;
  updatedAt: string;
}

export const ANNOUNCEMENT_CONFIG_KEY = "system_announcement";
export const ANNOUNCEMENT_HISTORY_CONFIG_KEY = "system_announcement_history";
export const ANNOUNCEMENT_ACK_KEY_PREFIX = "announcement_ack_";
export const ANNOUNCEMENT_HISTORY_LIMIT = 20;

export const ANNOUNCEMENT_LEVEL_CONFIG: Record<
  AnnouncementLevel,
  {
    label: string;
    badgeClass: string;
    bannerClass: string;
    headerClass: string;
    buttonClass: string;
  }
> = {
  INFO: {
    label: "一般通知",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    bannerClass: "border-blue-200 bg-blue-50/60",
    headerClass: "from-blue-600 to-indigo-600",
    buttonClass: "bg-blue-600 hover:bg-blue-700",
  },
  WARNING: {
    label: "重要提醒",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    bannerClass: "border-amber-200 bg-amber-50/70",
    headerClass: "from-amber-500 to-orange-600",
    buttonClass: "bg-amber-600 hover:bg-amber-700",
  },
  URGENT: {
    label: "緊急公告",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    bannerClass: "border-red-200 bg-red-50/70",
    headerClass: "from-red-600 to-rose-600",
    buttonClass: "bg-red-600 hover:bg-red-700",
  },
};

export function normalizeAnnouncementLevel(level: unknown): AnnouncementLevel {
  if (level === "WARNING" || level === "URGENT" || level === "INFO") {
    return level;
  }
  return "INFO";
}

export function validateAnnouncementInput(
  title: unknown,
  message: unknown
): string | null {
  if (typeof title !== "string" || !title.trim()) {
    return "請填寫公告標題";
  }
  if (title.trim().length > 120) {
    return "公告標題不可超過 120 字";
  }
  if (typeof message !== "string" || !message.trim()) {
    return "請填寫公告內容";
  }
  if (message.trim().length > 2000) {
    return "公告內容不可超過 2000 字";
  }
  return null;
}

export function createAnnouncementEntry(params: {
  title: string;
  message: string;
  level?: unknown;
  pushedBy: string;
  now?: Date;
}): SystemAnnouncement {
  const nowIso = (params.now ?? new Date()).toISOString();
  return {
    id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: params.title.trim(),
    message: params.message.trim(),
    level: normalizeAnnouncementLevel(params.level),
    isActive: true,
    pushedAt: nowIso,
    pushedBy: params.pushedBy.trim() || "管理員",
    updatedAt: nowIso,
  };
}

/**
 * 判斷目前使用者是否應跳出公告提示彈窗：
 * 1. 僅在公告處於「啟用推送 (isActive)」時顯示
 * 2. 若本次為剛完成登入（justLoggedIn），每次登入皆提示一次
 * 3. 若已登入狀態下管理者推送了新公告（id 與已讀紀錄不同），亦主動提示一次
 */
export function shouldShowAnnouncementModal(params: {
  announcement: SystemAnnouncement | null | undefined;
  acknowledgedId: string | null | undefined;
  justLoggedIn: boolean;
  dismissedInRender?: boolean;
}): boolean {
  const { announcement, acknowledgedId, justLoggedIn, dismissedInRender } = params;
  if (!announcement || !announcement.isActive || dismissedInRender) {
    return false;
  }
  if (justLoggedIn) {
    return true;
  }
  return acknowledgedId !== announcement.id;
}
