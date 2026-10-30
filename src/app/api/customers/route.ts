import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { getVerifiedUserIdFromRequest } from "@/lib/session";
import { handleApiError } from "@/lib/errors";

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "僅管理員可刪除客戶" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const customers = await DataService.getCustomers();
    return NextResponse.json(customers);
  } catch (error) {
    return handleApiError(error, "無法取得客戶資料");
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUserId = await getVerifiedUserIdFromRequest(req);
    if (!sessionUserId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

    const body = await req.json();
    const { name, customerType, taxId, phone, address, defaultDiscount, paymentTerms, salesRepId } = body;

    if (!name || !phone || !customerType) {
      return NextResponse.json({ error: "請填寫必要欄位 (客戶名稱、電話、客戶類型)" }, { status: 400 });
    }

    const trimmedTaxId = typeof taxId === "string" ? taxId.trim() : "";
    const trimmedPhone = typeof phone === "string" ? phone.trim() : "";

    // 1. 統一編號重複檢查
    if (trimmedTaxId) {
      const existingByTaxId = await prisma.customer.findFirst({
        where: { taxId: trimmedTaxId },
        select: { id: true, name: true },
      });
      if (existingByTaxId) {
        return NextResponse.json(
          { error: `統一編號重複：已存在相同統編之客戶「${existingByTaxId.name}」` },
          { status: 400 }
        );
      }
    }

    // 2. 客戶電話重複檢查
    if (trimmedPhone) {
      const existingByPhone = await prisma.customer.findFirst({
        where: { phone: trimmedPhone },
        select: { id: true, name: true },
      });
      if (existingByPhone) {
        return NextResponse.json(
          { error: `客戶電話重複：已存在相同電話之客戶「${existingByPhone.name}」` },
          { status: 400 }
        );
      }
    }

    const newCustomer = await DataService.addCustomer({
      name,
      customerType,
      taxId: taxId || undefined,
      phone,
      address: address || undefined,
      defaultDiscount: Number(defaultDiscount) || (customerType === "INDIVIDUAL" ? 1.0 : 0.85),
      paymentTerms: paymentTerms || "DEPOSIT_BALANCE",
      salesRepId: salesRepId || sessionUserId,
    });

    return NextResponse.json(newCustomer, { status: 201 });
  } catch (error) {
    return handleApiError(error, "新增客戶失敗");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });

    const body = await req.json();
    const { id, name, customerType, taxId, phone, address, defaultDiscount, paymentTerms, salesRepId } = body;
    if (!id || !name || !phone || !customerType || !salesRepId) {
      return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
    }

    const isManager = ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"].includes(user.role);
    const currentCustomer = await prisma.customer.findUnique({
      where: { id },
      select: { salesRepId: true, defaultDiscount: true },
    });
    if (!currentCustomer) {
      return NextResponse.json({ error: "找不到該客戶" }, { status: 404 });
    }

    if (!isManager && currentCustomer.salesRepId !== user.id) {
      return NextResponse.json({ error: "僅主管或該客戶主責業務可修改客戶資料" }, { status: 403 });
    }

    if (!isManager && defaultDiscount !== undefined && Number(defaultDiscount) !== Number(currentCustomer.defaultDiscount)) {
      return NextResponse.json({ error: "僅主管有權調整客戶預設折數" }, { status: 403 });
    }

    const trimmedTaxId = typeof taxId === "string" ? taxId.trim() : "";
    const trimmedPhone = typeof phone === "string" ? phone.trim() : "";

    // 1. 統一編號重複檢查 (排除自身)
    if (trimmedTaxId) {
      const existingByTaxId = await prisma.customer.findFirst({
        where: { taxId: trimmedTaxId, id: { not: id } },
        select: { id: true, name: true },
      });
      if (existingByTaxId) {
        return NextResponse.json(
          { error: `統一編號重複：已存在相同統編之客戶「${existingByTaxId.name}」` },
          { status: 400 }
        );
      }
    }

    // 2. 客戶電話重複檢查 (排除自身)
    if (trimmedPhone) {
      const existingByPhone = await prisma.customer.findFirst({
        where: { phone: trimmedPhone, id: { not: id } },
        select: { id: true, name: true },
      });
      if (existingByPhone) {
        return NextResponse.json(
          { error: `客戶電話重複：已存在相同電話之客戶「${existingByPhone.name}」` },
          { status: 400 }
        );
      }
    }
    const customer = await DataService.updateCustomer(id, {
      name, customerType, taxId: taxId || undefined, phone, address: address || undefined,
      defaultDiscount: Number(defaultDiscount) || (customerType === "INDIVIDUAL" ? 1.0 : 0.85),
      paymentTerms: paymentTerms || "DEPOSIT_BALANCE", salesRepId,
    });
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error, "更新客戶失敗");
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json({ error: "缺少客戶識別碼" }, { status: 400 });
    }

    const result = await DataService.deleteCustomer(body.id);
    if (result === "NOT_FOUND") {
      return NextResponse.json({ error: "找不到客戶" }, { status: 404 });
    }
    if (result === "HAS_PROJECTS") {
      return NextResponse.json({ error: "此客戶仍有關聯案件，請先刪除或重新指派案件" }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "刪除客戶失敗", {
      prismaMessages: { P2003: "此客戶仍有關聯案件，請先刪除或重新指派案件" },
    });
  }
}
