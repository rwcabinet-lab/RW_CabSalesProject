"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  MapPin,
  X,
  Edit3,
  Trash2,
  Plus,
  Send,
  Lock,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Sparkles,
} from "lucide-react";
import {
  MILESTONE_STAGE_LABELS,
  PHASE_LABELS,
  PROJECT_STAGE_LABELS,
  STAGE_CODE_TO_PHASE,
  AUDIT_STAGE_CODES,
  QUOTE_STAGE_CODES,
} from "@/lib/mock-data";
import type {
  ApiResponse,
  MilestoneDTO,
  MilestoneDetailsDTO,
  MilestonePhaseDTO,
  MilestoneRecordDTO,
  MilestoneStageCodeDTO,
  ProjectDTO,
  TaskDTO,
  TrafficLightDTO,
  UserDTO,
} from "@/types/dto";
import { formatTenThousands, fromTenThousands, toTenThousands } from "@/lib/currency";

interface MilestoneWithLight extends MilestoneDTO {
  trafficLight: TrafficLightDTO;
  records?: MilestoneRecordDTO[];
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  COMPLETED:   { label: "已完成",    bg: "bg-emerald-100", text: "text-emerald-800" },
  IN_PROGRESS: { label: "進行中",    bg: "bg-blue-100",    text: "text-blue-800" },
  OVERDUE:     { label: "已逾期",    bg: "bg-red-100",     text: "text-red-800" },
  PENDING:     { label: "待開始",    bg: "bg-slate-100",   text: "text-slate-600" },
};

// 7 大階段 + 額外階段依序排列
const PHASE_ORDER: MilestonePhaseDTO[] = [
  "DEVELOP",
  "REQUIREMENT",
  "PROPOSAL",
  "PRE_PROD",
  "PROD_SHIP",
  "INSTALL",
  "CLOSURE",
  "EXTRA",
];

const todayDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export default function MilestonesPage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const router = useRouter();
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [assignees, setAssignees] = useState<UserDTO[]>([]);
  const [canManageMilestones, setCanManageMilestones] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [milestones, setMilestones] = useState<MilestoneWithLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activePhase, setActivePhase] = useState<MilestonePhaseDTO>("DEVELOP");
  const [draggedMilestoneId, setDraggedMilestoneId] = useState<string | null>(null);

  // 行內編輯
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    plannedDueDate: "", assignedToId: "", priority: "MEDIUM" as "HIGH" | "MEDIUM" | "LOW", notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // 完成確認彈窗
  const [completionModal, setCompletionModal] = useState<{
    milestone: MilestoneWithLight;
    actualDueDate: string;
    notes: string;
  } | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [workflowError, setWorkflowError] = useState("");

  // 審核提交彈窗
  const [submitAuditModal, setSubmitAuditModal] = useState<{
    milestone: MilestoneWithLight;
    notes: string;
  } | null>(null);
  const [submittingAudit, setSubmittingAudit] = useState(false);

  // 額外階段推進
  const [specialAdvanceModal, setSpecialAdvanceModal] = useState<{
    stageCode: "X-1" | "X-2";
    stageName: string;
    reason: string;
  } | null>(null);
  const [specialAdvanceError, setSpecialAdvanceError] = useState("");

  // 多次紀錄 [+] 面板狀態 (記錄展開與表單)
  const [expandedRecords, setExpandedRecords] = useState<Record<string, boolean>>({});
  const [recordsMap, setRecordsMap] = useState<Record<string, MilestoneRecordDTO[]>>({});
  const [newRecordForm, setNewRecordForm] = useState<{
    milestoneId: string;
    plannedDueDate: string;
    actualDueDate: string;
    amount: string;
    notes: string;
  } | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  // 案場基本資料編輯彈窗
  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const [projectEditSaving, setProjectEditSaving] = useState(false);
  const [projectEditError, setProjectEditError] = useState("");
  const [projectEditForm, setProjectEditForm] = useState({
    projectName: "", siteAddress: "", siteCondition: "", expectedDate: "",
    unitCount: "", cost: "", quoteAmount: "",
  });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadError("");

      const [milestonesRes, usersRes, sessionRes, projectsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/milestones`),
        fetch("/api/auth/users"),
        fetch("/api/auth/session", { cache: "no-store" }),
        fetch("/api/projects"),
      ]);

      const data = await milestonesRes.json() as ApiResponse<MilestoneDetailsDTO>;
      if (!milestonesRes.ok) throw new Error(data.error || "無法載入案件里程碑");

      if (data.project) {
        setProject(data.project);
        if (data.project.currentStage === "WRAP_UP" || data.project.currentStage === "LOST") {
          setActivePhase("EXTRA");
        } else {
          const matchedPhase = Object.entries(STAGE_CODE_TO_PHASE).find(([code]) => code === data.project.currentStage);
          if (matchedPhase) {
            setActivePhase(matchedPhase[1]);
          }
        }
      }

      setMilestones(data.milestones);

      if (usersRes.ok) {
        const u = await usersRes.json();
        if (Array.isArray(u)) setAssignees(u);
      }
      if (sessionRes.ok) {
        const s = await sessionRes.json();
        setCurrentUserId(s.user?.id || "");
        setCanManageMilestones(["ADMIN", "LEVEL_MANAGER", "SALES_MANAGER"].includes(s.user?.role));
      }
      if (projectsRes.ok) {
        const p = await projectsRes.json();
        if (Array.isArray(p)) setProjects(p);
      }
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  // 讀取特定里程碑的多次記錄
  const toggleRecords = async (milestoneId: string) => {
    const isExpanded = !expandedRecords[milestoneId];
    setExpandedRecords((prev) => ({ ...prev, [milestoneId]: isExpanded }));

    if (isExpanded && !recordsMap[milestoneId]) {
      try {
        const res = await fetch(`/api/projects/${projectId}/milestones/records?milestoneId=${milestoneId}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setRecordsMap((prev) => ({ ...prev, [milestoneId]: data }));
        }
      } catch (err) {
        console.error("載入多次記錄失敗", err);
      }
    }
  };

  // 新增一筆自訂記錄 [+]
  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecordForm) return;
    setSavingRecord(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneId: newRecordForm.milestoneId,
          plannedDueDate: newRecordForm.plannedDueDate || undefined,
          actualDueDate: newRecordForm.actualDueDate || undefined,
          amount: newRecordForm.amount ? Number(newRecordForm.amount) : undefined,
          notes: newRecordForm.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "新增記錄失敗");

      // 更新前端記錄
      const mid = newRecordForm.milestoneId;
      setRecordsMap((prev) => ({
        ...prev,
        [mid]: [...(prev[mid] || []), json.record],
      }));
      setNewRecordForm(null);
      // 若有填寫實際完成日，重新整理里程碑列表
      if (newRecordForm.actualDueDate) {
        await fetchData();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (milestoneId: string, recordId: string) => {
    if (!confirm("確定刪除此筆記錄？")) return;
    try {
      await fetch(`/api/projects/${projectId}/milestones/records`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId }),
      });
      setRecordsMap((prev) => ({
        ...prev,
        [milestoneId]: (prev[milestoneId] || []).filter((r) => r.id !== recordId),
      }));
    } catch (err) {
      alert("刪除記錄失敗");
    }
  };

  const handleReorderMilestones = async (
    phase: MilestonePhaseDTO,
    sourceId: string,
    targetId: string,
  ) => {
    if (sourceId === targetId || isProjectLost || !canManageMilestones) return;
    const reorderedPhase = [...phaseGroups[phase]];
    const sourceIndex = reorderedPhase.findIndex(({ id }) => id === sourceId);
    const targetIndex = reorderedPhase.findIndex(({ id }) => id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [movedMilestone] = reorderedPhase.splice(sourceIndex, 1);
    reorderedPhase.splice(targetIndex, 0, movedMilestone);

    const ordered = [...milestones].sort((a, b) => a.stageOrder - b.stageOrder);
    const phaseIndexes = ordered.flatMap((milestone, index) =>
      STAGE_CODE_TO_PHASE[milestone.stageCode] === phase ? [index] : [],
    );
    phaseIndexes.forEach((index, phaseIndex) => {
      ordered[index] = reorderedPhase[phaseIndex];
    });
    const orderedIds = ordered.map(({ id }) => id);
    setMilestones(ordered.map((milestone, index) => ({ ...milestone, stageOrder: index + 1 })));

    try {
      const response = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", orderedMilestoneIds: orderedIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "更新順序失敗");
      await fetchData();
    } catch (error) {
      console.error("更新順序失敗", error);
      alert(error instanceof Error ? error.message : "更新順序失敗");
      await fetchData();
    }
  };

  // 提交審核處理
  const handleSubmitAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitAuditModal) return;
    setSubmittingAudit(true);
    try {
      const { milestone, notes } = submitAuditModal;
      const response = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submitAudit", milestoneId: milestone.id, notes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "提交審核失敗");
      alert(`已將【${MILESTONE_STAGE_LABELS[milestone.stageCode]}】提交審核，待辦已發送給主責人員。`);
      setSubmitAuditModal(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "提交審核失敗");
    } finally {
      setSubmittingAudit(false);
    }
  };

  // 完成並推進
  const handleAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionModal) return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance",
          milestoneId: completionModal.milestone.id,
          actualDueDate: completionModal.actualDueDate,
          notes: completionModal.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "推進失敗");
      setCompletionModal(null);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "完成推進失敗");
    } finally {
      setAdvancing(false);
    }
  };

  // 儲存行內編輯
  const handleSaveEdit = async (milestoneId: string) => {
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneId,
          updates: {
            plannedDueDate: editForm.plannedDueDate || null,
            assignedToId: editForm.assignedToId || null,
            priority: editForm.priority,
            notes: editForm.notes,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      setEditingId(null);
      await fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleSpecialAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specialAdvanceModal) return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "specialAdvance",
          stageCode: specialAdvanceModal.stageCode,
          reason: specialAdvanceModal.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "推進至額外階段失敗");
      setSpecialAdvanceModal(null);
      setActivePhase("EXTRA");
      await fetchData();
    } catch (err) {
      setSpecialAdvanceError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) return <div className="p-16 text-center text-slate-500 font-semibold">載入詳細資料中...</div>;

  const isProjectLost = project?.currentStage === "LOST";
  const canReviewAudit =
    canManageMilestones || (!!project && currentUserId === project.salesRepId);

  // 依大階段分組
  const phaseGroups: Record<MilestonePhaseDTO, MilestoneWithLight[]> = {
    DEVELOP: [],
    REQUIREMENT: [],
    PROPOSAL: [],
    PRE_PROD: [],
    PROD_SHIP: [],
    INSTALL: [],
    CLOSURE: [],
    EXTRA: [],
    CONTACT: [],
    DESIGN: [],
    PRODUCTION: [],
  };

  milestones.forEach((m) => {
    const phase = STAGE_CODE_TO_PHASE[m.stageCode] || "DEVELOP";
    if (phaseGroups[phase]) phaseGroups[phase].push(m);
  });

  // 各大階段子進度依 stageOrder 排序
  PHASE_ORDER.forEach((phase) => {
    phaseGroups[phase].sort((a, b) => a.stageOrder - b.stageOrder);
  });

  const phaseProgress = (phase: MilestonePhaseDTO) => {
    const ms = phaseGroups[phase];
    if (!ms.length) return 0;
    return Math.round((ms.filter((m) => m.status === "COMPLETED").length / ms.length) * 100);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/workbench" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> 返回工作台
        </Link>
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            切換案件：
            <select
              value={projectId}
              onChange={(e) => router.push(`/projects/${e.target.value}/milestones`)}
              className="border rounded px-2.5 py-1 text-xs font-normal"
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>{item.projectName}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 案場標頭資訊 */}
      {project && (
        <section className={`bg-white border rounded-2xl p-5 shadow-sm transition ${isProjectLost ? "border-red-300 bg-red-50/20" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900">{project.projectName}</h1>
                {isProjectLost && (
                  <span className="flex items-center gap-1 bg-red-600 text-white text-xs px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                    <Lock className="w-3 h-3" /> 已流標（不可編輯）
                  </span>
                )}
                {project.currentStage === "WRAP_UP" && (
                  <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    收尾中
                  </span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {project.siteAddress}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isProjectLost && (
                <button
                  type="button"
                  onClick={() => {
                    setSpecialAdvanceError("");
                    setSpecialAdvanceModal({ stageCode: "X-2", stageName: "流標", reason: "" });
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  轉為流標
                </button>
              )}
              {project.currentStage !== "WRAP_UP" && !isProjectLost && (
                <button
                  type="button"
                  onClick={() => {
                    setSpecialAdvanceError("");
                    setSpecialAdvanceModal({ stageCode: "X-1", stageName: "收尾", reason: "" });
                  }}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                >
                  進入收尾階段
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 text-xs">
            <div><span className="text-slate-400">客戶：</span><span className="font-semibold text-slate-700">{project.customerName}</span></div>
            <div><span className="text-slate-400">主責業務：</span><span className="font-semibold text-slate-700">{project.salesRepName}</span></div>
            <div><span className="text-slate-400">目前階段：</span><span className="font-bold text-blue-700">{PROJECT_STAGE_LABELS[project.currentStage] || project.currentStage}</span></div>
            <div><span className="text-slate-400">預計完工日：</span><span className="font-semibold text-slate-700">{project.expectedDate?.slice(0, 10) || "未設定"}</span></div>
          </div>
        </section>
      )}

      {/* 7 大階段 + 額外階段 Tabs (水平捲動) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
          {PHASE_ORDER.map((phase) => {
            const progress = phaseProgress(phase);
            const count = phaseGroups[phase].length;
            const hasOverdue = phaseGroups[phase].some((m) => m.status === "OVERDUE");
            const hasInProgress = phaseGroups[phase].some((m) => m.status === "IN_PROGRESS");
            const isActiveTab = activePhase === phase;

            return (
              <button
                key={phase}
                type="button"
                onClick={() => setActivePhase(phase)}
                className={`min-w-[140px] flex-1 px-3 py-3 text-xs font-bold text-left transition border-b-2 shrink-0 ${
                  isActiveTab
                    ? "border-blue-600 bg-blue-50/70 text-blue-900"
                    : "border-transparent text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="truncate">{PHASE_LABELS[phase]?.split("：")[1] || PHASE_LABELS[phase]}</span>
                  {hasOverdue ? (
                    <span className="text-red-600 text-[10px] font-black">🔴</span>
                  ) : hasInProgress ? (
                    <span className="text-blue-600 text-[10px]">●</span>
                  ) : progress === 100 && count > 0 ? (
                    <span className="text-emerald-600 text-[10px]">✓</span>
                  ) : null}
                </div>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${progress}%` }}
                    className={`h-full rounded-full transition-all ${hasOverdue ? "bg-red-500" : "bg-blue-600"}`}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{progress}% ({count}項)</p>
              </button>
            );
          })}
        </div>

        {/* 當前大階段之子進度列表 */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800">
              {PHASE_LABELS[activePhase]}
            </h2>
            <span className="text-xs text-slate-400">拖曳圖卡可調整子進度順序</span>
          </div>

          <div className="space-y-3">
            {phaseGroups[activePhase].map((m) => {
              const isEditing = editingId === m.id;
              const isAuditStage = AUDIT_STAGE_CODES.has(m.stageCode);
              const isAuditSubmitted = m.auditSubmitted === true;
              const isActive = m.status === "IN_PROGRESS" || m.status === "OVERDUE";
              const isQuoteStage = QUOTE_STAGE_CODES.has(m.stageCode);
              const isExpanded = !!expandedRecords[m.id];
              const records = recordsMap[m.id] || [];

              return (
                <div
                  key={m.id}
                  draggable={canManageMilestones && !isProjectLost && !isEditing}
                  onDragStart={(event) => {
                    setDraggedMilestoneId(m.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", m.id);
                  }}
                  onDragOver={(event) => {
                    if (canManageMilestones && draggedMilestoneId) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = event.dataTransfer.getData("text/plain") || draggedMilestoneId;
                    setDraggedMilestoneId(null);
                    if (sourceId) void handleReorderMilestones(activePhase, sourceId, m.id);
                  }}
                  onDragEnd={() => setDraggedMilestoneId(null)}
                  className={`rounded-xl border p-4 transition ${
                    isProjectLost
                      ? "border-slate-200 bg-slate-50/80 opacity-70"
                      : m.status === "OVERDUE"
                        ? "border-red-200 bg-red-50/30"
                        : m.status === "IN_PROGRESS"
                          ? "border-blue-200 bg-blue-50/20 shadow-sm"
                          : m.status === "COMPLETED"
                            ? "border-emerald-100 bg-emerald-50/10"
                            : "border-slate-200 bg-white"
                  }`}
                >
                  {isEditing && !isProjectLost ? (
                    // 行內編輯
                    <div className="space-y-3">
                      <div className="flex justify-between items-center font-bold text-sm">
                        <span>編輯進度 — {MILESTONE_STAGE_LABELS[m.stageCode]}</span>
                        <button type="button" onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="block text-slate-600 mb-1 font-semibold">預定完成日</label>
                          <input
                            type="date"
                            value={editForm.plannedDueDate}
                            onChange={(e) => setEditForm({ ...editForm, plannedDueDate: e.target.value })}
                            className="w-full border rounded p-1.5"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-1 font-semibold">負責人員</label>
                          <select
                            value={editForm.assignedToId}
                            onChange={(e) => setEditForm({ ...editForm, assignedToId: e.target.value })}
                            className="w-full border rounded p-1.5"
                          >
                            <option value="">選擇人員</option>
                            {assignees.map((u) => (
                              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-1 font-semibold">優先度</label>
                          <select
                            value={editForm.priority}
                            onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as any })}
                            className="w-full border rounded p-1.5"
                          >
                            <option value="HIGH">高</option>
                            <option value="MEDIUM">中</option>
                            <option value="LOW">低</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1 font-semibold text-xs">備註說明</label>
                        <input
                          type="text"
                          value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          className="w-full border rounded p-1.5 text-xs"
                          placeholder="例如：需再跟設計師確認線條"
                        />
                      </div>
                      {editError && <p className="text-xs text-red-600 font-semibold">{editError}</p>}
                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-slate-200 text-xs rounded font-semibold">取消</button>
                        <button type="button" onClick={() => handleSaveEdit(m.id)} disabled={saving} className="px-4 py-1.5 bg-blue-600 text-white text-xs rounded font-bold">
                          {saving ? "儲存中..." : "儲存設定"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // 正常顯示卡片
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {canManageMilestones && !isProjectLost && (
                            <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-slate-400" aria-label="拖曳調整順序" />
                          )}

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">
                                {MILESTONE_STAGE_LABELS[m.stageCode]}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_MAP[m.status].bg} ${STATUS_MAP[m.status].text}`}>
                                {STATUS_MAP[m.status].label}
                              </span>
                              {isAuditStage && (
                                <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                                  {isAuditSubmitted ? "等待審核" : "需審核"}
                                </span>
                              )}
                              {m.trafficLight?.color === "RED" && (
                                <span className="text-[10px] text-red-600 font-black">● {m.trafficLight.label}</span>
                              )}
                              {m.trafficLight?.color === "YELLOW" && (
                                <span className="text-[10px] text-amber-600 font-bold">● {m.trafficLight.label}</span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5">
                              <span>負責人：<b className="text-slate-700">{m.assignedToName || "未指派"}</b></span>
                              <span>預定完成：<b>{m.plannedDueDate || "未設定"}</b></span>
                              {m.actualDueDate && <span className="text-emerald-700">實際完成：<b>{m.actualDueDate}</b></span>}
                              {m.notes && <span className="italic text-slate-400">({m.notes})</span>}
                            </div>
                          </div>
                        </div>

                        {/* 按鈕組 */}
                        <div className="flex items-center gap-2">
                          {/* [+] 多次記錄展開按鈕 */}
                          <button
                            type="button"
                            onClick={() => toggleRecords(m.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                            title="展開/收合多次執行紀錄"
                          >
                            <Plus className="w-3 h-3 text-blue-600" />
                            歷次紀錄
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>

                          {isActive && !isProjectLost && isAuditStage && !isAuditSubmitted && currentUserId === m.assignedToId && (
                            <button
                              type="button"
                              onClick={() => setSubmitAuditModal({ milestone: m, notes: "" })}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                            >
                              <Send className="w-3 h-3" /> 提交審核
                            </button>
                          )}

                          {isActive && !isProjectLost && (
                            (!isAuditStage || (isAuditSubmitted && canReviewAudit)) && (
                            <button
                              type="button"
                              onClick={() => setCompletionModal({ milestone: m, actualDueDate: todayDate(), notes: "" })}
                              className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                            >
                              <Sparkles className="w-3 h-3" /> {isAuditStage ? "審核完成並推進" : "完成並推進"}
                            </button>
                            )
                          )}

                          {canManageMilestones && !isProjectLost && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(m.id);
                                setEditForm({
                                  plannedDueDate: m.plannedDueDate || "",
                                  assignedToId: m.assignedToId || "",
                                  priority: (m.priority as any) || "MEDIUM",
                                  notes: m.notes || "",
                                });
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100"
                              title="編輯時程與負責人"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* [+] 多次紀錄展開折疊面板 */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-100 bg-slate-50/60 p-3 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-700">歷次執行紀錄 / 追加填報</span>
                            {!isProjectLost && !newRecordForm && (
                              <button
                                type="button"
                                onClick={() => setNewRecordForm({ milestoneId: m.id, plannedDueDate: todayDate(), actualDueDate: "", amount: "", notes: "" })}
                                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
                              >
                                <Plus className="w-3.5 h-3.5" /> 新增一筆紀錄
                              </button>
                            )}
                          </div>

                          {/* 記錄列表 */}
                          <div className="space-y-1.5">
                            {records.map((r, rIdx) => (
                              <div key={r.id} className="flex items-center justify-between bg-white px-3 py-1.5 rounded border text-xs">
                                <div className="flex items-center gap-3">
                                  <span className="font-bold text-slate-500">#{rIdx + 1}</span>
                                  {r.plannedDueDate && <span>預定：{r.plannedDueDate}</span>}
                                  {r.actualDueDate ? (
                                    <span className="text-emerald-700 font-semibold">實際：{r.actualDueDate}</span>
                                  ) : (
                                    <span className="text-slate-400">尚未完成</span>
                                  )}
                                  {isQuoteStage && r.amount != null && <span>報價：${r.amount.toLocaleString()}</span>}
                                  {r.notes && <span className="text-slate-600 italic">備註：{r.notes}</span>}
                                </div>
                                {!isProjectLost && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRecord(m.id, r.id)}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    title="刪除此筆記錄"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {records.length === 0 && !newRecordForm && (
                              <p className="text-slate-400 text-xs italic py-1">目前尚無自訂歷次紀錄，可點擊上方按鈕新增。</p>
                            )}
                          </div>

                          {/* 行內新增紀錄表單 */}
                          {newRecordForm && newRecordForm.milestoneId === m.id && (
                            <form onSubmit={handleAddRecord} className="mt-3 p-2.5 bg-blue-50/50 border border-blue-200 rounded-lg space-y-2 text-xs">
                              <div className="font-bold text-blue-900">填寫新紀錄</div>
                              <div className={`grid grid-cols-2 gap-2 ${isQuoteStage ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                                <div>
                                  <label className="block text-slate-600 mb-0.5">預定完成日</label>
                                  <input
                                    type="date"
                                    value={newRecordForm.plannedDueDate}
                                    onChange={(e) => setNewRecordForm({ ...newRecordForm, plannedDueDate: e.target.value })}
                                    className="w-full border rounded p-1"
                                  />
                                </div>
                                <div>
                                  <label className="block text-slate-600 mb-0.5">實際完成日</label>
                                  <input
                                    type="date"
                                    value={newRecordForm.actualDueDate}
                                    onChange={(e) => setNewRecordForm({ ...newRecordForm, actualDueDate: e.target.value })}
                                    className="w-full border rounded p-1"
                                  />
                                </div>
                                {isQuoteStage && (
                                  <div>
                                    <label className="block text-slate-600 mb-0.5">報價</label>
                                    <input
                                      type="number"
                                      placeholder="可選填"
                                      value={newRecordForm.amount}
                                      onChange={(e) => setNewRecordForm({ ...newRecordForm, amount: e.target.value })}
                                      className="w-full border rounded p-1"
                                    />
                                  </div>
                                )}
                                <div>
                                  <label className="block text-slate-600 mb-0.5">備註說明</label>
                                  <input
                                    type="text"
                                    placeholder="如：第2次丈量、追加報價"
                                    value={newRecordForm.notes}
                                    onChange={(e) => setNewRecordForm({ ...newRecordForm, notes: e.target.value })}
                                    className="w-full border rounded p-1"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button type="button" onClick={() => setNewRecordForm(null)} className="px-2.5 py-1 bg-slate-200 rounded">取消</button>
                                <button type="submit" disabled={savingRecord} className="px-3 py-1 bg-blue-600 text-white font-bold rounded">
                                  {savingRecord ? "儲存中..." : "確認新增"}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {phaseGroups[activePhase].length === 0 && (
              <p className="text-center text-slate-400 py-8 text-xs">此階段尚無子進度設定</p>
            )}
          </div>
        </div>
      </div>

      {/* 完成並推進確認彈窗 */}
      {completionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-slate-900">
                <Sparkles className="w-5 h-5 text-blue-600" />
                完成進度 — {MILESTONE_STAGE_LABELS[completionModal.milestone.stageCode]}
              </h3>
              <button type="button" onClick={() => setCompletionModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdvance} className="space-y-3 text-xs">
              <p className="text-slate-600 bg-blue-50 p-2.5 rounded-lg border border-blue-100">
                完成後，系統將自動啟動排在下一個順位的子進度，並連動更新案件總表當前進度。
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">實際完成日</label>
                <input
                  type="date"
                  required
                  value={completionModal.actualDueDate}
                  onChange={(e) => setCompletionModal({ ...completionModal, actualDueDate: e.target.value })}
                  className="w-full border rounded p-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">執行備註說明</label>
                <textarea
                  rows={3}
                  value={completionModal.notes}
                  onChange={(e) => setCompletionModal({ ...completionModal, notes: e.target.value })}
                  placeholder="如：圖面已全數確認完畢，客戶已簽認"
                  className="w-full border rounded p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setCompletionModal(null)} className="px-3 py-1.5 bg-slate-200 rounded font-semibold">取消</button>
                <button type="submit" disabled={advancing} className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded shadow">
                  {advancing ? "推進中..." : "確認完成並推進"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 提交審核彈窗 */}
      {submitAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-purple-900">
                <Send className="w-5 h-5 text-purple-600" />
                提交審核 — {MILESTONE_STAGE_LABELS[submitAuditModal.milestone.stageCode]}
              </h3>
              <button type="button" onClick={() => setSubmitAuditModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitAudit} className="space-y-3 text-xs">
              <p className="text-slate-600 bg-purple-50 p-2.5 rounded-lg border border-purple-100">
                提交後，系統會自動在審核人員（主責業務/主管）的待辦清單中建立待辦事項，僅審核人員具備完成權限。
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">提交審核備註</label>
                <textarea
                  rows={3}
                  value={submitAuditModal.notes}
                  onChange={(e) => setSubmitAuditModal({ ...submitAuditModal, notes: e.target.value })}
                  placeholder="如：設計圖已繪製完成，請審核是否有工法衝突"
                  className="w-full border rounded p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setSubmitAuditModal(null)} className="px-3 py-1.5 bg-slate-200 rounded font-semibold">取消</button>
                <button type="submit" disabled={submittingAudit} className="px-4 py-1.5 bg-purple-600 text-white font-bold rounded shadow">
                  {submittingAudit ? "提交中..." : "確認提交審核"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 轉為流標 / 收尾彈窗 */}
      {specialAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-red-900">
                <AlertCircle className="w-5 h-5 text-red-600" />
                確認將案件轉為【{specialAdvanceModal.stageName}】
              </h3>
              <button type="button" onClick={() => setSpecialAdvanceModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSpecialAdvance} className="space-y-3 text-xs">
              <p className="text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
                {specialAdvanceModal.stageCode === "X-2"
                  ? "轉為流標後，該案件的所有里程碑將進入唯讀鎖定狀態，不可再編輯或推進。"
                  : "進入收尾階段後，案場狀態將標記為收尾中。"}
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">原因說明 *</label>
                <textarea
                  required
                  rows={3}
                  value={specialAdvanceModal.reason}
                  onChange={(e) => setSpecialAdvanceModal({ ...specialAdvanceModal, reason: e.target.value })}
                  placeholder="請填寫轉為此階段之原因..."
                  className="w-full border rounded p-2 text-xs"
                />
              </div>
              {specialAdvanceError && <p className="text-red-600 font-bold">{specialAdvanceError}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setSpecialAdvanceModal(null)} className="px-3 py-1.5 bg-slate-200 rounded font-semibold">取消</button>
                <button type="submit" disabled={advancing} className="px-4 py-1.5 bg-red-600 text-white font-bold rounded shadow">
                  {advancing ? "處理中..." : `確認轉為${specialAdvanceModal.stageName}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
