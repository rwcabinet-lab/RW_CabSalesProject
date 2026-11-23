import { isAssignableRole } from "@/lib/page-access";
import type { SalesWorkloadDTO } from "@/types/dto";

export interface WorkloadProjectInput {
  id: string;
  parentId?: string | null;
  currentStage: string;
  salesRepId?: string | null;
  salesRepName?: string | null;
  customerSalesRepId?: string | null;
  salesAssistantId?: string | null;
}

export interface WorkloadMilestoneInput {
  status: string;
  assignedToId?: string | null;
}

export interface WorkloadTaskInput {
  projectId: string;
  isCompleted: boolean;
  assignedToId?: string | null;
}

export interface WorkloadUserInput {
  id: string;
  name: string;
  role: string;
}

function formatRoleLabel(role?: string): string {
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
}

/**
 * 計算人員案場負載（業務、業助、工務等現階段涉入負責同仁）。
 * 多期專案之母案彙總容器（底下已有分期子案者）僅作資料夾彙整用途，不列入負載計數，
 * 避免母案容器與第 1 期等分期子案重複計數。
 */
export function computeSalesWorkload<TProject extends WorkloadProjectInput>(params: {
  projects: TProject[];
  milestonesByProject: Record<string, WorkloadMilestoneInput[]>;
  allTasks: WorkloadTaskInput[];
  allUsers: WorkloadUserInput[];
  isProjectDelayed: (project: TProject) => boolean;
}): SalesWorkloadDTO[] {
  const { projects, milestonesByProject, allTasks, allUsers, isProjectDelayed } = params;

  const assignableUsers = allUsers.filter((u) => isAssignableRole(u.role));
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  // 已有子分期之母案屬於純彙總容器，實務履約與進度均已遷移至各分期子案
  const parentProjectIds = new Set(
    projects.map((p) => p.parentId).filter((id): id is string => Boolean(id))
  );

  const workloadMap: Record<
    string,
    {
      name: string;
      role: string;
      roleLabel: string;
      projectIds: Set<string>;
      delayedProjectIds: Set<string>;
    }
  > = {};

  for (const u of assignableUsers) {
    workloadMap[u.id] = {
      name: u.name,
      role: u.role,
      roleLabel: formatRoleLabel(u.role),
      projectIds: new Set<string>(),
      delayedProjectIds: new Set<string>(),
    };
  }

  for (const p of projects) {
    if (parentProjectIds.has(p.id)) continue;

    const ms = milestonesByProject[p.id] || [];
    const delayed = isProjectDelayed(p);
    const activeMilestone =
      p.currentStage === "LOST"
        ? null
        : ms.find((m) => m.status === "OVERDUE") ||
          ms.find((m) => m.status === "IN_PROGRESS");

    const currentPersonnelIds = new Set<string>();

    // 1. 主責業務
    if (p.salesRepId) currentPersonnelIds.add(p.salesRepId);
    else if (p.customerSalesRepId) currentPersonnelIds.add(p.customerSalesRepId);

    // 2. 業務助理
    if (p.salesAssistantId) currentPersonnelIds.add(p.salesAssistantId);

    // 3. 現階段進行中／逾期里程碑負責人
    if (activeMilestone?.assignedToId) {
      currentPersonnelIds.add(activeMilestone.assignedToId);
    }

    // 4. 現階段未完成待辦任務負責人
    for (const t of allTasks) {
      if (t.projectId === p.id && !t.isCompleted && t.assignedToId) {
        currentPersonnelIds.add(t.assignedToId);
      }
    }

    for (const uid of currentPersonnelIds) {
      if (!workloadMap[uid]) {
        const u = userMap.get(uid);
        const role = u?.role || (uid === p.salesRepId ? "SALES" : "ASSISTANT");
        const name = u?.name || (uid === p.salesRepId ? p.salesRepName || "業務" : "同仁");
        workloadMap[uid] = {
          name,
          role,
          roleLabel: formatRoleLabel(role),
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

  return Object.values(workloadMap)
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
}
