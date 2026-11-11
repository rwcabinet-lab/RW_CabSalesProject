import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";
import { handleApiError } from "@/lib/errors";
import { DEFAULT_CHANGELOG, ChangelogEntry } from "@/lib/changelog";

export const dynamic = "force-dynamic";

const CHANGELOG_CONFIG_KEY = "system_changelog";

function sortChangelogs(list: ChangelogEntry[]): ChangelogEntry[] {
  return [...list].sort((a, b) => {
    // 優先依日期遞減排序
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return (b.id || "").localeCompare(a.id || "");
  });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    let changelogs = await DataService.getAppConfig<ChangelogEntry[]>(
      CHANGELOG_CONFIG_KEY,
      DEFAULT_CHANGELOG
    );

    // 若資料庫內尚無資料，自動將預設改版紀錄寫入以建立初始基底
    if (!Array.isArray(changelogs) || changelogs.length === 0) {
      changelogs = DEFAULT_CHANGELOG;
      await DataService.setAppConfig(CHANGELOG_CONFIG_KEY, DEFAULT_CHANGELOG);
    }

    const sorted = sortChangelogs(changelogs);
    const latestVersion = sorted[0]?.version || "v1.0.0";

    return NextResponse.json(
      { success: true, changelogs: sorted, latestVersion },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    return handleApiError(err, "讀取改版資訊失敗");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "權限不足：僅系統管理者身分可直接新增或編輯改版資訊內容" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // 支援回復初始預設改版紀錄
    if (body.action === "reset") {
      await DataService.setAppConfig(CHANGELOG_CONFIG_KEY, DEFAULT_CHANGELOG);
      return NextResponse.json({
        success: true,
        changelogs: DEFAULT_CHANGELOG,
        latestVersion: DEFAULT_CHANGELOG[0]?.version || "v1.0.0",
        message: "已成功回復系統初始改版紀錄",
      });
    }

    const { version, date, title, category, details } = body;
    if (!date || !title) {
      return NextResponse.json(
        { error: "日期與改版標題為必填項目" },
        { status: 400 }
      );
    }

    const currentList = await DataService.getAppConfig<ChangelogEntry[]>(
      CHANGELOG_CONFIG_KEY,
      DEFAULT_CHANGELOG
    );

    const safeDetails = Array.isArray(details)
      ? details.map((d: unknown) => String(d).trim()).filter(Boolean)
      : typeof details === "string"
      ? details.split("\n").map((d) => d.trim()).filter(Boolean)
      : [];

    const newEntry: ChangelogEntry = {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      version: version ? String(version).trim() : undefined,
      date: String(date).trim(),
      title: String(title).trim(),
      category: ["FEAT", "RULE", "OPTIMIZE", "FIX"].includes(category)
        ? category
        : "FEAT",
      details: safeDetails,
      updatedAt: new Date().toISOString(),
      updatedBy: user.name || "管理員",
    };

    const updatedList = sortChangelogs([newEntry, ...currentList]);
    await DataService.setAppConfig(CHANGELOG_CONFIG_KEY, updatedList);

    return NextResponse.json({
      success: true,
      changelogs: updatedList,
      latestVersion: updatedList[0]?.version || newEntry.version,
      entry: newEntry,
    });
  } catch (err) {
    return handleApiError(err, "新增改版資訊失敗");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "權限不足：僅系統管理者身分可直接編輯改版資訊內容" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // 支援批次整批替換（例如重新排序或管理）
    if (Array.isArray(body.changelogs)) {
      const sanitized = body.changelogs.map((item: ChangelogEntry) => ({
        id: item.id || `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        version: String(item.version || "").trim(),
        date: String(item.date || "").trim(),
        title: String(item.title || "").trim(),
        category: ["FEAT", "RULE", "OPTIMIZE", "FIX"].includes(item.category)
          ? item.category
          : "FEAT",
        details: Array.isArray(item.details)
          ? item.details.map((d) => String(d).trim()).filter(Boolean)
          : [],
        updatedAt: new Date().toISOString(),
        updatedBy: user.name || "管理員",
      }));
      const sorted = sortChangelogs(sanitized);
      await DataService.setAppConfig(CHANGELOG_CONFIG_KEY, sorted);
      return NextResponse.json({
        success: true,
        changelogs: sorted,
        latestVersion: sorted[0]?.version || "v1.0.0",
      });
    }

    // 單筆編輯
    const { id, version, date, title, category, details } = body;
    if (!id || !date || !title) {
      return NextResponse.json(
        { error: "缺少必要參數（id、date、title）" },
        { status: 400 }
      );
    }

    const currentList = await DataService.getAppConfig<ChangelogEntry[]>(
      CHANGELOG_CONFIG_KEY,
      DEFAULT_CHANGELOG
    );

    const safeDetails = Array.isArray(details)
      ? details.map((d: unknown) => String(d).trim()).filter(Boolean)
      : typeof details === "string"
      ? details.split("\n").map((d) => d.trim()).filter(Boolean)
      : [];

    let found = false;
    const updated = currentList.map((item) => {
      if (item.id === id) {
        found = true;
        return {
          ...item,
          version: version !== undefined ? String(version).trim() : item.version,
          date: String(date).trim(),
          title: String(title).trim(),
          category: ["FEAT", "RULE", "OPTIMIZE", "FIX"].includes(category)
            ? category
            : item.category,
          details: safeDetails,
          updatedAt: new Date().toISOString(),
          updatedBy: user.name || "管理員",
        };
      }
      return item;
    });

    if (!found) {
      // 找不到時自動補充新增該筆項目防呆，確保永不 404
      const newEntry: ChangelogEntry = {
        id,
        version: version ? String(version).trim() : undefined,
        date: String(date).trim(),
        title: String(title).trim(),
        category: ["FEAT", "RULE", "OPTIMIZE", "FIX"].includes(category)
          ? category
          : "FEAT",
        details: safeDetails,
        updatedAt: new Date().toISOString(),
        updatedBy: user.name || "管理員",
      };
      updated.unshift(newEntry);
    }

    const sorted = sortChangelogs(updated);
    await DataService.setAppConfig(CHANGELOG_CONFIG_KEY, sorted);

    return NextResponse.json({
      success: true,
      changelogs: sorted,
      latestVersion: sorted[0]?.version || "v1.0.0",
    });
  } catch (err) {
    return handleApiError(err, "更新改版資訊失敗");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "權限不足：僅系統管理者身分可刪除改版資訊內容" },
        { status: 403 }
      );
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "缺少 id 參數" }, { status: 400 });
    }

    const currentList = await DataService.getAppConfig<ChangelogEntry[]>(
      CHANGELOG_CONFIG_KEY,
      DEFAULT_CHANGELOG
    );

    const filtered = currentList.filter((item) => item.id !== id);
    if (filtered.length === currentList.length) {
      return NextResponse.json({ error: "找不到欲刪除之紀錄" }, { status: 404 });
    }

    const sorted = sortChangelogs(filtered);
    await DataService.setAppConfig(CHANGELOG_CONFIG_KEY, sorted);

    return NextResponse.json({
      success: true,
      changelogs: sorted,
      latestVersion: sorted[0]?.version || "v1.0.0",
      message: "改版紀錄已刪除",
    });
  } catch (err) {
    return handleApiError(err, "刪除改版資訊失敗");
  }
}
