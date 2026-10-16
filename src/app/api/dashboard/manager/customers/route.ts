import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const [customers, projects] = await Promise.all([
      DataService.getCustomers(),
      DataService.getProjects(),
    ]);

    // Group projects by customerId
    const projectsByCustomer: Record<string, typeof projects> = {};
    for (const p of projects) {
      if (!projectsByCustomer[p.customerId]) {
        projectsByCustomer[p.customerId] = [];
      }
      projectsByCustomer[p.customerId].push(p);
    }

    const customerTypeLabels: Record<string, string> = {
      DESIGNER: "設計師",
      CONTRACTOR: "統包/營造",
      PR: "統包/營造",
      DEALER: "經銷商",
      DIRECT: "直接業主",
      OTHER: "其他",
    };

    const customerList = customers.map((c) => {
      const cProjects = projectsByCustomer[c.id] || [];
      const totalProjects = cProjects.length;
      const activeProjects = cProjects.filter(
        (p) => p.currentStage !== "LOST" && p.currentStage !== "CLOSED" && p.currentStage !== "BILLED"
      ).length;
      const closedProjects = cProjects.filter(
        (p) => p.currentStage === "CLOSED" || p.currentStage === "BILLED"
      ).length;
      const lostProjects = cProjects.filter((p) => p.currentStage === "LOST").length;
      const totalQuoteAmount = cProjects.reduce(
        (sum, p) => sum + (p.quoteAmount || p.estimatedBudget || 0),
        0
      );
      const latestProject = cProjects[0]; // ordered by createdAt desc

      return {
        id: c.id,
        name: c.name,
        customerType: c.customerType,
        customerTypeLabel: customerTypeLabels[c.customerType] || c.customerType,
        taxId: c.taxId || "",
        phone: c.phone || "",
        address: c.address || "",
        defaultDiscount: c.defaultDiscount,
        paymentTerms: c.paymentTerms,
        salesRepId: c.salesRepId,
        salesRepName: c.salesRepName,
        totalProjects,
        activeProjects,
        closedProjects,
        lostProjects,
        totalQuoteAmount,
        latestProjectName: latestProject?.projectName || "",
        latestProjectStage: latestProject?.currentStage || "",
      };
    });

    // KPI Summary
    const totalCustomers = customerList.length;
    const activeCustomerCount = customerList.filter((c) => c.activeProjects > 0).length;
    const totalQuoteSum = customerList.reduce((sum, c) => sum + c.totalQuoteAmount, 0);

    const typeCountMap: Record<string, { label: string; count: number; totalAmount: number }> = {};
    for (const c of customerList) {
      const typeKey = c.customerType;
      const label = c.customerTypeLabel;
      if (!typeCountMap[typeKey]) {
        typeCountMap[typeKey] = { label, count: 0, totalAmount: 0 };
      }
      typeCountMap[typeKey].count++;
      typeCountMap[typeKey].totalAmount += c.totalQuoteAmount;
    }

    const customerTypeDistribution = Object.entries(typeCountMap).map(([type, data]) => ({
      type,
      label: data.label,
      count: data.count,
      totalAmount: data.totalAmount,
    }));

    return NextResponse.json({
      kpi: {
        totalCustomers,
        activeCustomerCount,
        totalQuoteSum,
      },
      customerTypeDistribution,
      customers: customerList,
    });
  } catch (error) {
    console.error("取得客戶資料統計失敗:", error);
    return NextResponse.json({ error: "無法取得客戶資料統計" }, { status: 500 });
  }
}
