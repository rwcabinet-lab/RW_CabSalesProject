import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "僅管理員可刪除客戶" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  try {
    const customers = await DataService.getCustomers();
    return NextResponse.json(customers);
  } catch (error) {
    console.error("Failed to fetch customers:", error);
    return NextResponse.json({ error: "無法取得客戶資料" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUserId = req.cookies.get("cab_sales_user_id")?.value;
    if (!sessionUserId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

    const body = await req.json();
    const { name, customerType, taxId, phone, address, defaultDiscount, paymentTerms, salesRepId } = body;

    if (!name || !phone || !customerType) {
      return NextResponse.json({ error: "請填寫必要欄位 (客戶名稱、電話、客戶類型)" }, { status: 400 });
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
    console.error("Failed to create customer:", error);
    return NextResponse.json({ error: "新增客戶失敗" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, customerType, taxId, phone, address, defaultDiscount, paymentTerms, salesRepId } = body;
    if (!id || !name || !phone || !customerType || !salesRepId) {
      return NextResponse.json({ error: "請填寫必要欄位" }, { status: 400 });
    }
    const customer = await DataService.updateCustomer(id, {
      name, customerType, taxId: taxId || undefined, phone, address: address || undefined,
      defaultDiscount: Number(defaultDiscount) || (customerType === "INDIVIDUAL" ? 1.0 : 0.85),
      paymentTerms: paymentTerms || "DEPOSIT_BALANCE", salesRepId,
    });
    return NextResponse.json(customer);
  } catch (error) {
    console.error("Failed to update customer:", error);
    return NextResponse.json({ error: "更新客戶失敗" }, { status: 500 });
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
    console.error("Failed to delete customer:", error);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
      return NextResponse.json({ error: "此客戶仍有關聯案件，請先刪除或重新指派案件" }, { status: 409 });
    }
    return NextResponse.json({ error: "刪除客戶失敗" }, { status: 500 });
  }
}
