"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowLeft,
  Calendar,
  User,
  Edit3,
  Save,
  X,
  Sparkles,
} from "lucide-react";
import {
  ProjectMilestoneItem,
  MilestonePhase,
  MilestoneStageCode,
  MILESTONE_STAGE_LABELS,
  PHASE_LABELS,
} from "@/lib/mock-data";
import { ProjectDetail } from "@/lib/mock-data";

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

export default function MilestonesPage({ params }: { params: { id: string } }) {
  const projectId = params.id;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [milestones, setMilestones] = useState<MilestoneWithLight[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState<MilestonePhase>("CONTACT");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    plannedDueDate: "", actualDueDate: "", assignedToName: "", notes: "", attachments: ""
  });
  const [saving, setSaving] = useState(false);
  const [advanceModal, setAdvanceModal] = useState({ open: false, milestoneId: "", milestoneName: "", notes: "" });
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/milestones`);
      const data = await res.json();
      if (data.project) setProject(data.project);
      if (Array.isArray(data.milestones)) setMilestones(data.milestones);
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
      assignedToName: m.assignedToName || "",
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
        {project && (
          <div className="text-right">
            <h1 className="text-xl font-black">{project.projectName}</h1>
            <p className="text-xs text-slate-500">{project.siteAddress}</p>
          </div>
        )}
      </div>

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
          {phaseGroups[activePhase].map((m) => (
            <div key={m.id} className={`border p-3 rounded-xl ${m.status === "OVERDUE" ? "bg-red-50" : m.status === "IN_PROGRESS" ? "bg-blue-50" : "bg-white"}`}>
              {editingId === m.id ? (
                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-sm">編輯 {MILESTONE_STAGE_LABELS[m.stageCode]}<button onClick={() => setEditingId(null)}><X className="w-4 h-4" /></button></div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label>預定完成日 <input type="date" value={editForm.plannedDueDate} onChange={(e) => setEditForm({...editForm, plannedDueDate: e.target.value})} className="border w-full p-1"/></label>
                    <label>實際完成日 <input type="date" value={editForm.actualDueDate} onChange={(e) => setEditForm({...editForm, actualDueDate: e.target.value})} className="border w-full p-1"/></label>
                    <label>負責人 <input type="text" value={editForm.assignedToName} onChange={(e) => setEditForm({...editForm, assignedToName: e.target.value})} className="border w-full p-1"/></label>
                    <label>備註 <input type="text" value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} className="border w-full p-1"/></label>
                  </div>
                  <button onClick={() => handleSaveEdit(m.id)} disabled={saving} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">儲存</button>
                </div>
              ) : (
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-sm">{MILESTONE_STAGE_LABELS[m.stageCode]} <span className={`text-[10px] px-1.5 rounded-full ${STATUS_MAP[m.status].bg} ${STATUS_MAP[m.status].text}`}>{STATUS_MAP[m.status].label}</span></div>
                    <div className="text-xs text-slate-500 mt-1">預定：{m.plannedDueDate || "無"} | 實際：{m.actualDueDate || "無"} | 負責：{m.assignedToName || "無"}</div>
                  </div>
                  <div className="flex gap-2">
                    {(m.status === "IN_PROGRESS" || m.status === "OVERDUE") && (
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
    </div>
  );
}
