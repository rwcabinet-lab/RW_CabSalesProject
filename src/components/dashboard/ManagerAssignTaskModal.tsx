"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import type { ApiResponse, AssignableUserDTO, TaskDTO } from "@/types/dto";

interface ManagerAssignTaskModalProps {
  modalData: {
    open: boolean;
    projectId: string;
    projectName: string;
    taskId: string;
    userId: string;
    subject: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
    dueDate: string;
  };
  assignableUsers: AssignableUserDTO[];
  onClose: () => void;
  onSuccess: (task: TaskDTO, isEditing: boolean) => void;
}

/**
 * 主管指派任務 Modal（獨立狀態封裝，打字時不觸發營運儀表板與圖表重新渲染）
 */
export function ManagerAssignTaskModal({
  modalData,
  assignableUsers,
  onClose,
  onSuccess,
}: ManagerAssignTaskModalProps) {
  const [userId, setUserId] = useState(modalData.userId);
  const [subject, setSubject] = useState(modalData.subject);
  const [priority, setPriority] = useState<"HIGH" | "MEDIUM" | "LOW">(modalData.priority);
  const [dueDate, setDueDate] = useState(modalData.dueDate);
  const [assigning, setAssigning] = useState(false);

  if (!modalData.open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true);
    try {
      const isEditingTask = Boolean(modalData.taskId);
      const res = await fetch("/api/dashboard/manager", {
        method: isEditingTask ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEditingTask ? { taskId: modalData.taskId } : { projectId: modalData.projectId }),
          assignedToId: userId,
          subject,
          priority,
          dueDatetime: `${dueDate}T00:00:00.000Z`,
        }),
      });
      const result = (await res.json()) as ApiResponse<{ task: TaskDTO }>;
      if (!res.ok || !result.task) {
        throw new Error(result.error || "指派任務失敗");
      }
      onClose();
      onSuccess(result.task, isEditingTask);
      toast.success(isEditingTask ? "任務已成功更新！" : "任務已成功指派！");
    } catch (err) {
      console.error("Failed to assign/update task:", err);
      toast.error(err instanceof Error ? err.message : "指派任務失敗");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white p-6 rounded-xl w-96 shadow-2xl">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <Sparkles className="text-blue-600 w-5 h-5" />{" "}
          {modalData.taskId ? "變更指派任務" : "指派任務"} - {modalData.projectName}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <label className="block font-semibold">
            指派對象
            <select
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full border p-2 mt-1 rounded bg-white"
            >
              <option value="">未指定</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} (
                  {user.role === "SALES_MANAGER"
                    ? "業務主管"
                    : user.role === "SALES"
                    ? "業務"
                    : user.role === "SITE_ENGINEER"
                    ? "工務"
                    : "業助"}
                  )
                </option>
              ))}
            </select>
          </label>
          <label className="block font-semibold">
            任務要求/主題
            <textarea
              required
              rows={3}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border p-2 mt-1 rounded"
              placeholder="例如：請盡速確認客戶廚具圖面"
            />
          </label>
          <label className="block font-semibold">
            預定完成日
            <input
              required
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border p-2 mt-1 rounded"
            />
          </label>
          <label className="block font-semibold">
            優先度
            <select
              required
              value={priority}
              onChange={(e) => setPriority(e.target.value as "HIGH" | "MEDIUM" | "LOW")}
              className="w-full border p-2 mt-1 rounded bg-white"
            >
              <option value="HIGH">高</option>
              <option value="MEDIUM">中</option>
              <option value="LOW">低</option>
            </select>
          </label>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 rounded font-bold hover:bg-slate-300 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={assigning}
              className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {assigning ? "儲存中..." : modalData.taskId ? "儲存變更" : "確認指派"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
