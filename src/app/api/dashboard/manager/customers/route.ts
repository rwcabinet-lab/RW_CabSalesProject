import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";
import { MILESTONE_STAGE_LABELS } from "@/lib/mock-data";
import type { CustomerStatsDashboardDTO } from "@/types/dto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const [customers, projects, milestonesByProject, latestQuotesByProject] = await Promise.all([
      DataService.getCustomers(),
      DataService.getProjects(),
      DataService.getMilestonesByProjectIds(),
      DataService.getLatestQuotesByProjectIds(),
    ]);

    // Helper to check if project has contract signed / won
    const isProjectContractSigned = (p: (typeof projects)[0]) => {
      const ms = milestonesByProject[p.id] || [];
      const hasSignedMilestone = ms.some(
        (m) =>
          (m.stageCode === "3-5" || (m.stageCode as string) === "1-5" || (MILESTONE_STAGE_LABELS[m.stageCode as keyof typeof MILESTONE_STAGE_LABELS] || "").includes("簽約")) &&
          m.status === "COMPLETED"
      );
      const isPastContractStage = ["PRE_PROD", "PROD_SHIP", "INSTALL", "CLOSURE", "CLOSED", "BILLED"].includes(p.currentStage);
      return hasSignedMilestone || isPastContractStage;
    };

    // Group projects by customerId
    const projectsByCustomer: Record<string, typeof projects> = {};
    for (const p of projects) {
      if (!projectsByCustomer[p.customerId]) {
        projectsByCustomer[p.customerId] = [];
      }
      projectsByCustomer[p.customerId].push(p);
    }

    const customerTypeLabels: Record<string, string> = {
      LONGMEI_STORE: "隆美",
      CABINET_FACTORY: "工廠",
      DESIGN_COMPANY: "設計公司",
      DEALER_COMPANY: "經銷公司",
      CONSTRUCTION: "建設／營造",
      LABOR_MATERIAL: "連工帶料",
      INDIVIDUAL: "一般消費者",
      DESIGNER: "設計師",
      CONTRACTOR: "統包／營造",
      PR: "公關客戶",
      DEALER: "經銷商",
      HOMEOWNER: "一般消費者",
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
        (sum, p) => sum + (p.quoteAmount || latestQuotesByProject[p.id]?.totalAmount || p.estimatedBudget || 0),
        0
      );
      const signedProjects = cProjects.filter(isProjectContractSigned);
      const totalSignedAmount = signedProjects.reduce(
        (sum, p) => sum + (p.quoteAmount || latestQuotesByProject[p.id]?.totalAmount || p.estimatedBudget || 0),
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
        salesRepName: c.salesRepName || "",
        totalProjects,
        activeProjects,
        closedProjects,
        lostProjects,
        totalQuoteAmount,
        totalSignedAmount,
        latestProjectName: latestProject?.projectName || "",
        latestProjectStage: latestProject?.currentStage || "",
      };
    });

    // KPI Summary
    const totalCustomers = customerList.length;
    const activeCustomerCount = customerList.filter((c) => c.activeProjects > 0).length;
    const totalQuoteSum = customerList.reduce((sum, c) => sum + c.totalQuoteAmount, 0);
    const totalSignedSum = customerList.reduce((sum, c) => sum + c.totalSignedAmount, 0);

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

    const responseData: CustomerStatsDashboardDTO = {
      kpi: {
        totalCustomers,
        activeCustomerCount,
        totalQuoteSum,
        totalSignedSum,
      },
      customerTypeDistribution,
      customers: customerList,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("取得客戶資料統計失敗:", error);
    return NextResponse.json({ error: "無法取得客戶資料統計" }, { status: 500 });
  }
}
