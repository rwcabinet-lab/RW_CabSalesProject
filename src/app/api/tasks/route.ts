import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { AUDIT_STAGE_CODES } from "@/lib/constants";
import { getUserFromRequest } from "@/lib/access-control";
import { getVerifiedUserIdFromRequest } from "@/lib/session";
import { handleApiError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      const hasCookie = Boolean(req.cookies.get("cab_sales_user_id")?.value);
      return NextResponse.json(
        { error: hasCookie ? "登入已失效，請重新登入" : "請先登入" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;
    let assignedToId = searchParams.get("assignedToId") || undefined;
    const isCompletedParam = searchParams.get("isCompleted");

    let isCompleted: boolean | undefined = undefined;
    if (isCompletedParam === "true") isCompleted = true;
    if (isCompletedParam === "false") isCompleted = false;

    const isManager = ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"].includes(user.role);

    if (!isManager) {
      if (!projectId) {
        // 非管理員且未指定案件：嚴格限制只能存取指派給自己的任務
        assignedToId = user.id;
      } else {
        // 指定案件時：確認是否為該案件相關人員
        const targetProject = await DataService.getProjectById(projectId, { evaluateSchedule: false });
        const isProjectStaff =
          targetProject &&
          (targetProject.salesRepId === user.id ||
            targetProject.salesAssistantId === user.id ||
            targetProject.customerSalesRepId === user.id);
        if (!isProjectStaff) {
          assignedToId = user.id;
        }
      }
    }

    const tasks = await DataService.getTasks({
      projectId,
      assignedToId,
      isCompleted,
    });

    return NextResponse.json(tasks);
  } catch (error) {
    return handleApiError(error, "無法取得待辦任務");
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUserId = await getVerifiedUserIdFromRequest(req);
    if (!sessionUserId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

    const body = await req.json();
    const { projectId, subject, taskType, dueDatetime, priority, assignedToId } = body;

    if (!projectId || !subject || !dueDatetime) {
      return NextResponse.json({ error: "請填寫必要欄位 (案場、主題、到期時間)" }, { status: 400 });
    }
    if (
      typeof projectId !== "string" ||
      typeof subject !== "string" ||
      typeof dueDatetime !== "string" ||
      Number.isNaN(new Date(dueDatetime).getTime())
    ) {
      return NextResponse.json({ error: "待辦欄位格式無效" }, { status: 400 });
    }
    if (priority !== undefined && !["HIGH", "MEDIUM", "LOW"].includes(priority)) {
      return NextResponse.json({ error: "優先度設定無效" }, { status: 400 });
    }

    const targetProject = await DataService.getProjectById(projectId, { evaluateSchedule: false });
    if (!targetProject) {
      return NextResponse.json({ error: "找不到該案場" }, { status: 404 });
    }
    if (targetProject.currentStage === "LOST" || targetProject.currentStage === "CLOSED" || targetProject.currentStage === "BILLED") {
      return NextResponse.json({ error: "此案場已流標或請款完成，無法新增待辦任務" }, { status: 409 });
    }

    const newTask = await DataService.addTask({
      projectId,
      subject,
      taskType: taskType || "SITE_VISIT",
      dueDatetime,
      priority: priority || "MEDIUM",
      isCompleted: false,
      assignedToId: assignedToId || sessionUserId,
      assignedById: sessionUserId,
    });

    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    return handleApiError(error, "新增任務失敗");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      const hasCookie = Boolean(req.cookies.get("cab_sales_user_id")?.value);
      return NextResponse.json(
        { error: hasCookie ? "登入已失效，請重新登入" : "請先登入" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { taskId, isCompleted, resultNotes, completedAt } = body;

    if (!taskId || typeof isCompleted !== "boolean") {
      return NextResponse.json({ error: "缺少 taskId 或 isCompleted 狀態" }, { status: 400 });
    }
    if (completedAt !== undefined) {
      const parsedDate =
        typeof completedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(completedAt)
          ? new Date(`${completedAt}T00:00:00.000Z`)
          : null;
      if (
        !parsedDate ||
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== completedAt
      ) {
        return NextResponse.json({ error: "實際完成日格式無效" }, { status: 400 });
      }
    }

    const task = await DataService.getTaskById(taskId);
    if (!task) {
      return NextResponse.json({ error: "查無此任務" }, { status: 404 });
    }

    let combined: Awaited<ReturnType<typeof DataService.getProjectWithMilestones>>;
    if (isCompleted && task.milestoneId) {
      combined = await DataService.getProjectWithMilestones(task.projectId);
      const targetMs = combined?.milestones.find((m) => m.id === task.milestoneId);
      const stageCode = targetMs?.stageCode ?? null;
      if (stageCode && AUDIT_STAGE_CODES.has(stageCode)) {
        const isReviewer =
          ["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"].includes(user.role) ||
          user.id === combined?.project.salesRepId;
        if (!isReviewer) {
          return NextResponse.json({ error: "僅審核人員可完成此審核待辦" }, { status: 403 });
        }
        if (!task.subject.startsWith("【需審核】")) {
          return NextResponse.json({ error: "此進度尚未提交審核" }, { status: 409 });
        }
      }
    }

    const updatedTask = await DataService.toggleTaskComplete(
      taskId,
      isCompleted,
      resultNotes,
      completedAt,
      task,
      combined?.project,
      combined?.milestones
    );

    if (!updatedTask) {
      return NextResponse.json({ error: "查無此任務" }, { status: 404 });
    }

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    return handleApiError(error, "更新任務狀態失敗");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      const hasCookie = Boolean(req.cookies.get("cab_sales_user_id")?.value);
      return NextResponse.json(
        { error: hasCookie ? "登入已失效，請重新登入" : "請先登入" },
        { status: 401 }
      );
    }

    const body = await req.json();
    if (typeof body.taskId !== "string" || !body.taskId) {
      return NextResponse.json({ error: "缺少待辦識別碼" }, { status: 400 });
    }

    const task = await DataService.getTaskById(body.taskId);
    if (!task) return NextResponse.json({ error: "找不到此待辦" }, { status: 404 });

    const canDeleteTask = user.role === "ADMIN" || task.assignedById === user.id || task.assignedToId === user.id;
    if (!canDeleteTask) {
      return NextResponse.json({ error: "僅可刪除自己建立或被指派的待辦" }, { status: 403 });
    }

    const deleted = await DataService.deleteTask(body.taskId);
    if (!deleted) return NextResponse.json({ error: "找不到此待辦" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "刪除待辦失敗");
  }
}
