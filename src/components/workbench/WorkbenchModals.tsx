"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { useShallow } from "zustand/react/shallow";
import { QUERY_KEYS } from "@/hooks/useQueries";
import type { ApiResponse, TaskDTO, WorkbenchDashboardDTO, WorkbenchProjectDTO } from "@/types/dto";

interface WorkbenchModalsProps {
  currentUserId: string;
  projects: WorkbenchProjectDTO[];
  onInvalidate: (options?: { includeViews?: boolean }) => Promise<void>;
}

export function WorkbenchCreateTaskModal({ currentUserId, projects, onInvalidate }: WorkbenchModalsProps) {
  const queryClient = useQueryClient();
  const showTaskModal = useWorkbenchStore((s) => s.showTaskModal);
  const newTaskData = useWorkbenchStore((s) => s.newTaskData);
  const setNewTaskData = useWorkbenchStore((s) => s.setNewTaskData);
  const resetTaskModal = useWorkbenchStore((s) => s.resetTaskModal);

  const [creatingTask, setCreatingTask] = useState(false);

  if (!showTaskModal) return null;

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskData.subject || !newTaskData.projectId) return;
    setCreatingTask(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newTaskData,
          dueDatetime: new Date(newTaskData.dueDatetime).toISOString(),
          assignedToId: currentUserId,
        }),
      });
      if (res.ok) {
        const createdTask = (await res.json()) as TaskDTO;
        if (createdTask && createdTask.id) {
          queryClient.setQueryData<WorkbenchDashboardDTO>(QUERY_KEYS.workbench, (old) => {
            if (!old) return old;
            return {
              ...old,
              tasks: [createdTask, ...old.tasks],
            };
          });
        }
        resetTaskModal();
        void onInvalidate({ includeViews: true });
      }
    } finally {
      setCreatingTask(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white p-6 rounded-xl w-96 shadow-2xl">
        <h3 className="font-bold mb-4">新增待辦</h3>
        <form onSubmit={handleCreateTask} className="space-y-3 text-sm">
          <label className="block font-semibold">
            關聯案場
            <select
              required
              value={newTaskData.projectId}
              onChange={(e) => setNewTaskData({ projectId: e.target.value })}
              className="w-full border p-1.5 mt-1 rounded"
            >
              <option value="">選擇</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectName}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-semibold">
            主題
            <input
              required
              value={newTaskData.subject}
              onChange={(e) => setNewTaskData({ subject: e.target.value })}
              className="w-full border p-1.5 mt-1 rounded"
            />
          </label>
          <label className="block font-semibold">
            預計完成時間
            <input
              required
              type="datetime-local"
              value={newTaskData.dueDatetime}
              onChange={(e) => setNewTaskData({ dueDatetime: e.target.value })}
              className="w-full border p-1.5 mt-1 rounded"
            />
          </label>
          <label className="block font-semibold">
            優先度
            <select
              value={newTaskData.priority}
              onChange={(e) => setNewTaskData({ priority: e.target.value })}
              className="w-full border p-1.5 mt-1 rounded"
            >
              <option value="HIGH">高</option>
              <option value="MEDIUM">中</option>
              <option value="LOW">低</option>
            </select>
          </label>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={resetTaskModal}
              className="px-3 py-1 bg-slate-200 rounded font-bold"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={creatingTask}
              className="px-3 py-1 bg-blue-600 text-white rounded font-bold disabled:opacity-50"
            >
              {creatingTask ? "建立中..." : "建立"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CompleteTaskModalProps {
  onInvalidate: (options?: { includeViews?: boolean }) => Promise<void>;
}

export function WorkbenchCompleteTaskModal({ onInvalidate }: CompleteTaskModalProps) {
  const queryClient = useQueryClient();
  const taskToComplete = useWorkbenchStore((s) => s.taskToComplete);
  const setTaskToComplete = useWorkbenchStore((s) => s.setTaskToComplete);
  const completionNotes = useWorkbenchStore((s) => s.completionNotes);
  const setCompletionNotes = useWorkbenchStore((s) => s.setCompletionNotes);
  const completionDate = useWorkbenchStore((s) => s.completionDate);
  const setCompletionDate = useWorkbenchStore((s) => s.setCompletionDate);

  const [completingTask, setCompletingTask] = useState(false);
  const [completionError, setCompletionError] = useState("");

  if (!taskToComplete) return null;

  const handleCompleteTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToComplete) return;

    const completedAt =
      completionDate ||
      new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    setCompletingTask(true);
    setCompletionError("");

    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: taskToComplete.id,
          isCompleted: true,
          resultNotes: completionNotes.trim(),
          completedAt,
        }),
      });
      const result = (await res.json()) as ApiResponse<{ success: boolean; task: TaskDTO }>;
      if (!res.ok) {
        setCompletionError(result.error || "完成待辦失敗，請稍後再試");
        return;
      }

      queryClient.setQueryData<WorkbenchDashboardDTO>(QUERY_KEYS.workbench, (old) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.filter((task) => task.id !== taskToComplete.id),
        };
      });

      setTaskToComplete(null);
      void onInvalidate({ includeViews: true });
    } catch (err) {
      console.error("Failed to complete task:", err);
      setCompletionError("完成待辦時發生錯誤，請稍後再試");
    } finally {
      setCompletingTask(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={handleCompleteTask} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-1 text-lg font-bold">完成待辦</h3>
        <p className="mb-4 text-sm text-slate-600">
          [{taskToComplete.projectName}] {taskToComplete.subject}
        </p>
        <label className="mb-4 block text-sm font-semibold">
          實際完成日
          <input
            type="date"
            required
            value={completionDate}
            onChange={(e) => setCompletionDate(e.target.value)}
            className="mt-2 w-full rounded border p-2 font-normal"
          />
        </label>
        <label className="block text-sm font-semibold">
          完成備註
          <textarea
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            rows={5}
            placeholder="請填寫完成結果或處理備註"
            className="mt-2 w-full rounded border p-2 font-normal"
          />
        </label>
        {completionError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {completionError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setTaskToComplete(null);
              setCompletionError("");
            }}
            disabled={completingTask}
            className="rounded bg-slate-200 px-4 py-2 text-sm font-semibold"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={completingTask}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {completingTask ? "完成中..." : "確認完成"}
          </button>
        </div>
      </form>
    </div>
  );
}
