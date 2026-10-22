import { prisma } from "@/lib/prisma";
import { TaskPriority, TaskType } from "@prisma/client";
import { BadRequestError, ConflictError } from "../errors";
import type {
  ProjectDetail,
  ProjectMilestoneItem,
  SalesTaskItem,
} from "@/types/dto";
import { dateValue } from "./shared";
import { ProjectService } from "./project-service";
import { MilestoneService } from "./milestone-service";

export const TaskService = {
  async getTaskById(id: string): Promise<SalesTaskItem | null> {
    const task = await prisma.salesTask.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      include: {
        project: { select: { projectName: true } },
        assignedTo: { select: { name: true } },
        assignedBy: { select: { name: true } },
      },
    });
    if (!task) return null;
    return {
      id: task.id,
      projectId: task.projectId,
      projectName: task.project.projectName,
      assignedToId: task.assignedToId,
      assignedToName: task.assignedTo.name,
      assignedById: task.assignedById,
      assignedByName: task.assignedBy?.name || null,
      milestoneId: task.milestoneId,
      taskType: task.taskType,
      subject: task.subject,
      dueDatetime: task.dueDatetime.toISOString(),
      priority: task.priority,
      isCompleted: task.isCompleted,
      resultNotes: task.resultNotes,
      completedAt: dateValue(task.completedAt) || null,
    };
  },

  async getTasks(filter?: {
    projectId?: string;
    projectIds?: string[];
    assignedToId?: string;
    assignedById?: string;
    isCompleted?: boolean;
  }): Promise<SalesTaskItem[]> {
    if (filter?.projectIds && filter.projectIds.length === 0) return [];
    const whereClause = {
      ...(filter?.projectId ? { projectId: filter.projectId } : {}),
      ...(filter?.projectIds ? { projectId: { in: filter.projectIds } } : {}),
      ...(filter?.assignedToId ? { assignedToId: filter.assignedToId } : {}),
      ...(filter?.assignedById ? { assignedById: filter.assignedById } : {}),
      ...(filter?.isCompleted !== undefined ? { isCompleted: filter.isCompleted } : {}),
    };

    const tasks = await prisma.salesTask.findMany({
      where: whereClause,
      relationLoadStrategy: "join",
      include: {
        project: { select: { projectName: true } },
        assignedTo: { select: { name: true } },
        assignedBy: { select: { name: true } },
      },
      orderBy: { dueDatetime: "asc" },
    });

    return tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.projectName,
      assignedToId: t.assignedToId,
      assignedToName: t.assignedTo.name,
      assignedById: t.assignedById,
      assignedByName: t.assignedBy?.name || null,
      milestoneId: t.milestoneId,
      taskType: t.taskType,
      subject: t.subject,
      dueDatetime: t.dueDatetime.toISOString(),
      priority: t.priority,
      isCompleted: t.isCompleted,
      resultNotes: t.resultNotes,
      completedAt: dateValue(t.completedAt) || null,
    }));
  },

  async updateTask(
    id: string,
    data: { assignedToId: string; subject: string; priority: TaskPriority; dueDatetime: string }
  ): Promise<SalesTaskItem | null> {
    const existing = await prisma.salesTask.findUnique({
      where: { id },
      select: { id: true, milestoneId: true },
    });
    if (!existing || existing.milestoneId) return null;
    const task = await prisma.salesTask.update({
      where: { id },
      data: {
        assignedToId: data.assignedToId,
        subject: data.subject,
        priority: data.priority,
        dueDatetime: new Date(data.dueDatetime),
      },
      relationLoadStrategy: "join",
      include: {
        project: { select: { projectName: true } },
        assignedTo: { select: { name: true } },
        assignedBy: { select: { name: true } },
      },
    });
    return {
      id: task.id,
      projectId: task.projectId,
      projectName: task.project.projectName,
      assignedToId: task.assignedToId,
      assignedToName: task.assignedTo.name,
      assignedByName: task.assignedBy?.name || null,
      milestoneId: task.milestoneId,
      taskType: task.taskType,
      subject: task.subject,
      dueDatetime: task.dueDatetime.toISOString(),
      priority: task.priority,
      isCompleted: task.isCompleted,
      resultNotes: task.resultNotes,
      completedAt: dateValue(task.completedAt) || null,
    };
  },

  async addTask(
    data: Omit<SalesTaskItem, "id" | "projectName" | "assignedToName" | "assignedByName" | "milestoneId"> & {
      assignedToName?: string;
      assignedById?: string;
    }
  ): Promise<SalesTaskItem> {
    const task = await prisma.salesTask.create({
      data: {
        projectId: data.projectId,
        assignedToId: data.assignedToId,
        assignedById: data.assignedById,
        taskType: data.taskType as TaskType,
        subject: data.subject,
        dueDatetime: new Date(data.dueDatetime),
        priority: data.priority as TaskPriority,
        isCompleted: data.isCompleted,
        resultNotes: data.resultNotes,
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      },
      relationLoadStrategy: "join",
      include: {
        project: { select: { projectName: true } },
        assignedTo: { select: { name: true } },
        assignedBy: { select: { name: true } },
      },
    });
    return {
      id: task.id,
      projectId: task.projectId,
      projectName: task.project.projectName,
      assignedToId: task.assignedToId,
      assignedToName: task.assignedTo.name,
      assignedByName: task.assignedBy?.name || null,
      milestoneId: task.milestoneId,
      taskType: task.taskType,
      subject: task.subject,
      dueDatetime: task.dueDatetime.toISOString(),
      priority: task.priority,
      isCompleted: task.isCompleted,
      resultNotes: task.resultNotes,
      completedAt: dateValue(task.completedAt) || null,
    };
  },

  async deleteTask(id: string): Promise<boolean> {
    const result = await prisma.salesTask.deleteMany({ where: { id } });
    return result.count > 0;
  },

  async toggleTaskComplete(
    taskId: string,
    isCompleted: boolean,
    resultNotes?: string,
    completedAt?: string,
    existingTask?: { id: string; projectId: string; milestoneId?: string | null; isCompleted: boolean },
    existingProject?: ProjectDetail,
    existingMilestones?: ProjectMilestoneItem[],
  ) {
    const taskBeforeUpdate = existingTask ?? await prisma.salesTask.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, milestoneId: true, isCompleted: true },
    });
    if (!taskBeforeUpdate) return null;

    if (taskBeforeUpdate.milestoneId) {
      if (!isCompleted) {
        throw new BadRequestError("里程碑待辦請由案件細節執行回退");
      }
      if (!taskBeforeUpdate.isCompleted) {
        const combined = (existingProject && existingMilestones)
          ? { project: existingProject, milestones: existingMilestones }
          : await ProjectService.getProjectWithMilestones(taskBeforeUpdate.projectId);
        if (combined?.project.currentStage === "WRAP_UP" || combined?.project.currentStage === "LOST") {
          throw new ConflictError("案件已進入額外階段，無法完成一般里程碑");
        }
        await MilestoneService.advanceMilestone(
          taskBeforeUpdate.projectId,
          taskBeforeUpdate.milestoneId,
          {
            notes: resultNotes,
            completedDate: completedAt,
          },
          combined?.milestones,
        );
      }
      return {
        ...taskBeforeUpdate,
        isCompleted: true,
        completedAt: completedAt ? new Date(`${completedAt}T00:00:00.000Z`) : new Date(),
        resultNotes: resultNotes || null,
      };
    }

    return prisma.salesTask.update({
      where: { id: taskId },
      data: {
        isCompleted,
        completedAt: isCompleted
          ? completedAt ? new Date(`${completedAt}T00:00:00.000Z`) : new Date()
          : null,
        resultNotes: resultNotes || undefined,
      },
    });
  },
};
