import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";

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
