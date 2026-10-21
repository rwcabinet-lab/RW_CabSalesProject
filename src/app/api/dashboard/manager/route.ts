import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { MILESTONE_STAGE_LABELS } from "@/lib/constants";
import { getUserFromRequest } from "@/lib/access-control";

const MANAGER_ROLES = ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"];

export const dynamic = "force-dynamic";

function isValidDueDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return false;
  const date = new Date(`${datePart}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === datePart;
}

// GET /api/dashboard/manager?month=2026-09&timeStandard=sign
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const monthFilter = searchParams.get("month");
    const startMonth = searchParams.get("startMonth");
    const endMonth = searchParams.get("endMonth");

    const [projects, milestonesByProject, allAssignedTasks] = await Promise.all([
      DataService.getProjects(),
      DataService.getMilestonesByProjectIds(),
      DataService.getTasks({ assignedById: user.id }),
    ]);

    // 正規項目完成推進產生的里程碑待辦（含 milestoneId）不列入主管「已指派任務」列表
    const assignedTasks = allAssignedTasks.filter((task) => !task.milestoneId);

    // Helper to evaluate project delayed state
    const isProjectDelayed = (p: (typeof projects)[0]) => {
      if (p.currentStage === "LOST" || p.currentStage === "CLOSED" || p.currentStage === "BILLED") return false;
      const ms = milestonesByProject[p.id] || [];
      const activeM = ms.find((m) => m.status === "OVERDUE" || m.status === "IN_PROGRESS");
      if (activeM) {
        const tl = ScheduleEngine.getTrafficLight(activeM);
        return tl.color === "RED" || activeM.status === "OVERDUE";
      }
      return p.isDelayed;
    };

    // Helper to check if project has contract signed [送約/簽約] completed
    const isProjectContractSigned = (p: (typeof projects)[0]) => {
      const ms = milestonesByProject[p.id] || [];
      return ms.some(
        (m) =>
          (m.stageCode === "3-5" || (m.stageCode as string) === "1-5" || (MILESTONE_STAGE_LABELS[m.stageCode as keyof typeof MILESTONE_STAGE_LABELS] || "") === "送約/簽約") &&
          m.status === "COMPLETED"
      );
    };

    // 1. KPI 計算
    const totalProjects = projects.length;
    const delayedCount = projects.filter(isProjectDelayed).length;

    let signedTotal = 0;
    let contractedCount = 0;
    for (const p of projects) {
      if (isProjectContractSigned(p)) {
        contractedCount++;
        signedTotal += p.quoteAmount || p.estimatedBudget || 0;
      }
    }
    const conversionRate = totalProjects > 0 ? Math.round((contractedCount / totalProjects) * 100) : 0;

    // 2. 時程警示清單
    const alertList = projects
      .filter(isProjectDelayed)
      .map((p) => {
        const milestones = milestonesByProject[p.id] || [];
        const overdueMilestone =
          milestones.find((m) => m.status === "OVERDUE") ||
          milestones.find((m) => m.status === "IN_PROGRESS");
        const trafficLight = overdueMilestone ? ScheduleEngine.getTrafficLight(overdueMilestone) : null;
        return {
          id: p.id,
          projectName: p.projectName,
          customerName: p.customerName,
          customerType: p.customerType,
          currentStage: p.currentStage,
          salesRepName: p.salesRepName,
          salesAssistantName: p.salesAssistantName,
          stalledMilestone: overdueMilestone
            ? MILESTONE_STAGE_LABELS[overdueMilestone.stageCode]
            : "時程延誤",
          plannedDueDate: overdueMilestone?.plannedDueDate || "",
          overdueLabel: trafficLight?.label || "已逾期",
          notes: overdueMilestone?.notes || "需主管介入協調",
        };
      });

    // 3. 業務負載分佈
    const workloadMap: Record<string, { name: string; total: number; delayed: number }> = {};
    const addWorkload = (key: string, name: string, isDelayed: boolean) => {
      if (!workloadMap[key]) workloadMap[key] = { name, total: 0, delayed: 0 };
      workloadMap[key].total++;
      if (isDelayed) workloadMap[key].delayed++;
    };
    for (const p of projects) {
      const salesRepName = p.customerSalesRepName || p.salesRepName || "其他業務";
      addWorkload(`sales:${p.customerSalesRepId || p.salesRepId}`, `${salesRepName}（業務）`, isProjectDelayed(p));
      if (p.salesAssistantId && p.salesAssistantName) {
        addWorkload(`assistant:${p.salesAssistantId}`, `${p.salesAssistantName}（業助）`, isProjectDelayed(p));
      }
    }
    const salesWorkload = Object.values(workloadMap).map((stat) => ({
      salesRepName: stat.name,
      totalProjects: stat.total,
      delayedProjects: stat.delayed,
    }));

    // 4. 所有案件狀態總覽 (含月份過濾)
    const stageLabels: Record<string, string> = {
      DEVELOP:     "案件開發",
      REQUIREMENT: "現況及需求確認",
      PROPOSAL:    "設計提案/報價/簽約",
      PRE_PROD:    "生產前確認/拆單",
      PROD_SHIP:   "生產及派送",
      INSTALL:     "安裝及驗收",
      CLOSURE:     "結案/售後",
      CLOSED:      "已結案",
      BILLED:      "已立帳",
      WRAP_UP:     "收尾",
      LOST:        "已流標",
      DONE:        "完成",
      CONTACT:     "接洽期",
      DESIGN:      "設計確認期",
      PRODUCTION:  "生產施工期",
    };

    // 依月份區間過濾（使用 expectedDate 或當前進行中里程碑的 plannedDueDate）
    const filteredProjects = (startMonth || endMonth || monthFilter)
      ? projects.filter((p) => {
          const milestones = milestonesByProject[p.id] || [];
          const activeMilestone = p.currentStage === "LOST"
            ? null
            : milestones.find((m) => m.status === "IN_PROGRESS") ||
              milestones.find((m) => m.status === "OVERDUE");
          const dateToCheck = activeMilestone?.plannedDueDate || p.expectedDate || "";
          const targetMonth = dateToCheck.slice(0, 7);
          if (startMonth && targetMonth && targetMonth < startMonth) return false;
          if (endMonth && targetMonth && targetMonth > endMonth) return false;
          if ((startMonth || endMonth) && !targetMonth) return false;
          if (monthFilter && !targetMonth.startsWith(monthFilter)) return false;
          return true;
        })
      : projects;

    const allProjectsOverview = filteredProjects.map((p) => {
      const milestones = milestonesByProject[p.id] || [];
      const lastCompletedMilestone = milestones
        .filter((milestone) => milestone.status === "COMPLETED")
        .sort((a, b) => b.stageOrder - a.stageOrder)[0];
      const activeMilestone = p.currentStage === "LOST"
        ? null
        : milestones.find((m) => m.status === "OVERDUE") ||
          milestones.find((m) => m.status === "IN_PROGRESS");
      const trafficLight = activeMilestone
        ? ScheduleEngine.getTrafficLight(activeMilestone)
        : { color: "GRAY" as const, label: "無進行中項目", daysDiff: 0 };

      const isDelayed = isProjectDelayed(p);

      return {
        id: p.id,
        projectName: p.projectName,
        siteAddress: p.siteAddress,
        customerName: p.customerName,
        customerType: p.customerType,
        defaultDiscount: p.defaultDiscount,
        currentStage: p.currentStage,
        currentStageLabel: p.currentStage === "LOST" ? "已流標" : stageLabels[p.currentStage] || p.currentStage,
        salesRepName: p.customerSalesRepName || p.salesRepName,
        salesAssistantName: p.currentStage === "LOST" ? null : activeMilestone?.assignedToName || null,
        isDelayed: p.currentStage === "LOST" ? false : isDelayed,
        trafficLight: p.currentStage === "LOST"
          ? { color: "GRAY" as const, label: "已流標", daysDiff: 0 }
          : trafficLight,
        expectedDate: p.expectedDate || "",
        unitCount: p.unitCount,
        cost: p.cost,
        quoteAmount: p.quoteAmount,
        totalAmount: p.quoteAmount ?? p.estimatedBudget ?? null,
        lastCompletedMilestoneName: lastCompletedMilestone
          ? MILESTONE_STAGE_LABELS[lastCompletedMilestone.stageCode]
          : null,
        activeMilestoneName: p.currentStage === "LOST"
          ? null
          : activeMilestone
          ? MILESTONE_STAGE_LABELS[activeMilestone.stageCode]
          : "完結",
        activeMilestoneId: activeMilestone?.id || null,
        activeMilestoneAssignedTo: activeMilestone?.assignedToName || null,
        unassignedNextMilestoneName: (() => {
          if (p.currentStage === "WRAP_UP" || p.currentStage === "LOST") return null;
          const nextIndex = milestones.findIndex((milestone) => milestone.status !== "COMPLETED");
          return nextIndex > 0 &&
            milestones[nextIndex - 1].status === "COMPLETED" &&
            !milestones[nextIndex].assignedToId
            ? MILESTONE_STAGE_LABELS[milestones[nextIndex].stageCode]
            : null;
        })(),
      };
    });

    // 5. 階段瓶頸分析 (嚴格統計七大階段)
    const sevenStages: Array<{ stage: string; label: string; aliases: string[] }> = [
      { stage: "DEVELOP", label: "一、案件開發", aliases: ["DEVELOP", "CONTACT"] },
      { stage: "REQUIREMENT", label: "二、現況及需求確認", aliases: ["REQUIREMENT"] },
      { stage: "PROPOSAL", label: "三、設計提案/報價/簽約", aliases: ["PROPOSAL", "DESIGN"] },
      { stage: "PRE_PROD", label: "四、生產前確認/拆單", aliases: ["PRE_PROD"] },
      { stage: "PROD_SHIP", label: "五、生產及派送", aliases: ["PROD_SHIP", "PRODUCTION"] },
      { stage: "INSTALL", label: "六、安裝及驗收", aliases: ["INSTALL"] },
      { stage: "CLOSURE", label: "七、結案/售後", aliases: ["CLOSURE", "CLOSED", "BILLED", "WRAP_UP"] },
    ];

    const stageBottlenecks = sevenStages.map(({ stage, label, aliases }) => {
      let projectCount = 0;
      let stageDelayedCount = 0;
      for (const p of projects) {
        if (aliases.includes(p.currentStage)) {
          projectCount++;
          if (isProjectDelayed(p)) {
            stageDelayedCount++;
          }
        }
      }
      return {
        stage,
        stageLabel: label,
        projectCount,
        delayedCount: stageDelayedCount,
      };
    });

    return NextResponse.json({
      kpi: { totalProjects, signedTotal, conversionRate, delayedCount },
      alertList,
      salesWorkload,
      stageBottlenecks,
      allProjectsOverview,
      assignedTasks,
    });
  } catch (error) {
    console.error("主管看板資料錯誤:", error);
    return NextResponse.json({ error: "無法取得主管看板資料" }, { status: 500 });
  }
}

// POST /api/dashboard/manager — 主管指派任務給業務/業助
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
    if (!MANAGER_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "僅主管可指派待辦任務" }, { status: 403 });
    }
    const body = await req.json();
    const { projectId, assignedToId, subject, taskType, dueDatetime, priority } = body;

    if (!projectId || !assignedToId || !subject || !isValidDueDate(dueDatetime)) {
      return NextResponse.json({ error: "請填寫案場、負責人、任務主題及有效的預定完成日" }, { status: 400 });
    }

    const assignee = await DataService.getUserById(assignedToId);
    if (!assignee) {
      return NextResponse.json({ error: "找不到指派對象" }, { status: 404 });
    }
    if (assignee.role !== "SALES_MANAGER" && assignee.role !== "SALES" && assignee.role !== "ASSISTANT") {
      return NextResponse.json({ error: "指派對象必須是業務主管、業務或業助" }, { status: 400 });
    }
    if (priority && !["HIGH", "MEDIUM", "LOW"].includes(priority)) {
      return NextResponse.json({ error: "優先度設定無效" }, { status: 400 });
    }

    const task = await DataService.addTask({
      projectId,
      assignedToId,
      assignedToName: assignee.name,
      assignedById: user.id,
      subject,
      taskType: taskType || "QUOTE_FOLLOWUP",
      dueDatetime: `${dueDatetime.slice(0, 10)}T00:00:00.000Z`,
      priority: priority || "MEDIUM",
      isCompleted: false,
      resultNotes: null,
      completedAt: null,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("指派任務失敗:", error);
    return NextResponse.json({ error: "指派任務失敗" }, { status: 500 });
  }
}

// PATCH /api/dashboard/manager — 修改主管指派任務
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
    if (!MANAGER_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "僅主管可修改指派待辦" }, { status: 403 });
    }
    const body = await req.json();
    const { taskId, assignedToId, subject, priority, dueDatetime } = body;
    if (!taskId || !assignedToId || !subject || !priority || !isValidDueDate(dueDatetime)) {
      return NextResponse.json({ error: "請填寫任務、負責人、主題、優先度及有效的預定完成日" }, { status: 400 });
    }
    if (!["HIGH", "MEDIUM", "LOW"].includes(priority)) {
      return NextResponse.json({ error: "優先度設定無效" }, { status: 400 });
    }

    const assignee = await DataService.getUserById(assignedToId);
    if (!assignee) {
      return NextResponse.json({ error: "找不到指派對象" }, { status: 404 });
    }
    if (assignee.role !== "SALES_MANAGER" && assignee.role !== "SALES" && assignee.role !== "ASSISTANT") {
      return NextResponse.json({ error: "指派對象必須是業務主管、業務或業助" }, { status: 400 });
    }

    const task = await DataService.updateTask(taskId, {
      assignedToId, subject, priority, dueDatetime: `${dueDatetime.slice(0, 10)}T00:00:00.000Z`,
    });
    if (!task) return NextResponse.json({ error: "查無此任務" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (error) {
    console.error("修改指派任務失敗:", error);
    return NextResponse.json({ error: "修改指派任務失敗" }, { status: 500 });
  }
}
