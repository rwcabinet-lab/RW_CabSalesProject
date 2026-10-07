import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { getUserFromRequest } from "@/lib/access-control";

// GET /api/projects — 主管取得所有案場，業務與業助僅取得相關案場
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const projects = await DataService.getProjects();
    if (user.role !== "SALES" && user.role !== "ASSISTANT") {
      return NextResponse.json(projects);
    }

    const projectIds = projects.map((project) => project.id);
    const [milestonesByProject, assignedTasks] = await Promise.all([
      DataService.getMilestonesByProjectIds(projectIds),
      DataService.getTasks({ assignedToId: user.id }),
    ]);
    const assignedProjectIds = new Set(assignedTasks.map((task) => task.projectId));
    for (const milestones of Object.values(milestonesByProject)) {
      for (const milestone of milestones) {
        if (milestone.assignedToId === user.id) assignedProjectIds.add(milestone.projectId);
      }
    }

    return NextResponse.json(projects.filter((project) =>
      project.salesRepId === user.id ||
      project.customerSalesRepId === user.id ||
      project.salesAssistantId === user.id ||
      assignedProjectIds.has(project.id)
    ));
  } catch (error) {
    console.error("取得案場清單失敗:", error);
    return NextResponse.json({ error: "無法取得案場清單" }, { status: 500 });
  }
}

// POST /api/projects — 新增案場
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectName, customerId, siteAddress, siteCondition, expectedDate, unitCount, cost, quoteAmount } = body;

    if (!projectName || !customerId || !siteAddress) {
      return NextResponse.json({ error: "案場名稱、關聯客戶、施工地址為必填欄位" }, { status: 400 });
    }

    const project = await DataService.addProject({
      projectName,
      customerId,
      siteAddress,
      siteCondition,
      expectedDate,
      unitCount: unitCount ? Number(unitCount) : undefined,
      cost: cost ? Number(cost) : undefined,
      quoteAmount: quoteAmount ? Number(quoteAmount) : undefined,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "新增案場失敗" }, { status: 500 });
  }
}

// PATCH /api/projects — 修改案場資料
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const updated = await DataService.updateProject(id, data);
    if (!updated) return NextResponse.json({ error: "找不到案場" }, { status: 404 });
    return NextResponse.json({ project: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "修改案場失敗" }, { status: 500 });
  }
}