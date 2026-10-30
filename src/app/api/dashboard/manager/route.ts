import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { MILESTONE_STAGE_LABELS } from "@/lib/constants";
import { getUserFromRequest } from "@/lib/access-control";
import { handleApiError } from "@/lib/errors";
import { isAssignableRole } from "@/lib/page-access";

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
    if (!MANAGER_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "僅主管層級可查閱營運總覽資料" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const monthFilter = searchParams.get("month");
    const startMonth = searchParams.get("startMonth");
    const endMonth = searchParams.get("endMonth");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const [projects, allTasks, milestonesByProject, allUsers] = await Promise.all([
      DataService.getProjects(),
      DataService.getTasks(),
      DataService.getMilestonesByProjectIds(),
      DataService.getLoginUsers(),
    ]);

    // 正規項目完成推進產生的里程碑待辦（含 milestoneId）不列入主管「已指派任務」列表
    const assignedTasks = allTasks.filter((task) => !task.milestoneId && task.assignedById === user.id);

    // Helper to evaluate if project is closed (依據 [請款] 里程碑是否完成)
    const isProjectClosed = (p: (typeof projects)[0]) => {
      const ms = milestonesByProject[p.id] || [];
      return ScheduleEngine.isProjectClosed(p, ms);
    };

    // Helper to evaluate project delayed state
    const isProjectDelayed = (p: (typeof projects)[0]) => {
      const ms = milestonesByProject[p.id] || [];
      return ScheduleEngine.isProjectDelayed(p, ms);
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

    // 3. 人員案場負載與異常分佈 (含業務、業助、工務等現階段負責同仁)
    const assignableUsers = allUsers.filter((u) => isAssignableRole(u.role));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const formatRoleLabel = (role?: string) => {
      switch (role) {
        case "SALES_MANAGER":
          return "業務主管";
        case "SALES":
          return "業務";
        case "ASSISTANT":
          return "業助";
        case "SITE_ENGINEER":
          return "工務";
        default:
          return "同仁";
      }
    };

    const workloadMap: Record<string, {
      name: string;
      role: string;
      roleLabel: string;
      projectIds: Set<string>;
      delayedProjectIds: Set<string>;
    }> = {};

    // 預先登記所有可指派人員
    for (const u of assignableUsers) {
      const roleLabel = formatRoleLabel(u.role);
      workloadMap[u.id] = {
        name: `${u.name}（${roleLabel}）`,
        role: u.role,
        roleLabel,
        projectIds: new Set<string>(),
        delayedProjectIds: new Set<string>(),
      };
    }

    for (const p of projects) {
      const ms = milestonesByProject[p.id] || [];
      const delayed = isProjectDelayed(p);
      const activeMilestone = p.currentStage === "LOST"
        ? null
        : ms.find((m) => m.status === "OVERDUE") ||
          ms.find((m) => m.status === "IN_PROGRESS");

      // 收集該案場於現階段涉入的負責同仁 (主責業務、業務助理、現階段進行中里程碑負責人、未完成待辦任務負責人)
      const currentPersonnelIds = new Set<string>();

      // 1. 主責業務
      if (p.salesRepId) currentPersonnelIds.add(p.salesRepId);
      else if (p.customerSalesRepId) currentPersonnelIds.add(p.customerSalesRepId);

      // 2. 業務助理 (若專案主檔有指定)
      if (p.salesAssistantId) currentPersonnelIds.add(p.salesAssistantId);

      // 3. 現階段里程碑負責人 (如工務、業助等承接當前進度之同仁)
      if (activeMilestone?.assignedToId) {
        currentPersonnelIds.add(activeMilestone.assignedToId);
      }

      // 4. 現階段待辦任務負責人
      for (const t of allTasks) {
        if (t.projectId === p.id && !t.isCompleted && t.assignedToId) {
          currentPersonnelIds.add(t.assignedToId);
        }
      }

      for (const uid of currentPersonnelIds) {
        if (!workloadMap[uid]) {
          const u = userMap.get(uid);
          const role = u?.role || (uid === p.salesRepId ? "SALES" : "ASSISTANT");
          const roleLabel = formatRoleLabel(role);
          const name = u?.name || (uid === p.salesRepId ? p.salesRepName || "業務" : "同仁");
          workloadMap[uid] = {
            name: `${name}（${roleLabel}）`,
            role,
            roleLabel,
            projectIds: new Set<string>(),
            delayedProjectIds: new Set<string>(),
          };
        }

        workloadMap[uid].projectIds.add(p.id);
        if (delayed || activeMilestone?.status === "OVERDUE") {
          workloadMap[uid].delayedProjectIds.add(p.id);
        }
      }
    }

    // 依總案場數由多到少排序，負載較高與進行中案件優先呈現
    const salesWorkload = Object.values(workloadMap)
      .map((stat) => ({
        salesRepName: stat.name,
        role: stat.role,
        roleLabel: stat.roleLabel,
        totalProjects: stat.projectIds.size,
        delayedProjects: stat.delayedProjectIds.size,
      }))
      .sort((a, b) => {
        if (b.totalProjects !== a.totalProjects) return b.totalProjects - a.totalProjects;
        if (b.delayedProjects !== a.delayedProjects) return b.delayedProjects - a.delayedProjects;
        return a.salesRepName.localeCompare(b.salesRepName, "zh-TW");
      });

    // 4. 所有案件狀態總覽 (含月份過濾)
    const stageLabels: Record<string, string> = {
      DEVELOP:     "案件開發",
      REQUIREMENT: "現況及需求確認",
      PROPOSAL:    "設計提案/報價/簽約",
      PRE_PROD:    "生產前確認/拆單",
      PROD_SHIP:   "生產及派送",
      INSTALL:     "安裝及驗收",
      CLOSURE:     "請款/售後",
      CLOSED:      "請款",
      BILLED:      "請款",
      WRAP_UP:     "收尾",
      LOST:        "流標",
      DONE:        "完成",
      CONTACT:     "接洽期",
      DESIGN:      "設計確認期",
      PRODUCTION:  "生產施工期",
    };

    // 依時間區間過濾（支援日期區間與月份區間，使用 expectedDate 或當前進行中里程碑的 plannedDueDate）
    const filteredProjects = (startDate || endDate || startMonth || endMonth || monthFilter)
      ? projects.filter((p) => {
          const milestones = milestonesByProject[p.id] || [];
          const activeMilestone = p.currentStage === "LOST"
            ? null
            : milestones.find((m) => m.status === "IN_PROGRESS") ||
              milestones.find((m) => m.status === "OVERDUE");
          const dateToCheck = activeMilestone?.plannedDueDate || p.expectedDate || "";
          const targetDate = dateToCheck ? dateToCheck.slice(0, 10) : "";
          const targetMonth = dateToCheck ? dateToCheck.slice(0, 7) : "";

          if (startDate && targetDate && targetDate < startDate) return false;
          if (endDate && targetDate && targetDate > endDate) return false;
          if ((startDate || endDate) && !targetDate) return false;

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
      const isClosed = isProjectClosed(p);

      return {
        id: p.id,
        projectName: p.projectName,
        siteAddress: p.siteAddress,
        customerName: p.customerName,
        customerType: p.customerType,
        defaultDiscount: p.defaultDiscount,
        currentStage: p.currentStage,
        currentStageLabel: p.currentStage === "LOST" ? "流標" : isClosed ? "請款" : stageLabels[p.currentStage] || p.currentStage,
        salesRepName: p.salesRepName || p.customerSalesRepName,
        salesAssistantName: p.currentStage === "LOST" ? null : activeMilestone?.assignedToName || null,
        isDelayed: p.currentStage === "LOST" ? false : isDelayed,
        isClosed,
        trafficLight: p.currentStage === "LOST"
          ? { color: "GRAY" as const, label: "流標", daysDiff: 0 }
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
      { stage: "CLOSURE", label: "七、請款/售後", aliases: ["CLOSURE", "CLOSED", "BILLED", "WRAP_UP"] },
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
    return handleApiError(error, "無法取得主管監控室資料");
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
    if (assignee.role === "ADMIN" || assignee.role === "LEVEL_MANAGER") {
      return NextResponse.json({ error: "指派對象不可為管理者或理級主管" }, { status: 400 });
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
    return handleApiError(error, "指派任務失敗");
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
    if (assignee.role === "ADMIN" || assignee.role === "LEVEL_MANAGER") {
      return NextResponse.json({ error: "指派對象不可為管理者或理級主管" }, { status: 400 });
    }

    const task = await DataService.updateTask(taskId, {
      assignedToId, subject, priority, dueDatetime: `${dueDatetime.slice(0, 10)}T00:00:00.000Z`,
    });
    if (!task) return NextResponse.json({ error: "查無此任務" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (error) {
    return handleApiError(error, "修改指派任務失敗");
  }
}
