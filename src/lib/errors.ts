import { NextResponse } from "next/server";

export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "查無此資料") {
    super(message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "請求參數無效") {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "請先登入") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "沒有權限執行此操作") {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message = "操作衝突或當前狀態不允許此操作") {
    super(message, 409);
  }
}

export interface HandleApiErrorOptions {
  /** 針對特定 Prisma 錯誤代碼自訂回傳訊息 (例如 P2002 唯一性衝突) */
  prismaMessages?: Record<string, string>;
}

/**
 * 統一全域 API 錯誤處理器：
 * 1. 精準對齊 AppError (BadRequest 400, Unauthorized 401, Forbidden 403, NotFound 404, Conflict 409)
 * 2. 攔截 JSON 解析語法錯誤 (SyntaxError -> 400)
 * 3. 攔截 Prisma 資料庫已知限制錯誤 (P2002 唯一鍵重複 -> 409, P2025 查無紀錄 -> 404, P2003 外鍵限制 -> 409)
 * 4. 其餘未知伺服器異常輸出日誌並回傳 500
 */
export function handleApiError(
  error: unknown,
  fallbackMessage = "伺服器處理失敗",
  options?: HandleApiErrorOptions
): NextResponse {
  // 1. 已知自訂 AppError
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  // 2. JSON 解析失敗
  if (error instanceof SyntaxError && error.message.includes("JSON")) {
    return NextResponse.json({ error: "請求資料格式錯誤 (Invalid JSON)" }, { status: 400 });
  }

  // 3. Prisma 資料庫已知錯誤
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    const code = error.code;
    const customMessage = options?.prismaMessages?.[code];

    if (code === "P2002") {
      return NextResponse.json(
        { error: customMessage || "資料已存在或唯一鍵值重複，請確認後重試" },
        { status: 409 }
      );
    }
    if (code === "P2025") {
      return NextResponse.json(
        { error: customMessage || "找不到指定的資料" },
        { status: 404 }
      );
    }
    if (code === "P2003") {
      return NextResponse.json(
        { error: customMessage || "此資料仍有關聯項目，無法執行此操作" },
        { status: 409 }
      );
    }
  }

  // 4. 未預期之例外
  console.error("API Error:", error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
