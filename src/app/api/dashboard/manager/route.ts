import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { MILESTONE_STAGE_LABELS } from "@/lib/mock-data";

// GET /api/dashboard/manager?month=2026-09&timeStandard=sign
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthFilter = searchParams.get("month");

    const projects = await DataService.getProjects();
    const projectIds = projects.map((p) => p.id);
    const [milestonesByProject, latestQuotesByProject] = await Promise.all([
      DataService.getMilestonesByProjectIds(projectIds),
      DataService.getLatestQuotesByProjectIds(projectIds),
    ]);

    // 1. KPI 計算
    const totalProjects = projects.length;
    const delayedProjects = projects.filter((p) => p.isDelayed);
    const delayedCount = delayedProjects.length;

    let signedTotal = 0;
    let contractedCount = 0;
    for (const p of projects) {
      const latestQuote = latestQuotesByProject[p.id];
      if (["DESIGN", "PRODUCTION", "CLOSED", "BILLED"].includes(p.currentStage)) {
        contractedCount++;
        signedTotal += latestQuote?.totalAmount || p.estimatedBudget || 0;
      }
    }
    const conversionRate = totalProjects > 0 ? Math.round((contractedCount / totalProjects) * 100) : 0;

    // 2. 時程警示清單
    const alertList = projects
      .filter((p) => p.isDelayed)
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
    const workloadMap: Record<string, { total: number; delayed: number }> = {};
    for (const p of projects) {
      const rep = p.salesRepName || "其他業務";
      if (!workloadMap[rep]) workloadMap[rep] = { total: 0, delayed: 0 };
      workloadMap[rep].total++;
      if (p.isDelayed) workloadMap[rep].delayed++;
    }
    const salesWorkload = Object.entries(workloadMap).map(([name, stat]) => ({
      salesRepName: name,
      totalProjects: stat.total,
      delayedProjects: stat.delayed,
    }));

    // 4. 所有案件狀態總覽 (含月份過濾)
    const stageLabels: Record<string, string> = {
      CONTACT:    "接洽期",
      DESIGN:     "設計確認期",
      PRODUCTION: "生產施工期",
      CLOSED:     "已結案",
      BILLED:     "已立帳",
      WRAP_UP:    "收尾中",
      LOST:       "已流標",
      DONE:       "完成",
    };

    // 依月份過濾（使用 expectedDate 或當前進行中里程碑的 plannedDueDate）
    const filteredProjects = monthFilter
      ? projects.filter((p) => {
          const milestones = milestonesByProject[p.id] || [];
          const activeMilestone =
            milestones.find((m) => m.status === "IN_PROGRESS") ||
            milestones.find((m) => m.status === "OVERDUE");
          const dateToCheck = activeMilestone?.plannedDueDate || p.expectedDate || "";
          return dateToCheck.startsWith(monthFilter);
        })
      : projects;

    const allProjectsOverview = filteredProjects.map((p) => {
      const milestones = milestonesByProject[p.id] || [];
      const activeMilestone =
        milestones.find((m) => m.status === "OVERDUE") ||
        milestones.find((m) => m.status === "IN_PROGRESS");
      const trafficLight = activeMilestone
        ? ScheduleEngine.getTrafficLight(activeMilestone)
        : { color: "GRAY" as const, label: "無進行中項目", daysDiff: 0 };

      return {
        id: p.id,
        projectName: p.projectName,
        customerName: p.customerName,
        customerType: p.customerType,
        currentStage: p.currentStage,
        currentStageLabel: stageLabels[p.currentStage] || p.currentStage,
        salesRepName: p.salesRepName,
        salesAssistantName: p.salesAssistantName,
        isDelayed: p.isDelayed,
        trafficLight,
        expectedDate: p.expectedDate || "",
        unitCount: p.unitCount,
        totalAmount: latestQuotesByProject[p.id]?.totalAmount ?? p.estimatedBudget ?? null,
        activeMilestoneName: activeMilestone
          ? MILESTONE_STAGE_LABELS[activeMilestone.stageCode]
          : "完結",
        activeMilestoneId: activeMilestone?.id || null,
        activeMilestoneAssignedTo: activeMilestone?.assignedToName || null,
      };
    });

    // 5. 階段瓶頸分析
    const stageCountMap: Record<string, { count: number; delayedCount: number; label: string }> = {
      CONTACT:    { count: 0, delayedCount: 0, label: "接洽期" },
      DESIGN:     { count: 0, delayedCount: 0, label: "設計確認期" },
      PRODUCTION: { count: 0, delayedCount: 0, label: "生產施工期" },
      CLOSED:     { count: 0, delayedCount: 0, label: "已結案" },
      BILLED:     { count: 0, delayedCount: 0, label: "已立帳" },
    };
    for (const p of projects) {
      if (stageCountMap[p.currentStage]) {
        stageCountMap[p.currentStage].count++;
        if (p.isDelayed) stageCountMap[p.currentStage].delayedCount++;
      }
    }
    const stageBottlenecks = Object.entries(stageCountMap).map(([stage, data]) => ({
      stage,
      stageLabel: data.label,
      projectCount: data.count,
      delayedCount: data.delayedCount,
    }));

    return NextResponse.json({
      kpi: { totalProjects, signedTotal, conversionRate, delayedCount },
      alertList,
      salesWorkload,
      stageBottlenecks,
      allProjectsOverview,
    });
  } catch (error) {
    console.error("主管看板資料錯誤:", error);
    return NextResponse.json({ error: "無法取得主管看板資料" }, { status: 500 });
  }
}

// POST /api/dashboard/manager — 主管指派任務給業務/業助
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, assignedToId, assignedToName, subject, taskType, dueDatetime, priority } = body;

    if (!projectId || !assignedToId || !subject) {
      return NextResponse.json({ error: "缺少必填欄位：案場、負責人、任務主題" }, { status: 400 });
    }

    const task = await DataService.addTask({
      projectId,
      assignedToId,
      assignedToName: assignedToName || "業務人員",
      subject,
      taskType: taskType || "QUOTE_FOLLOWUP",
      dueDatetime: dueDatetime || new Date().toISOString(),
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
