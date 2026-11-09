import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/access-control";
import { DataService } from "@/lib/data-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/pinned
 * 讀取當前使用者的雲端置頂專案清單（跨裝置同步）
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "請先登入", pinnedProjectIds: [] },
        { status: 401 }
      );
    }

    const configKey = `user_pinned_${user.id}`;
    const pinnedProjectIds = await DataService.getAppConfig<string[]>(configKey, []);

    return NextResponse.json(
      {
        success: true,
        pinnedProjectIds: Array.isArray(pinnedProjectIds) ? pinnedProjectIds : [],
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return handleApiError(error, "讀取雲端置頂專案清單失敗");
  }
}

/**
 * PUT /api/projects/pinned
 * 儲存當前使用者的雲端置頂專案清單（跨裝置同步）
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "請先登入" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const rawIds = body?.pinnedProjectIds;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json(
        { success: false, error: "pinnedProjectIds 必須為字串陣列" },
        { status: 400 }
      );
    }

    // 防呆：去重、去除空值，並限制上限 100 筆
    const validIds = Array.from(
      new Set(
        rawIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      )
    ).slice(0, 100);

    const configKey = `user_pinned_${user.id}`;
    await DataService.setAppConfig(configKey, validIds);

    return NextResponse.json({
      success: true,
      pinnedProjectIds: validIds,
    });
  } catch (error) {
    return handleApiError(error, "儲存雲端置頂專案清單失敗");
  }
}
