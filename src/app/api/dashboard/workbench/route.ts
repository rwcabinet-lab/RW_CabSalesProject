import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { MILESTONE_STAGE_LABELS } from "@/lib/constants";
import { getUserFromRequest } from "@/lib/access-control";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// GET /api/dashboard/workbench?userId=xxx&month=2026-09&timeStandard=sign
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      const hasCookie = Boolean(req.cookies.get("cab_sales_user_id")?.value);
      return NextResponse.json(
        { error: hasCookie ? "登入已失效，請重新登入" : "請先登入" },
        { status: 401 }
      );
    }
    const currentUser = { id: user.id, name: user.name, role: user.role };

    const [initialProjects, tasks] = await Promise.all([
      DataService.getProjects({
        where: {
          OR: [
            { salesRepId: currentUser.id },
            { salesAssistantId: currentUser.id },
            { milestones: { some: { assignedToId: currentUser.id } } },
            { tasks: { some: { assignedToId: currentUser.id } } },
          ],
        },
      }),
      DataService.getTasks({ assignedToId: currentUser.id }),
    ]);

    // 若撈取的專案包含分期子案或母案，補充完整上下層級關係
    const parentIdsToFetch = initialProjects.map((p) => p.parentId).filter((id): id is string => Boolean(id));
    const projectIdsSet = new Set(initialProjects.map((p) => p.id));
    const missingParentIds = parentIdsToFetch.filter((id) => !projectIdsSet.has(id));

    // 同時查詢這些母案底下的所有分期，確保分期結構完整
    const masterIds = initialProjects.filter((p) => !p.parentId).map((p) => p.id).concat(missingParentIds);

    const [extraParents, extraPhases] = await Promise.all([
      missingParentIds.length > 0
        ? DataService.getProjects({ where: { id: { in: missingParentIds } } })
        : Promise.resolve([]),
      masterIds.length > 0
        ? DataService.getProjects({ where: { parentId: { in: masterIds } } })
        : Promise.resolve([]),
    ]);

    const allProjectsMap = new Map<string, typeof initialProjects[0]>();
    for (const p of [...initialProjects, ...extraParents, ...extraPhases]) {
      allProjectsMap.set(p.id, p);
    }
    const myProjects = Array.from(allProjectsMap.values());

    const projectIds = myProjects.map((p) => p.id);
    if (projectIds.length === 0) {
      return NextResponse.json({
        currentUser,
        myProjects: [],
        tasks,
      });
    }

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

        const trafficLight = p.currentStage === "LOST"
          ? { color: "GRAY" as const, label: "流標", daysDiff: 0 }
          : activeMilestone
          ? ScheduleEngine.getTrafficLight(activeMilestone)
          : { color: "GREEN" as const, label: "正常", daysDiff: 0 };

        const isClosed = ScheduleEngine.isProjectClosed(p, milestones);
        const isDelayed = isClosed || p.currentStage === "LOST" ? false : ScheduleEngine.isProjectDelayed(p, milestones);

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
          isDelayed,
          isClosed,
          salesRepId: p.salesRepId,
          salesRepName: p.salesRepName,
          salesAssistantId: p.salesAssistantId || null,
          salesAssistantName: p.salesAssistantName || null,
          unitCount: p.unitCount,
          cost: p.cost,
          quoteAmount: p.quoteAmount,
          totalAmount: p.quoteAmount ?? null,
          parentId: p.parentId || null,
          phaseNumber: p.phaseNumber || null,
          phaseName: p.phaseName || null,
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

    // 依據分期結構組織父子案件
    const phasesByParent = new Map<string, typeof projectsWithDetails>();
    for (const p of projectsWithDetails) {
      if (p.parentId) {
        const list = phasesByParent.get(p.parentId) || [];
        list.push(p);
        phasesByParent.set(p.parentId, list);
      }
    }

    const hierarchicalProjects = projectsWithDetails
      .filter((p) => !p.parentId)
      .map((parent) => {
        const childPhases = phasesByParent.get(parent.id) || [];
        childPhases.sort((a, b) => (a.phaseNumber || 0) - (b.phaseNumber || 0));

        if (childPhases.length > 0) {
          const totalQuote = childPhases.reduce((sum, c) => sum + (Number(c.quoteAmount) || 0), 0);
          const totalCost = childPhases.reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
          const totalUnits = childPhases.reduce((sum, c) => sum + (Number(c.unitCount) || 0), 0);

          let rolledColor: "RED" | "YELLOW" | "GREEN" | "GRAY" = "GREEN";
          let rolledLabel = "正常";
          if (childPhases.some((c) => c.trafficLight.color === "RED")) {
            rolledColor = "RED";
            rolledLabel = "逾期";
          } else if (childPhases.some((c) => c.trafficLight.color === "YELLOW")) {
            rolledColor = "YELLOW";
            rolledLabel = "即將到期";
          } else if (childPhases.every((c) => c.trafficLight.color === "GRAY")) {
            rolledColor = "GRAY";
            rolledLabel = "已結案";
          }

          const isAnyDelayed = childPhases.some((c) => c.isDelayed);
          const isAllClosed = childPhases.every((c) => c.isClosed);
          const upcomingDates = childPhases
            .map((c) => c.expectedDate)
            .filter(Boolean)
            .sort();

          return {
            ...parent,
            quoteAmount: totalQuote,
            totalAmount: totalQuote || null,
            cost: totalCost,
            unitCount: totalUnits,
            isDelayed: isAnyDelayed,
            isClosed: isAllClosed,
            expectedDate: upcomingDates[0] || "",
            trafficLight: { color: rolledColor, label: rolledLabel, daysDiff: 0 },
            phases: childPhases,
          };
        }

        return {
          ...parent,
          phases: [],
        };
      });

    const projectTrafficLightMap = new Map<string, string>();
    for (const p of projectsWithDetails) {
      if (p) {
        projectTrafficLightMap.set(p.id, p.trafficLight.label);
      }
    }

    const tasksWithPausedStatus = tasks.map((task) => {
      const projectLabel = projectTrafficLightMap.get(task.projectId);
      const isProjectPaused = projectLabel === "需追蹤";
      return {
        ...task,
        isPaused: Boolean(task.isPaused || isProjectPaused),
      };
    });

    return NextResponse.json({
      currentUser,
      myProjects: hierarchicalProjects,
      tasks: tasksWithPausedStatus,
    });
  } catch (error) {
    return handleApiError(error, "無法取得案場筆記資料");
  }
}
