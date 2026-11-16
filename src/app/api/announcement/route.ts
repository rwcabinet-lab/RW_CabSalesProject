import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/access-control";
import { DataService } from "@/lib/data-service";
import { handleApiError } from "@/lib/errors";
import {
  ANNOUNCEMENT_ACK_KEY_PREFIX,
  ANNOUNCEMENT_CONFIG_KEY,
  ANNOUNCEMENT_HISTORY_CONFIG_KEY,
  ANNOUNCEMENT_HISTORY_LIMIT,
  createAnnouncementEntry,
  type SystemAnnouncement,
  validateAnnouncementInput,
} from "@/lib/announcement";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const scope = req.nextUrl.searchParams.get("scope");
    const isAdminScope = scope === "admin" && user.role === "ADMIN";
    const ackKey = `${ANNOUNCEMENT_ACK_KEY_PREFIX}${user.id}`;

    const [rawAnnouncement, acknowledgedId, history] = await Promise.all([
      DataService.getAppConfig<SystemAnnouncement | null>(ANNOUNCEMENT_CONFIG_KEY, null),
      DataService.getAppConfig<string | null>(ackKey, null),
      isAdminScope
        ? DataService.getAppConfig<SystemAnnouncement[]>(ANNOUNCEMENT_HISTORY_CONFIG_KEY, [])
        : Promise.resolve([]),
    ]);

    const visibleAnnouncement = isAdminScope
      ? rawAnnouncement
      : rawAnnouncement?.isActive
        ? rawAnnouncement
        : null;

    return NextResponse.json(
      {
        success: true,
        announcement: visibleAnnouncement,
        acknowledgedId: typeof acknowledgedId === "string" ? acknowledgedId : null,
        ...(isAdminScope ? { history: Array.isArray(history) ? history : [] } : {}),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    return handleApiError(err, "讀取系統公告失敗");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "僅系統管理員可設定與推送全體公告" }, { status: 403 });
    }

    const body = await req.json();

    if (body?.action === "deactivate") {
      const current = await DataService.getAppConfig<SystemAnnouncement | null>(
        ANNOUNCEMENT_CONFIG_KEY,
        null
      );
      if (!current) {
        return NextResponse.json({ success: true, announcement: null, message: "目前已無推送中的公告" });
      }
      const updated: SystemAnnouncement = {
        ...current,
        isActive: false,
        updatedAt: new Date().toISOString(),
      };
      await DataService.setAppConfig(ANNOUNCEMENT_CONFIG_KEY, updated);
      return NextResponse.json({
        success: true,
        announcement: updated,
        message: "已暫停全體登入公告推送",
      });
    }

    const validationError = validateAnnouncementInput(body?.title, body?.message);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const entry = createAnnouncementEntry({
      title: body.title,
      message: body.message,
      level: body.level,
      pushedBy: user.name || "系統管理員",
    });

    const history = await DataService.getAppConfig<SystemAnnouncement[]>(
      ANNOUNCEMENT_HISTORY_CONFIG_KEY,
      []
    );
    const nextHistory = [entry, ...(Array.isArray(history) ? history : [])].slice(
      0,
      ANNOUNCEMENT_HISTORY_LIMIT
    );

    await Promise.all([
      DataService.setAppConfig(ANNOUNCEMENT_CONFIG_KEY, entry),
      DataService.setAppConfig(ANNOUNCEMENT_HISTORY_CONFIG_KEY, nextHistory),
    ]);

    return NextResponse.json({
      success: true,
      announcement: entry,
      history: nextHistory,
      message: "公告已儲存並設定推送，所有使用者登入時皆會收到提示",
    });
  } catch (err) {
    return handleApiError(err, "推送系統公告失敗");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const body = await req.json();
    const announcementId = typeof body?.announcementId === "string" ? body.announcementId.trim() : "";
    if (!announcementId) {
      return NextResponse.json({ error: "缺少公告識別碼" }, { status: 400 });
    }

    const ackKey = `${ANNOUNCEMENT_ACK_KEY_PREFIX}${user.id}`;
    await DataService.setAppConfig(ackKey, announcementId);

    return NextResponse.json({ success: true, acknowledgedId: announcementId });
  } catch (err) {
    return handleApiError(err, "紀錄公告已讀狀態失敗");
  }
}
