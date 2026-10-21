import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { MILESTONE_STAGE_LABELS } from "@/lib/mock-data";
import { getUserFromRequest } from "@/lib/access-control";

export const dynamic = "force-dynamic";

// GET /api/dashboard/workbench?userId=xxx&month=2026-09&timeStandard=sign
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthFilter = searchParams.get("month"); // 格式 "2026-09"
    const startMonth = searchParams.get("startMonth");
    const endMonth = searchParams.get("endMonth");
    const user = await getUserFromRequest(req);
    if (!user) {
      const hasCookie = Boolean(req.cookies.get("cab_sales_user_id")?.value);
      return NextResponse.json(
        { error: hasCookie ? "登入已失效，請重新登入" : "請先登入" },
        { status: 401 }
      );
    }
    const currentUser = { id: user.id, name: user.name, role: user.role };

    const [myProjects, tasks] = await Promise.all([
      DataService.getProjects({
        where: {
          OR: [
            { salesRepId: currentUser.id },
            { salesAssistantId: currentUser.id },
            { customer: { salesRepId: currentUser.id } },
            { milestones: { some: { assignedToId: currentUser.id } } },
            { tasks: { some: { assignedToId: currentUser.id } } },
          ],
        },
      }),
      DataService.getTasks({ assignedToId: currentUser.id }),
    ]);

    const projectIds = myProjects.map((p) => p.id);
    const milestonesByProject = await DataService.getMilestonesByProjectIds(projectIds);

    // 月份過濾邏輯 (依預定完成日過濾當前進行中里程碑)
    const projectsWithDetails = myProjects.map((p) => {
        const milestones = milestonesByProject[p.id] || [];

        const specialStageCode = p.currentStage === "WRAP_UP" ? "X-1" : null;
        const activeMilestone = p.currentStage === "LOST"
          ? null
          : specialStageCode
            ? milestones.find((m) => m.stageCode === specialStageCode)
            : milestones.find((m) => m.status === "OVERDUE") ||
              milestones.find((m) => m.status === "IN_PROGRESS") ||
              milestones.find((m) => m.status === "PENDING") ||
              milestones[milestones.length - 1];

        // 月份篩選：比對 activeMilestone.plannedDueDate
        const dueMonth = activeMilestone?.plannedDueDate ? activeMilestone.plannedDueDate.slice(0, 7) : null;
        if (startMonth && (!dueMonth || dueMonth < startMonth)) return null;
        if (endMonth && (!dueMonth || dueMonth > endMonth)) return null;
        if (monthFilter && dueMonth !== monthFilter) return null;

        const trafficLight = p.currentStage === "LOST"
          ? { color: "GRAY" as const, label: "已流標", daysDiff: 0 }
          : activeMilestone
          ? ScheduleEngine.getTrafficLight(activeMilestone)
          : { color: "GREEN" as const, label: "正常", daysDiff: 0 };

        return {
          id: p.id,
          projectName: p.projectName,
          customerId: p.customerId,
          customerName: p.customerName,
          customerType: p.customerType,
          defaultDiscount: p.defaultDiscount,
          siteCondition: p.siteCondition || "",
          expectedDate: p.expectedDate || "",
          currentStage: p.currentStage,
          siteAddress: p.siteAddress,
          isDelayed: p.currentStage === "LOST" ? false : p.isDelayed,
          salesRepId: p.salesRepId,
          salesRepName: p.salesRepName,
          salesAssistantName: p.salesAssistantName || null,
          unitCount: p.unitCount,
          cost: p.cost,
          quoteAmount: p.quoteAmount,
          totalAmount: p.quoteAmount ?? null,
          activeMilestone: activeMilestone
            ? {
                id: activeMilestone.id,
                stageCode: activeMilestone.stageCode,
                phase: activeMilestone.phase,
                stageName: MILESTONE_STAGE_LABELS[activeMilestone.stageCode],
                plannedDueDate: activeMilestone.plannedDueDate,
                status: activeMilestone.status,
              }
            : null,
          trafficLight,
        };
      });

    const filteredProjects = projectsWithDetails.filter(Boolean);

    return NextResponse.json({
      currentUser,
      myProjects: filteredProjects,
      tasks,
    });
  } catch (error) {
    console.error("工作台資料錯誤:", error);
    return NextResponse.json({ error: "無法取得業務工作台資料" }, { status: 500 });
  }
}
