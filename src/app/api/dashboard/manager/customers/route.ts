import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import type { CustomerStatsDashboardDTO } from "@/types/dto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    if (!["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"].includes(user.role)) {
      return NextResponse.json({ error: "僅主管層級可查閱客戶營運統計" }, { status: 403 });
    }

    // 利用 SQL 關聯查詢一次性取得客戶與案場摘要，並僅單獨撈取簽約里程碑 ID，徹底消除全資料表里程碑載入至記憶體的 OOM 隱患
    const [customers, signedMilestoneRows, closedMilestoneRows] = await Promise.all([
      prisma.customer.findMany({
        relationLoadStrategy: "join",
        include: {
          salesRep: { select: { id: true, name: true } },
          projects: {
            select: {
              id: true,
              projectName: true,
              currentStage: true,
              quoteAmount: true,
              estimatedBudget: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.projectMilestone.findMany({
        where: {
          stageCode: { in: ["3-5", "1-5"] },
          status: "COMPLETED",
        },
        select: { projectId: true },
      }),
      prisma.projectMilestone.findMany({
        where: {
          stageCode: "7-2",
          status: "COMPLETED",
        },
        select: { projectId: true },
      }),
    ]);

    const signedProjectIds = new Set(signedMilestoneRows.map((m) => m.projectId));
    const closedProjectIds = new Set(closedMilestoneRows.map((m) => m.projectId));

    // Helper to check if project has contract signed / won
    const isProjectContractSigned = (p: { id: string; currentStage: string }) => {
      const isPastContractStage = ["PRE_PROD", "PROD_SHIP", "INSTALL", "CLOSURE", "CLOSED", "BILLED"].includes(p.currentStage);
      return signedProjectIds.has(p.id) || isPastContractStage;
    };

    // Helper to check if project is closed (依據 [請款] 里程碑是否完成)
    const isProjectClosed = (p: { id: string; currentStage: string }) => {
      return closedProjectIds.has(p.id) || p.currentStage === "CLOSED" || p.currentStage === "BILLED";
    };

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
      const cProjects = c.projects;
      const totalProjects = cProjects.length;
      const activeProjects = cProjects.filter(
        (p) => p.currentStage !== "LOST" && !isProjectClosed(p)
      ).length;
      const closedProjects = cProjects.filter(isProjectClosed).length;
      const lostProjects = cProjects.filter((p) => p.currentStage === "LOST").length;
      const totalQuoteAmount = cProjects.reduce(
        (sum, p) => sum + (Number(p.quoteAmount) || Number(p.estimatedBudget) || 0),
        0
      );
      const signedProjects = cProjects.filter(isProjectContractSigned);
      const totalSignedAmount = signedProjects.reduce(
        (sum, p) => sum + (Number(p.quoteAmount) || Number(p.estimatedBudget) || 0),
        0
      );
      const latestProject = cProjects[0]; // ordered by createdAt desc

      return {
        id: c.id,
        name: c.name,
        customerType: c.customerType === "CONTRACTOR" ? "PR" : c.customerType,
        customerTypeLabel: customerTypeLabels[c.customerType] || c.customerType,
        taxId: c.taxId || "",
        phone: c.phone || "",
        address: c.address || "",
        defaultDiscount: Number(c.defaultDiscount),
        paymentTerms: c.paymentTerms,
        salesRepId: c.salesRepId,
        salesRepName: c.salesRep?.name || "",
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
