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

    const [projects, tasks, users, milestonesByProject] = await Promise.all([
      DataService.getProjects(),
      DataService.getTasks(),
      DataService.getLoginUsers(),
      DataService.getMilestonesByProjectIds(),
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
