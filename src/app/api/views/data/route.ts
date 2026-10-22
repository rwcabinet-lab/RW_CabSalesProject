import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";
import { getUserFromRequest } from "@/lib/access-control";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    // 1. 並行取得專案與登入使用者清單（使用者清單具備伺服端快取）
    const [projects, users] = await Promise.all([
      DataService.getProjects(),
      DataService.getLoginUsers(),
    ]);

    const projectIds = projects.map((p) => p.id);

    // 2. 僅針對現有專案批次查詢里程碑與關聯待辦，避免全表無限制掃描
    const [milestonesByProject, tasks] = await Promise.all([
      DataService.getMilestonesByProjectIds(projectIds),
      DataService.getTasks({ projectIds }),
    ]);
    const staff = users
      .filter((user): user is typeof user & { role: "SALES_MANAGER" | "SALES" | "ASSISTANT" | "SITE_ENGINEER" } =>
        user.role === "SALES_MANAGER" || user.role === "SALES" || user.role === "ASSISTANT" || user.role === "SITE_ENGINEER"
      )
      .map(({ id, name, role }) => ({ id, name, role }));

    const projectsWithMilestones = projects.map((p) => {
      const milestones = milestonesByProject[p.id] || [];
      const milestonesWithLights = milestones.map((m) => ({
        ...m,
        trafficLight: ScheduleEngine.getTrafficLight(m),
      }));

      const isDelayed = ScheduleEngine.isProjectDelayed(p, milestones);

      return {
        ...p,
        isDelayed,
        milestones: milestonesWithLights,
      };
    });

    return NextResponse.json({
      projects: projectsWithMilestones,
      tasks,
      staff,
    });
  } catch (error) {
    console.error("Visual views data error:", error);
    return NextResponse.json({ error: "無法取得可視化資料" }, { status: 500 });
  }
}
