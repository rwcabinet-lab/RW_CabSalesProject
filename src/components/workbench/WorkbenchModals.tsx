"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { useShallow } from "zustand/react/shallow";
import { QUERY_KEYS } from "@/hooks/useQueries";
import { getTaiwanDateString } from "@/lib/schedule-engine";
import { toast } from "@/stores/useToastStore";
import { MILESTONE_STAGE_LABELS, STANDARD_MILESTONE_STAGE_CODES } from "@/lib/constants";
import type { ApiResponse, TaskDTO, UserDTO, WorkbenchDashboardDTO, WorkbenchProjectDTO } from "@/types/dto";

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

  const isDispatch =
    taskToComplete.subject === "派工" ||
    taskToComplete.subject?.includes("派工");

  const handleCompleteTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToComplete) return;

    if (isDispatch && !completionDate.trim()) {
      setCompletionError("請設定進場日期");
      return;
    }

    const completedAt = completionDate || getTaiwanDateString();
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
          {isDispatch ? "進場日期" : "實際完成日"}
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

interface AdvanceMilestoneModalProps {
  onInvalidate: (options?: { includeViews?: boolean }) => Promise<void>;
}

export function WorkbenchAdvanceMilestoneModal({ onInvalidate }: AdvanceMilestoneModalProps) {
  const queryClient = useQueryClient();
  const projectToAdvance = useWorkbenchStore((s) => s.projectToAdvance);
  const resetAdvanceModal = useWorkbenchStore((s) => s.resetAdvanceModal);
  const advanceNotes = useWorkbenchStore((s) => s.advanceNotes);
  const setAdvanceNotes = useWorkbenchStore((s) => s.setAdvanceNotes);
  const advanceDate = useWorkbenchStore((s) => s.advanceDate);
  const setAdvanceDate = useWorkbenchStore((s) => s.setAdvanceDate);

  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState("");
  const [canSubmitAudit, setCanSubmitAudit] = useState(false);
  const [submittingAudit, setSubmittingAudit] = useState(false);

  if (!projectToAdvance || !projectToAdvance.activeMilestone) return null;

  const currentStageCode = projectToAdvance.activeMilestone.stageCode;
  const currentStageName = projectToAdvance.activeMilestone.stageName;
  const isDispatch =
    currentStageCode === "4-3" ||
    currentStageCode === "5-3" ||
    currentStageName === "派工";
  const currentIndex = STANDARD_MILESTONE_STAGE_CODES.indexOf(currentStageCode);
  const nextStageCode =
    currentIndex !== -1 && currentIndex + 1 < STANDARD_MILESTONE_STAGE_CODES.length
      ? STANDARD_MILESTONE_STAGE_CODES[currentIndex + 1]
      : null;
  const nextStageName = nextStageCode ? MILESTONE_STAGE_LABELS[nextStageCode] : "全案完結";

  const handleAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToAdvance.activeMilestone) return;

    if (isDispatch && !advanceDate.trim()) {
      setAdvanceError("請設定進場日期");
      return;
    }

    setAdvancing(true);
    setAdvanceError("");
    setCanSubmitAudit(false);

    try {
      const res = await fetch(`/api/projects/${projectToAdvance.id}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance",
          milestoneId: projectToAdvance.activeMilestone.id,
          actualDueDate: isDispatch ? getTaiwanDateString() : (advanceDate || getTaiwanDateString()),
          installationDate: isDispatch ? advanceDate.trim() : undefined,
          notes: advanceNotes.trim() || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setAdvanceError(result.error || "項目推進失敗，請稍後重試");
        if (res.status === 409 && result.error?.includes("審核")) {
          setCanSubmitAudit(true);
        }
        return;
      }

      toast.success(`已成功推進「${projectToAdvance.projectName}」進度至 ${nextStageName}`);
      resetAdvanceModal();
      void onInvalidate({ includeViews: true });
    } catch (err) {
      console.error("Failed to advance milestone:", err);
      setAdvanceError("推進進度時發生錯誤，請稍後重試");
    } finally {
      setAdvancing(false);
    }
  };

  const handleSubmitAudit = async () => {
    if (!projectToAdvance.activeMilestone) return;
    setSubmittingAudit(true);
    try {
      const res = await fetch(`/api/projects/${projectToAdvance.id}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submitAudit",
          milestoneId: projectToAdvance.activeMilestone.id,
          notes: advanceNotes.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setAdvanceError(result.error || "送審失敗，請稍後重試");
        return;
      }
      toast.success(`已成功提交「${currentStageName}」審核`);
      resetAdvanceModal();
      void onInvalidate({ includeViews: true });
    } catch (err) {
      console.error("Failed to submit audit:", err);
      setAdvanceError("提交審核時發生錯誤，請稍後重試");
    } finally {
      setSubmittingAudit(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={handleAdvance} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
              項目推進
            </span>
            <h3 className="text-base font-bold text-slate-800">
              {projectToAdvance.projectName}
            </h3>
          </div>
          <button
            type="button"
            onClick={resetAdvanceModal}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {/* 進度推進資訊卡片 */}
        <div className="mb-4 rounded-xl bg-slate-50 p-4 border border-slate-200/80">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>客戶名稱：{projectToAdvance.customerName}</span>
            <span>負責業務：{projectToAdvance.salesRepName || "-"}</span>
          </div>
          <div className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg border border-slate-200">
            <div className="flex-1">
              <span className="text-[11px] font-semibold text-slate-400 block">當前完成進度</span>
              <span className="text-sm font-bold text-emerald-700">
                ● {currentStageName}
              </span>
            </div>
            <div className="text-slate-400 font-bold text-sm">➔</div>
            <div className="flex-1">
              <span className="text-[11px] font-semibold text-slate-400 block">即將啟動進度</span>
              <span className="text-sm font-bold text-blue-700">
                ▶ {nextStageName}
              </span>
            </div>
          </div>
        </div>

        <label className="mb-4 block text-xs font-bold text-slate-700">
          {isDispatch ? "進場日期" : "實際完成日"}
          <input
            type="date"
            required
            value={advanceDate}
            onChange={(e) => setAdvanceDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 p-2 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </label>

        <label className="block text-xs font-bold text-slate-700">
          推進備註 (選填)
          <textarea
            value={advanceNotes}
            onChange={(e) => setAdvanceNotes(e.target.value)}
            rows={3}
            placeholder="請填寫此階段推進結果、業主確認事項或備註說明..."
            className="mt-1.5 w-full rounded-lg border border-slate-300 p-2 text-xs font-normal focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </label>

        {advanceError && (
          <div role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            <p className="font-semibold">{advanceError}</p>
            {canSubmitAudit && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-red-600">此節點需經審核，是否直接提交審核？</span>
                <button
                  type="button"
                  disabled={submittingAudit}
                  onClick={handleSubmitAudit}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
                >
                  {submittingAudit ? "送審中..." : "立即提交審核"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t pt-3">
          <button
            type="button"
            onClick={resetAdvanceModal}
            disabled={advancing || submittingAudit}
            className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={advancing || submittingAudit}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
          >
            {advancing ? "推進中..." : "確認推進 ➔"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function WorkbenchAddPhaseModal({
  selectableUsers,
  onInvalidate,
}: {
  selectableUsers: UserDTO[];
  onInvalidate: (options?: { includeViews?: boolean }) => Promise<void>;
}) {
  const projectToAddPhase = useWorkbenchStore((s) => s.projectToAddPhase);
  const setProjectToAddPhase = useWorkbenchStore((s) => s.setProjectToAddPhase);

  const [saving, setSaving] = useState(false);
  const [phaseName, setPhaseName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [cost, setCost] = useState("");
  const [unitCount, setUnitCount] = useState("");
  const [salesRepId, setSalesRepId] = useState("");

  useEffect(() => {
    if (projectToAddPhase) {
      const hasExistingPhases = Boolean(projectToAddPhase.phases && projectToAddPhase.phases.length > 0);
      const nextNum = (projectToAddPhase.phases?.length || 0) + 1;
      setPhaseName(`第 ${nextNum} 期`);
      if (!hasExistingPhases) {
        setExpectedDate(projectToAddPhase.expectedDate ? projectToAddPhase.expectedDate.slice(0, 10) : "");
        setQuoteAmount(projectToAddPhase.quoteAmount != null ? String(projectToAddPhase.quoteAmount) : "");
        setCost(projectToAddPhase.cost != null ? String(projectToAddPhase.cost) : "");
        setUnitCount(projectToAddPhase.unitCount != null ? String(projectToAddPhase.unitCount) : "");
      } else {
        setExpectedDate("");
        setQuoteAmount("");
        setCost("");
        setUnitCount("");
      }
      setSalesRepId(projectToAddPhase.salesRepId || selectableUsers[0]?.id || "");
    }
  }, [projectToAddPhase, selectableUsers]);

  if (!projectToAddPhase) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phaseName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectToAddPhase.id}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phaseName: phaseName.trim(),
          expectedDate: expectedDate || undefined,
          quoteAmount: quoteAmount ? Math.round(Number(quoteAmount)) : undefined,
          cost: cost ? Math.round(Number(cost)) : undefined,
          unitCount: unitCount ? Number(unitCount) : undefined,
          salesRepId: salesRepId || undefined,
        }),
      });

      if (res.ok) {
        toast.success(`已成功為案場「${projectToAddPhase.projectName}」新增期數！`);
        setProjectToAddPhase(null);
        void onInvalidate({ includeViews: true });
      } else {
        const err = await res.json();
        toast.error(err.error || "新增期數失敗");
      }
    } catch {
      toast.error("新增期數失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !saving && setProjectToAddPhase(null)}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">
              為【{projectToAddPhase.projectName}】新增期數
            </span>
            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[11px] font-bold">
              獨立 28 里程碑
            </span>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => setProjectToAddPhase(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label className="sm:col-span-2 font-semibold text-slate-700">
            期數名稱 *
            <input
              type="text"
              required
              value={phaseName}
              onChange={(e) => setPhaseName(e.target.value)}
              placeholder="例如：第 2 期：標準層 A 棟"
              className="mt-1 w-full rounded border border-slate-300 p-2 text-xs font-normal focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </label>

          <label className="font-semibold text-slate-700">
            預定進場（同步 6-1）
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 p-2 text-xs font-normal focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </label>

          <label className="font-semibold text-slate-700">
            主責業務
            <select
              value={salesRepId}
              onChange={(e) => setSalesRepId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 p-2 text-xs font-normal bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {selectableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>

          <label className="font-semibold text-slate-700">
            成本金額（元）
            <input
              type="number"
              step="1"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="例如：250000"
              className="mt-1 w-full rounded border border-slate-300 p-2 text-xs font-normal text-right tabular-nums focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </label>

          <label className="font-semibold text-slate-700">
            報價金額（元）
            <input
              type="number"
              step="1"
              value={quoteAmount}
              onChange={(e) => setQuoteAmount(e.target.value)}
              placeholder="例如：350000"
              className="mt-1 w-full rounded border border-slate-300 p-2 text-xs font-normal text-right tabular-nums focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </label>

          <label className="font-semibold text-slate-700 sm:col-span-2">
            戶數
            <input
              type="number"
              value={unitCount}
              onChange={(e) => setUnitCount(e.target.value)}
              placeholder="例如：12"
              className="mt-1 w-full rounded border border-slate-300 p-2 text-xs font-normal focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => setProjectToAddPhase(null)}
            className="rounded px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
          >
            {saving ? "建立中..." : "確認建立期數"}
          </button>
        </div>
      </form>
    </div>
  );
}
