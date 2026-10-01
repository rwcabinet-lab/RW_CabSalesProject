import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { MILESTONE_STAGE_LABELS } from "@/lib/mock-data";

// GET /api/dashboard/workbench?userId=xxx&month=2026-09&timeStandard=sign
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedUserId = req.cookies.get("cab_sales_user_id")?.value;
    const monthFilter = searchParams.get("month"); // 格式 "2026-09"
    if (!requestedUserId) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const [user, allProjects] = await Promise.all([
      DataService.getUserById(requestedUserId),
      DataService.getProjects(),
    ]);
    if (!user) {
      return NextResponse.json({ error: "登入已失效，請重新登入" }, { status: 401 });
    }
    const currentUser = { id: user.id, name: user.name, role: user.role };

    // 業務/業助：只顯示自己負責或被分配的案件
    const isManager = currentUser.role === "MANAGER" || currentUser.role === "ADMIN";
    const myProjects = isManager
      ? allProjects
      : allProjects.filter(
          (p) => p.salesRepId === currentUser.id || p.salesAssistantId === currentUser.id
        );

    const projectIds = myProjects.map((p) => p.id);
    const [milestonesByProject, latestQuotesByProject, tasks] = await Promise.all([
      DataService.getMilestonesByProjectIds(projectIds),
      DataService.getLatestQuotesByProjectIds(projectIds),
      DataService.getTasks(
        isManager ? undefined : { assignedToId: currentUser.id }
      ),
    ]);

    // 月份過濾邏輯 (依預定完成日過濾當前進行中里程碑)
    const projectsWithDetails = await Promise.all(
      myProjects.map(async (p) => {
        const milestones = milestonesByProject[p.id] || [];

        // 找出當前活躍里程碑
        const activeMilestone =
          milestones.find((m) => m.status === "OVERDUE") ||
          milestones.find((m) => m.status === "IN_PROGRESS") ||
          milestones.find((m) => m.status === "PENDING") ||
          milestones[milestones.length - 1];

        // 月份篩選：若指定月份，比對 activeMilestone.plannedDueDate
        if (monthFilter && activeMilestone?.plannedDueDate) {
          const dueMonth = activeMilestone.plannedDueDate.slice(0, 7);
          if (dueMonth !== monthFilter) return null;
        } else if (monthFilter && !activeMilestone?.plannedDueDate) {
          return null;
        }

        const trafficLight = activeMilestone
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
          isDelayed: p.isDelayed,
          unitCount: p.unitCount,
          cost: p.cost,
          quoteAmount: p.quoteAmount,
          totalAmount: latestQuotesByProject[p.id]?.totalAmount ?? null,
          activeMilestone: activeMilestone
            ? {
                id: activeMilestone.id,
                stageCode: activeMilestone.stageCode,
                stageName: MILESTONE_STAGE_LABELS[activeMilestone.stageCode],
                plannedDueDate: activeMilestone.plannedDueDate,
                status: activeMilestone.status,
              }
            : null,
          trafficLight,
        };
      })
    );

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
