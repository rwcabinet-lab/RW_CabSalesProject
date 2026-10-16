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

export function handleApiError(error: unknown, fallbackMessage = "伺服器處理失敗") {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  console.error("API Error:", error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
