"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  MapPin,
  X,
} from "lucide-react";
import {
  ProjectMilestoneItem,
  MilestonePhase,
  MilestoneStageCode,
  MILESTONE_STAGE_LABELS,
  PHASE_LABELS,
  ProjectDetail,
  SalesTaskItem,
} from "@/lib/mock-data";

interface MilestoneWithLight extends ProjectMilestoneItem {
  trafficLight: { color: string; label: string; daysDiff: number };
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  COMPLETED:   { label: "已完成",    bg: "bg-emerald-100", text: "text-emerald-800" },
  IN_PROGRESS: { label: "進行中",    bg: "bg-blue-100",    text: "text-blue-800" },
  OVERDUE:     { label: "已逾期",    bg: "bg-red-100",     text: "text-red-800" },
  PENDING:     { label: "待開始",    bg: "bg-slate-100",   text: "text-slate-600" },
};

const PHASE_ORDER: MilestonePhase[] = ["CONTACT", "DESIGN", "PRODUCTION", "EXTRA"];

interface MilestoneAssignee {
  id: string;
  name: string;
  role: string;
}

export default function MilestonesPage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  const [assignees, setAssignees] = useState<MilestoneAssignee[]>([]);
  const [completedTasks, setCompletedTasks] = useState<SalesTaskItem[]>([]);
  const [milestones, setMilestones] = useState<MilestoneWithLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState<MilestonePhase>("CONTACT");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    plannedDueDate: "", actualDueDate: "", assignedToId: "", notes: "", attachments: ""
  });
  const [saving, setSaving] = useState(false);
  const [advanceModal, setAdvanceModal] = useState({ open: false, milestoneId: "", milestoneName: "", notes: "" });
  const [advancing, setAdvancing] = useState(false);
  const [specialAdvanceModal, setSpecialAdvanceModal] = useState<{
    stageCode: "X-1" | "X-2";
    stageName: string;
    reason: string;
  } | null>(null);
  const [specialAdvanceError, setSpecialAdvanceError] = useState("");

  useEffect(() => {
    fetchData();
    fetchProjects();
    fetchAssignees();
  }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (Array.isArray(data)) setProjects(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAssignees = async () => {
    try {
      const res = await fetch("/api/auth/users");
      const data = await res.json();
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
      const res = await fetch(`/api/projects/${projectId}/milestones`);
      const data = await res.json();
      if (data.project) {
        setProject(data.project);
        if (data.project.currentStage === "WRAP_UP" || data.project.currentStage === "LOST") {
          setActivePhase("EXTRA");
        }
      }
      if (Array.isArray(data.milestones)) setMilestones(data.milestones);

      const tasksRes = await fetch(`/api/tasks?projectId=${projectId}&isCompleted=true`);
      const tasksData = await tasksRes.json();
      if (Array.isArray(tasksData)) setCompletedTasks(tasksData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (m: MilestoneWithLight) => {
    setEditingId(m.id);
    setEditForm({
      plannedDueDate: m.plannedDueDate || "",
      actualDueDate: m.actualDueDate || "",
      assignedToId: m.assignedToId || "",
      notes: m.notes || "",
      attachments: m.attachments || "",
    });
  };

  const handleSaveEdit = async (milestoneId: string) => {
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestoneId, updates: { ...editForm, plannedDueDate: editForm.plannedDueDate || null, actualDueDate: editForm.actualDueDate || null } }),
      });
      setEditingId(null);
      await fetchData();
    } finally { setSaving(false); }
  };

  const handleAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdvancing(true);
    try {
      await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", milestoneId: advanceModal.milestoneId, notes: advanceModal.notes }),
      });
      setAdvanceModal({ open: false, milestoneId: "", milestoneName: "", notes: "" });
      await fetchData();
    } finally { setAdvancing(false); }
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
      const data = await res.json();
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
      const data = await res.json();
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

  const phaseGroups: Record<MilestonePhase, MilestoneWithLight[]> = { CONTACT: [], DESIGN: [], PRODUCTION: [], EXTRA: [] };
  milestones.forEach(m => phaseGroups[m.phase]?.push(m));

  const phaseProgress = (phase: MilestonePhase) => {
    const ms = phaseGroups[phase];
    if (!ms.length) return 0;
    return Math.round((ms.filter((m) => m.status === "COMPLETED").length / ms.length) * 100);
  };

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
              <span className={`rounded px-2 py-1 text-xs font-bold ${project.isDelayed ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                {project.isDelayed ? "案件逾期" : "時程正常"}
              </span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3 text-sm md:grid-cols-4">
            <div><dt className="text-xs text-slate-500">客戶</dt><dd className="font-semibold">{project.customerName}（{project.customerType}）</dd></div>
            <div><dt className="text-xs text-slate-500">案件業務</dt><dd className="font-semibold">{project.salesRepName}</dd></div>
            <div><dt className="text-xs text-slate-500">案件業助</dt><dd className="font-semibold">{project.salesAssistantName || "未指定"}</dd></div>
            <div><dt className="text-xs text-slate-500">預計日期</dt><dd className="font-semibold">{project.expectedDate?.slice(0, 10) || "未設定"}</dd></div>
            <div><dt className="text-xs text-slate-500">戶數</dt><dd className="font-semibold">{project.unitCount ?? "未設定"}</dd></div>
            <div><dt className="text-xs text-slate-500">預算 / 報價</dt><dd className="font-semibold">{project.quoteAmount ?? project.estimatedBudget ?? "未設定"}</dd></div>
            <div className="col-span-2 md:col-span-2"><dt className="text-xs text-slate-500">現場狀況</dt><dd className="font-semibold">{project.siteCondition || "未填寫"}</dd></div>
          </dl>
        </section>
      )}

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="flex border-b">
          {PHASE_ORDER.map((phase) => {
            const prog = phaseProgress(phase);
            const active = activePhase === phase;
            return (
              <button key={phase} onClick={() => setActivePhase(phase)} className={`flex-1 p-3 text-xs text-left border-b-2 ${active ? "border-blue-600 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}>
                <div className="font-bold">{PHASE_LABELS[phase].split("：")[0]}</div>
                <div className="w-full h-1 bg-slate-200 mt-1"><div style={{ width: `${prog}%` }} className="h-full bg-blue-500" /></div>
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-2">
          {activePhase === "EXTRA" && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-red-50 p-3">
              <span className="mr-auto text-sm font-bold text-red-900">額外階段操作</span>
              <button
                type="button"
                onClick={() => {
                  setSpecialAdvanceError("");
                  setSpecialAdvanceModal({ stageCode: "X-1", stageName: "收尾", reason: "" });
                }}
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
              >
                推進至收尾
              </button>
              <button
                type="button"
                onClick={() => {
                  setSpecialAdvanceError("");
                  setSpecialAdvanceModal({ stageCode: "X-2", stageName: "流標", reason: "" });
                }}
                className="rounded bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                推進至流標
              </button>
              {project?.currentStage === "WRAP_UP" && (
                <button
                  type="button"
                  onClick={handleReturnToProduction}
                  disabled={advancing}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {advancing ? "處理中..." : "返回第三階段"}
                </button>
              )}
            </div>
          )}
          {phaseGroups[activePhase].map((m) => (
            <div key={m.id} className={`border p-3 rounded-xl ${m.status === "OVERDUE" ? "bg-red-50" : m.status === "IN_PROGRESS" ? "bg-blue-50" : "bg-white"}`}>
              {editingId === m.id ? (
                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-sm">編輯 {MILESTONE_STAGE_LABELS[m.stageCode]}<button onClick={() => setEditingId(null)}><X className="w-4 h-4" /></button></div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label>預定完成日 <input type="date" value={editForm.plannedDueDate} onChange={(e) => setEditForm({...editForm, plannedDueDate: e.target.value})} className="border w-full p-1"/></label>
                    <label>實際完成日 <input type="date" value={editForm.actualDueDate} onChange={(e) => setEditForm({...editForm, actualDueDate: e.target.value})} className="border w-full p-1"/></label>
                    <label>負責人
                      <select value={editForm.assignedToId} onChange={(e) => setEditForm({...editForm, assignedToId: e.target.value})} className="border w-full p-1">
                        <option value="">未指定</option>
                        {assignees.map((user) => <option key={user.id} value={user.id}>{user.role === "SALES" ? "業務" : "業助"}｜{user.name}</option>)}
                      </select>
                    </label>
                    <label>{m.stageCode.startsWith("X-") ? "推進原因 *" : "備註"} <input type="text" value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} className="border w-full p-1"/></label>
                  </div>
                  <button onClick={() => handleSaveEdit(m.id)} disabled={saving || (m.stageCode.startsWith("X-") && !editForm.notes.trim())} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">儲存</button>
                </div>
              ) : (
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-sm">{MILESTONE_STAGE_LABELS[m.stageCode]} <span className={`text-[10px] px-1.5 rounded-full ${STATUS_MAP[m.status].bg} ${STATUS_MAP[m.status].text}`}>{STATUS_MAP[m.status].label}</span></div>
                    <div className="text-xs text-slate-500 mt-1">預定：{m.plannedDueDate || "無"} | 實際：{m.actualDueDate || "無"} | 負責：{m.assignedToName || "無"}</div>
                    {m.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">原因／備註：{m.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    {project?.currentStage !== "WRAP_UP" && project?.currentStage !== "LOST" && (m.status === "IN_PROGRESS" || m.status === "OVERDUE") && (
                      <button onClick={() => setAdvanceModal({ open: true, milestoneId: m.id, milestoneName: MILESTONE_STAGE_LABELS[m.stageCode], notes: "" })} className="bg-blue-600 text-white px-2 py-1 text-xs rounded">完成</button>
                    )}
                    <button onClick={() => startEdit(m)} className="text-slate-500"><Edit3 className="w-4 h-4"/></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-3 font-bold"><CheckCircle2 className="h-5 w-5 text-emerald-600" />已完成待辦備查</div>
        {completedTasks.length ? (
          <div className="divide-y px-4">
            {completedTasks.map((task) => (
              <article key={task.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{task.subject}</h3>
                  <span className="text-xs text-slate-500">{task.completedAt ? new Date(task.completedAt).toLocaleString("zh-TW") : "已完成"}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">負責人：{task.assignedToName || "未指定"}｜原到期：{new Date(task.dueDatetime).toLocaleString("zh-TW")}</p>
                {task.resultNotes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{task.resultNotes}</p>}
              </article>
            ))}
          </div>
        ) : <p className="px-4 py-6 text-center text-sm text-slate-500">此案件尚無已完成待辦</p>}
      </section>

      {advanceModal.open && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-xl w-96">
            <h3 className="font-bold mb-4">確認完成 {advanceModal.milestoneName}</h3>
            <textarea className="w-full border p-2 text-sm" placeholder="備註..." value={advanceModal.notes} onChange={(e) => setAdvanceModal({...advanceModal, notes: e.target.value})} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAdvanceModal({...advanceModal, open: false})} className="px-3 py-1 text-sm bg-slate-200 rounded">取消</button>
              <button onClick={handleAdvance} disabled={advancing} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">推進</button>
            </div>
          </div>
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
