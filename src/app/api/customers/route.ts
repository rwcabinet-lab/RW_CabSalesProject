import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { DEFAULT_PREVIEW_USER_ID } from "@/lib/current-user";

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
    const body = await req.json();
    const { name, customerType, taxId, phone, address, defaultDiscount, paymentTerms } = body;

    if (!name || !phone || !customerType) {
      return NextResponse.json({ error: "請填寫必要欄位 (客戶名稱、電話、客戶類型)" }, { status: 400 });
    }

    const salesRepId = req.cookies.get("cab_sales_user_id")?.value || DEFAULT_PREVIEW_USER_ID;
    const newCustomer = await DataService.addCustomer({
      name,
      customerType,
      taxId: taxId || undefined,
      phone,
      address: address || undefined,
      defaultDiscount: Number(defaultDiscount) || (customerType === "HOMEOWNER" ? 1.0 : 0.85),
      paymentTerms: paymentTerms || "DEPOSIT_BALANCE",
      salesRepId,
    });

    return NextResponse.json(newCustomer, { status: 201 });
  } catch (error) {
    console.error("Failed to create customer:", error);
    return NextResponse.json({ error: "新增客戶失敗" }, { status: 500 });
  }
}
