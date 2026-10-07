"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  Edit3,
  MapPin,
  X,
} from "lucide-react";
import {
  MILESTONE_STAGE_LABELS,
  PHASE_LABELS,
  PROJECT_STAGE_LABELS,
  STAGE_CODE_TO_PHASE,
} from "@/lib/mock-data";
import type {
  ApiResponse,
  MilestoneDTO,
  MilestoneDetailsDTO,
  MilestonePhaseDTO,
  ProjectDTO,
  TaskDTO,
  TrafficLightDTO,
  UserDTO,
} from "@/types/dto";
import { formatTenThousands } from "@/lib/currency";

interface MilestoneWithLight extends MilestoneDTO {
  trafficLight: TrafficLightDTO;
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  COMPLETED:   { label: "已完成",    bg: "bg-emerald-100", text: "text-emerald-800" },
  IN_PROGRESS: { label: "進行中",    bg: "bg-blue-100",    text: "text-blue-800" },
  OVERDUE:     { label: "已逾期",    bg: "bg-red-100",     text: "text-red-800" },
  PENDING:     { label: "待開始",    bg: "bg-slate-100",   text: "text-slate-600" },
};
const PRIORITY_LABELS: Record<NonNullable<MilestoneDTO["priority"]>, string> = {
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低",
};

const PHASE_ORDER: MilestonePhaseDTO[] = ["CONTACT", "DESIGN", "PRODUCTION", "EXTRA"];
const todayDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export default function MilestonesPage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const router = useRouter();
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [assignees, setAssignees] = useState<UserDTO[]>([]);
  const [canManageMilestones, setCanManageMilestones] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<TaskDTO[]>([]);
  const [pendingTasksError, setPendingTasksError] = useState("");
  const [completedTasks, setCompletedTasks] = useState<TaskDTO[]>([]);
  const [milestones, setMilestones] = useState<MilestoneWithLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [completedTasksError, setCompletedTasksError] = useState("");
  const [activePhase, setActivePhase] = useState<MilestonePhaseDTO>("CONTACT");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    plannedDueDate: "", assignedToId: "", priority: "MEDIUM" as "HIGH" | "MEDIUM" | "LOW", notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [advanceModal, setAdvanceModal] = useState({ open: false, milestoneId: "", milestoneName: "", actualDueDate: todayDate(), notes: "" });
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [specialAdvanceModal, setSpecialAdvanceModal] = useState<{
    stageCode: "X-1" | "X-2";
    stageName: string;
    reason: string;
  } | null>(null);
  const [specialAdvanceError, setSpecialAdvanceError] = useState("");

  useEffect(() => {
    fetchData();
  }, [projectId]);

  useEffect(() => {
    fetchProjects();
    fetchAssignees();
    fetch("/api/auth/session")
      .then((response) => response.json() as Promise<ApiResponse<{ user: { role?: string } | null }>>)
      .then((data) => {
        const role = data.user?.role;
        setCanManageMilestones(role === "ADMIN" || role === "LEVEL_MANAGER" || role === "SALES_MANAGER");
      })
      .catch((error) => console.error("Failed to load current user:", error));
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json() as ApiResponse<ProjectDTO[]>;
      if (Array.isArray(data)) setProjects(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAssignees = async () => {
    try {
      const res = await fetch("/api/auth/users");
      const data = await res.json() as ApiResponse<UserDTO[]>;
      if (Array.isArray(data)) {
        setAssignees(data.filter((user) => user.role === "SALES" || user.role === "ASSISTANT"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadError("");
      setPendingTasksError("");
      setCompletedTasksError("");
      const [milestonesResult, pendingTasksResult, tasksResult] = await Promise.allSettled([
        fetch(`/api/projects/${projectId}/milestones`),
        fetch(`/api/tasks?projectId=${projectId}&isCompleted=false`),
        fetch(`/api/tasks?projectId=${projectId}&isCompleted=true`),
      ]);
      if (milestonesResult.status === "rejected") throw milestonesResult.reason;

      const milestonesResponse = milestonesResult.value;
      const data = await milestonesResponse.json() as ApiResponse<MilestoneDetailsDTO>;
      if (!milestonesResponse.ok) {
        throw new Error(data.error || "無法載入案件里程碑");
      }
      if (!Array.isArray(data.milestones)) {
        throw new Error("案件里程碑資料格式無效");
      }
      if (data.project) {
        setProject(data.project);
        if (data.project.currentStage === "WRAP_UP" || data.project.currentStage === "LOST") {
          setActivePhase("EXTRA");
        }
      }
      setMilestones(data.milestones);

      if (pendingTasksResult.status === "rejected") {
        console.error("Failed to load pending project tasks:", pendingTasksResult.reason);
        setPendingTasks([]);
        setPendingTasksError(
          pendingTasksResult.reason instanceof Error ? pendingTasksResult.reason.message : "無法載入待辦事項",
        );
      } else {
        try {
          const tasksResponse = pendingTasksResult.value;
          const tasksData = await tasksResponse.json() as ApiResponse<TaskDTO[]>;
          if (!tasksResponse.ok) {
            throw new Error(tasksData.error || "無法載入待辦事項");
          }
          if (!Array.isArray(tasksData)) {
            throw new Error("待辦事項資料格式無效");
          }
          setPendingTasks(tasksData.filter((task) => !task.isCompleted && !task.milestoneId));
        } catch (error) {
          console.error("Failed to load pending project tasks:", error);
          setPendingTasks([]);
          setPendingTasksError(error instanceof Error ? error.message : "無法載入待辦事項");
        }
      }

      if (tasksResult.status === "rejected") {
        console.error("Failed to load completed tasks:", tasksResult.reason);
        setCompletedTasks([]);
        setCompletedTasksError(
          tasksResult.reason instanceof Error ? tasksResult.reason.message : "無法載入已完成待辦",
        );
      } else {
        try {
          const tasksResponse = tasksResult.value;
          const tasksData = await tasksResponse.json() as ApiResponse<TaskDTO[]>;
          if (!tasksResponse.ok) {
            throw new Error(tasksData.error || "無法載入已完成待辦");
          }
          if (!Array.isArray(tasksData)) {
            throw new Error("已完成待辦資料格式無效");
          }
          setCompletedTasks(tasksData.filter((task) => !task.milestoneId));
        } catch (error) {
          console.error("Failed to load completed tasks:", error);
          setCompletedTasks([]);
          setCompletedTasksError(error instanceof Error ? error.message : "無法載入已完成待辦");
        }
      }
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "無法載入案件里程碑");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (m: MilestoneWithLight) => {
    setEditingId(m.id);
    setEditError("");
    setEditForm({
      plannedDueDate: m.plannedDueDate || "",
      assignedToId: m.assignedToId || "",
      priority: m.priority || "MEDIUM",
      notes: m.notes || "",
    });
  };

  const handleSaveEdit = async (milestoneId: string) => {
    setSaving(true);
    setEditError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneId,
          updates: {
            ...editForm,
            plannedDueDate: editForm.plannedDueDate || null,
            assignedToId: editForm.assignedToId || null,
          },
        }),
      });
      const result = await response.json() as ApiResponse<{ success?: boolean }>;
      if (!response.ok) throw new Error(result.error || "儲存里程碑失敗");
      setEditingId(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to save milestone:", error);
      setEditError(error instanceof Error ? error.message : "儲存里程碑失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdvancing(true);
    setAdvanceError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance",
          milestoneId: advanceModal.milestoneId,
          notes: advanceModal.notes,
          actualDueDate: advanceModal.actualDueDate,
        }),
      });
      const result = await response.json() as ApiResponse<{ success?: boolean }>;
      if (!response.ok) throw new Error(result.error || "完成里程碑失敗");
      setAdvanceModal({ open: false, milestoneId: "", milestoneName: "", actualDueDate: todayDate(), notes: "" });
      await fetchData();
    } catch (error) {
      console.error("Failed to complete milestone:", error);
      setAdvanceError(error instanceof Error ? error.message : "完成里程碑失敗");
    } finally { setAdvancing(false); }
  };

  const handleRollback = async (milestoneId: string) => {
    setAdvancing(true);
    setWorkflowError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", milestoneId }),
      });
      const result = await response.json() as ApiResponse<{ success?: boolean }>;
      if (!response.ok) throw new Error(result.error || "回退里程碑失敗");
      await fetchData();
    } catch (error) {
      console.error("Failed to roll back milestone:", error);
      setWorkflowError(error instanceof Error ? error.message : "回退里程碑失敗");
    } finally {
      setAdvancing(false);
    }
  };

  const handleSpecialAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specialAdvanceModal) return;

    setAdvancing(true);
    setSpecialAdvanceError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "specialAdvance",
          stageCode: specialAdvanceModal.stageCode,
          reason: specialAdvanceModal.reason.trim(),
        }),
      });
      const data = await res.json() as ApiResponse<{ success?: boolean }>;
      if (!res.ok) {
        setSpecialAdvanceError(data.error || "推進失敗，請稍後再試");
        return;
      }

      setSpecialAdvanceModal(null);
      await fetchData();
    } catch (error) {
      console.error("Failed to advance project to special stage:", error);
      setSpecialAdvanceError("推進時發生錯誤，請稍後再試");
    } finally {
      setAdvancing(false);
    }
  };

  const handleReturnToProduction = async () => {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "returnToProduction" }),
      });
      const data = await res.json() as ApiResponse<{ success?: boolean; project?: ProjectDTO; milestones?: MilestoneDTO[] }>;
      if (!res.ok) {
        setSpecialAdvanceError(data.error || "返回第三階段失敗，請稍後再試");
        return;
      }

      setActivePhase("PRODUCTION");
      await fetchData();
    } catch (error) {
      console.error("Failed to return project to production:", error);
      setSpecialAdvanceError("返回第三階段時發生錯誤，請稍後再試");
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) return <div className="p-16 text-center">載入詳細資料中...</div>;

  const phaseGroups: Record<MilestonePhaseDTO, MilestoneWithLight[]> = { CONTACT: [], DESIGN: [], PRODUCTION: [], EXTRA: [] };
  milestones.forEach((milestone) => {
    const phase = STAGE_CODE_TO_PHASE[milestone.stageCode];
    if (phase && milestone.stageCode !== "X-2") phaseGroups[phase].push(milestone);
  });

  const phaseProgress = (phase: MilestonePhaseDTO) => {
    const ms = phaseGroups[phase];
    if (!ms.length) return 0;
    return Math.round((ms.filter((m) => m.status === "COMPLETED").length / ms.length) * 100);
  };
  const lastCompletedMilestone = [...milestones].reverse().find((item) => item.status === "COMPLETED");
  const isProjectLost = project?.currentStage === "LOST";

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/workbench" className="inline-flex items-center gap-1.5 text-sm font-medium">
          <ArrowLeft className="w-4 h-4" /> 返回工作台
        </Link>
        <label className="text-sm font-semibold">
          切換案件
          <select
            value={projectId}
            onChange={(event) => router.push(`/projects/${event.target.value}/milestones`)}
            className="ml-2 max-w-xs border rounded px-2 py-1.5"
          >
            {projects.map((item) => <option key={item.id} value={item.id}>{item.projectName}</option>)}
          </select>
        </label>
      </div>

      {project && (
        <section className="bg-white border rounded-xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
            <div>
              <h1 className="text-xl font-black">{project.projectName}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><MapPin className="h-4 w-4" />{project.siteAddress}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(project.currentStage === "WRAP_UP" || project.currentStage === "LOST") && (
                <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-800">
                  目前階段：{project.currentStage === "WRAP_UP" ? "收尾" : "流標"}
                </span>
              )}
              {project.currentStage !== "WRAP_UP" && project.currentStage !== "LOST" && (
                <span className="rounded bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">
                  目前階段：{PROJECT_STAGE_LABELS[project.currentStage] || project.currentStage}
                </span>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3 text-sm md:grid-cols-4">
            <div><dt className="text-xs text-slate-500">客戶</dt><dd className="font-semibold">{project.customerName}（{project.customerType}）</dd></div>
            <div><dt className="text-xs text-slate-500">負責業務</dt><dd className="font-semibold">{project.customerSalesRepName || project.salesRepName}</dd></div>
            <div><dt className="text-xs text-slate-500">案件業助</dt><dd className="font-semibold">{project.salesAssistantName || "未指定"}</dd></div>
            <div><dt className="text-xs text-slate-500">預計完工日</dt><dd className="font-semibold">{project.expectedDate?.slice(0, 10) || "未設定"}</dd></div>
            <div><dt className="text-xs text-slate-500">戶數</dt><dd className="font-semibold">{project.unitCount ?? "未設定"}</dd></div>
            <div><dt className="text-xs text-slate-500">預算 / 報價</dt><dd className="text-right font-semibold tabular-nums">{(project.quoteAmount ?? project.estimatedBudget) != null ? formatTenThousands(project.quoteAmount ?? project.estimatedBudget ?? 0) : "未設定"}</dd></div>
            <div className="col-span-2 md:col-span-2"><dt className="text-xs text-slate-500">現場狀況</dt><dd className="font-semibold">{project.siteCondition || "未填寫"}</dd></div>
          </dl>
        </section>
      )}

      {loadError && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="flex border-b">
          {PHASE_ORDER.map((phase) => {
            const prog = phaseProgress(phase);
            const active = activePhase === phase;
            const showProgress = !(phase === "EXTRA" && project?.currentStage === "LOST");
            return (
              <button key={phase} onClick={() => setActivePhase(phase)} className={`flex-1 p-3 text-xs text-left border-b-2 ${active ? "border-blue-600 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}>
                <div className="font-bold">{PHASE_LABELS[phase].split("：")[0]}</div>
                {showProgress && <div className="w-full h-1 bg-slate-200 mt-1"><div style={{ width: `${prog}%` }} className="h-full bg-blue-500" /></div>}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-2">
          {workflowError && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{workflowError}</p>}
          {activePhase === "EXTRA" && (
            <div className="mb-3 space-y-2">
              {project?.currentStage !== "WRAP_UP" && project?.currentStage !== "LOST" && (
                <button
                  type="button"
                  onClick={() => {
                    setSpecialAdvanceError("");
                    setSpecialAdvanceModal({ stageCode: "X-1", stageName: "收尾", reason: "" });
                  }}
                  className="w-full rounded-xl border bg-amber-50 p-3 text-left text-sm font-bold text-amber-800 hover:bg-amber-100"
                >
                  收尾
                </button>
              )}
              {!isProjectLost && (
                <button
                  type="button"
                  onClick={() => {
                    setSpecialAdvanceError("");
                    setSpecialAdvanceModal({ stageCode: "X-2", stageName: "流標", reason: "" });
                  }}
                  className="w-full rounded-xl border bg-slate-50 p-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                >
                  流標
                </button>
              )}
              {project?.currentStage === "WRAP_UP" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleReturnToProduction}
                    disabled={advancing}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {advancing ? "處理中..." : "返回第三階段"}
                  </button>
                </div>
              )}
            </div>
          )}
          {phaseGroups[activePhase].map((m) => (
            <div key={m.id} className={`border p-3 rounded-xl ${isProjectLost ? "border-slate-300 bg-slate-100 opacity-60 grayscale" : m.status === "OVERDUE" ? "bg-red-50" : m.status === "IN_PROGRESS" ? "bg-blue-50" : "bg-white"}`}>
              {editingId === m.id && !isProjectLost ? (
                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-sm">編輯 {MILESTONE_STAGE_LABELS[m.stageCode]}<button onClick={() => setEditingId(null)}><X className="w-4 h-4" /></button></div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label>預定完成日 <input type="date" value={editForm.plannedDueDate} onChange={(e) => setEditForm({...editForm, plannedDueDate: e.target.value})} className="border w-full p-1"/></label>
                    <label>負責人
                      <select value={editForm.assignedToId} onChange={(e) => setEditForm({...editForm, assignedToId: e.target.value})} className="border w-full p-1">
                        <option value="">未指定</option>
                        {assignees.map((user) => <option key={user.id} value={user.id}>{user.role === "SALES" ? "業務" : "業助"}｜{user.name}</option>)}
                      </select>
                    </label>
                    <label>優先度
                      <select value={editForm.priority} onChange={(e) => setEditForm({...editForm, priority: e.target.value as "HIGH" | "MEDIUM" | "LOW"})} className="border w-full p-1">
                        <option value="HIGH">高</option>
                        <option value="MEDIUM">中</option>
                        <option value="LOW">低</option>
                      </select>
                    </label>
                    <label>{m.stageCode === "X-2" ? "推進原因 *" : m.stageCode === "X-1" ? "備註 *" : "備註"} <input type="text" value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} className="border w-full p-1"/></label>
                  </div>
                  {editError && <p role="alert" className="text-xs text-red-600">{editError}</p>}
                  <button onClick={() => handleSaveEdit(m.id)} disabled={saving || (m.stageCode.startsWith("X-") && !editForm.notes.trim())} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">儲存</button>
                </div>
              ) : (
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-sm">{MILESTONE_STAGE_LABELS[m.stageCode]} <span className={`text-[10px] px-1.5 rounded-full ${STATUS_MAP[m.status].bg} ${STATUS_MAP[m.status].text}`}>{STATUS_MAP[m.status].label}</span></div>
                    {canManageMilestones ? (
                      <div className="text-xs text-slate-500 mt-1">
                        預定完成日：{m.plannedDueDate || "未設定"} | 負責人：{m.assignedToName || "未指派"} | 優先度：{m.priority === "HIGH" ? "高" : m.priority === "LOW" ? "低" : "中"}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 mt-1">實際完成日：{m.actualDueDate || "尚未完成"}</div>
                    )}
                    {m.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">備註：{m.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    {(project?.currentStage === "WRAP_UP"
                      ? m.stageCode === "X-1"
                      : project?.currentStage !== "LOST") &&
                      (m.status === "IN_PROGRESS" || m.status === "OVERDUE") && (
                      <button onClick={() => {
                        setAdvanceError("");
                        setAdvanceModal({ open: true, milestoneId: m.id, milestoneName: MILESTONE_STAGE_LABELS[m.stageCode], actualDueDate: todayDate(), notes: "" });
                      }} className="bg-blue-600 text-white px-2 py-1 text-xs rounded">完成</button>
                    )}
                    {canManageMilestones && !isProjectLost && !m.stageCode.startsWith("X-") && m.status === "COMPLETED" && m.id === lastCompletedMilestone?.id && (
                      <button onClick={() => handleRollback(m.id)} disabled={advancing} className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800 disabled:opacity-50">回退</button>
                    )}
                    {canManageMilestones && !isProjectLost && <button onClick={() => startEdit(m)} className="text-slate-500"><Edit3 className="w-4 h-4"/></button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center gap-2 border-b px-4 py-3 font-bold">
          <CheckSquare className="h-5 w-5 text-blue-600" />待辦事項
        </div>
        {pendingTasksError ? (
          <p role="alert" className="px-4 py-6 text-center text-sm text-red-600">{pendingTasksError}</p>
        ) : pendingTasks.length ? (
          <div className="divide-y px-4">
            {pendingTasks.map((task) => (
              <article key={task.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{task.subject}</h3>
                  <span className="text-xs text-slate-500">
                    預計完成：{new Date(task.dueDatetime).toLocaleString("zh-TW")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  負責人：{task.assignedToName || "未指定"}｜優先度：{PRIORITY_LABELS[task.priority] || task.priority}
                  {task.assignedByName && `｜建立者/指派者：${task.assignedByName}`}
                </p>
                {task.resultNotes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{task.resultNotes}</p>}
              </article>
            ))}
          </div>
        ) : <p className="px-4 py-6 text-center text-sm text-slate-500">此案件目前沒有未完成待辦</p>}
      </section>

      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-3 font-bold"><CheckCircle2 className="h-5 w-5 text-emerald-600" />已完成待辦備查</div>
        {completedTasksError ? (
          <p role="alert" className="px-4 py-6 text-center text-sm text-red-600">{completedTasksError}</p>
        ) : completedTasks.length ? (
          <div className="divide-y px-4">
            {completedTasks.map((task) => (
              <article key={task.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{task.subject}</h3>
                  <span className="text-xs text-slate-500">{task.completedAt ? new Date(task.completedAt).toISOString().slice(0, 10) : "已完成"}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  負責人：{task.assignedToName || "未指定"}｜預定完成：{task.dueDatetime.slice(0, 10)}
                  {task.assignedByName && `｜建立者/指派者：${task.assignedByName}`}
                </p>
                {task.resultNotes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{task.resultNotes}</p>}
              </article>
            ))}
          </div>
        ) : <p className="px-4 py-6 text-center text-sm text-slate-500">此案件尚無已完成待辦</p>}
      </section>

      {advanceModal.open && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
          <form onSubmit={handleAdvance} className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="font-bold mb-4">完成 {advanceModal.milestoneName}</h3>
            <label className="mb-3 block text-sm font-semibold">
              實際完成日
              <input required type="date" value={advanceModal.actualDueDate} onChange={(e) => setAdvanceModal({...advanceModal, actualDueDate: e.target.value})} className="mt-1 w-full border p-2 font-normal"/>
            </label>
            <label className="block text-sm font-semibold">
              備註
              <textarea className="mt-1 w-full border p-2 text-sm font-normal" value={advanceModal.notes} onChange={(e) => setAdvanceModal({...advanceModal, notes: e.target.value})} />
            </label>
            {advanceError && <p role="alert" className="mt-2 text-sm text-red-600">{advanceError}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setAdvanceModal({...advanceModal, open: false})} className="px-3 py-1 text-sm bg-slate-200 rounded">取消</button>
              <button type="submit" disabled={advancing} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">完成</button>
            </div>
          </form>
        </div>
      )}

      {specialAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSpecialAdvance} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold">推進至{specialAdvanceModal.stageName}</h3>
            <p className="mb-4 text-sm text-slate-600">此案件可從目前任何階段直接推進，請填寫原因後確認。</p>
            <label className="block text-sm font-semibold">
              推進原因 *
              <textarea
                required
                value={specialAdvanceModal.reason}
                onChange={(event) => setSpecialAdvanceModal({ ...specialAdvanceModal, reason: event.target.value })}
                rows={4}
                placeholder="請輸入推進至此階段的原因"
                className="mt-2 w-full rounded border p-2 font-normal"
              />
            </label>
            {specialAdvanceError && <p role="alert" className="mt-3 text-sm text-red-600">{specialAdvanceError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSpecialAdvanceModal(null)}
                disabled={advancing}
                className="rounded bg-slate-200 px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={advancing || !specialAdvanceModal.reason.trim()}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {advancing ? "推進中..." : "確認推進"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
