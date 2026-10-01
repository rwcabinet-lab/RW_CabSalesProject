import { NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { ScheduleEngine } from "@/lib/schedule-engine";

export async function GET() {
  try {
    const projects = await DataService.getProjects();
    const tasks = await DataService.getTasks();
    const milestonesByProject = await DataService.getMilestonesByProjectIds(projects.map((project) => project.id));

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
    });
  } catch (error) {
    console.error("Visual views data error:", error);
    return NextResponse.json({ error: "無法取得可視化資料" }, { status: 500 });
  }
}
