import { NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [projects, milestonesByProject, tasks, users] = await Promise.all([
      DataService.getProjects(),
      DataService.getMilestonesByProjectIds(),
      DataService.getTasks(),
      DataService.getLoginUsers(),
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

      return {
        ...p,
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
