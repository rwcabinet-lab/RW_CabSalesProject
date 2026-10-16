import { NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [projects, tasks, users] = await Promise.all([
      DataService.getProjects(),
      DataService.getTasks(),
      DataService.getLoginUsers(),
    ]);
    const milestonesByProject = await DataService.getMilestonesByProjectIds(projects.map((project) => project.id));
    const staff = users
      .filter((user): user is typeof user & { role: "SALES_MANAGER" | "SALES" | "ASSISTANT" } =>
        user.role === "SALES_MANAGER" || user.role === "SALES" || user.role === "ASSISTANT"
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
