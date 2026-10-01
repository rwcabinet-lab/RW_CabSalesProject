import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";
import { DEFAULT_PREVIEW_USER_ID } from "@/lib/current-user";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;
    const assignedToId = searchParams.get("assignedToId") || undefined;
    const isCompletedParam = searchParams.get("isCompleted");

    let isCompleted: boolean | undefined = undefined;
    if (isCompletedParam === "true") isCompleted = true;
    if (isCompletedParam === "false") isCompleted = false;

    const tasks = await DataService.getTasks({
      projectId,
      assignedToId,
      isCompleted,
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Failed to get tasks:", error);
    return NextResponse.json({ error: "無法取得待辦任務" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, subject, taskType, dueDatetime, priority, assignedToId, assignedToName } = body;

    if (!projectId || !subject || !dueDatetime) {
      return NextResponse.json({ error: "請填寫必要欄位 (案場、主題、到期時間)" }, { status: 400 });
    }

    const sessionUserId = req.cookies.get("cab_sales_user_id")?.value;
    const newTask = await DataService.addTask({
      projectId,
      subject,
      taskType: taskType || "SITE_VISIT",
      dueDatetime,
      priority: priority || "MEDIUM",
      isCompleted: false,
      assignedToId: sessionUserId || assignedToId || DEFAULT_PREVIEW_USER_ID,
    });

    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "新增任務失敗" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, isCompleted, resultNotes } = body;

    if (!taskId || typeof isCompleted !== "boolean") {
      return NextResponse.json({ error: "缺少 taskId 或 isCompleted 狀態" }, { status: 400 });
    }

    const updatedTask = await DataService.toggleTaskComplete(taskId, isCompleted, resultNotes);

    if (!updatedTask) {
      return NextResponse.json({ error: "查無此任務" }, { status: 404 });
    }

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: "更新任務狀態失敗" }, { status: 500 });
  }
}
