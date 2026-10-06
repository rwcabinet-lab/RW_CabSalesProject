"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Clock,
  Plus,
  Building,
  Edit3,
  CheckCircle2,
  X,
} from "lucide-react";
import { CustomerItem, SalesTaskItem, PROJECT_STAGE_LABELS } from "@/lib/mock-data";

interface WorkbenchProject {
  id: string;
  projectName: string;
  customerId: string;
  customerName: string;
  customerType: string;
  defaultDiscount: number;
  siteCondition: string;
  expectedDate: string;
  currentStage: string;
  siteAddress: string;
  isDelayed: boolean;
  totalAmount: number | null;
  unitCount?: number;
  cost?: number;
  quoteAmount?: number;
  activeMilestone: {
    id: string;
    phase: "CONTACT" | "DESIGN" | "PRODUCTION" | "EXTRA";
    stageName: string;
    plannedDueDate: string;
    status: string;
  } | null;
  trafficLight: {
    color: "RED" | "YELLOW" | "GREEN" | "GRAY";
    label: string;
    daysDiff: number;
  };
}

export default function SalesWorkbenchPage() {
  const [projects, setProjects] = useState<WorkbenchProject[]>([]);
  const [tasks, setTasks] = useState<SalesTaskItem[]>([]);
  const [currentUser, setCurrentUser] = useState({ id: "", name: "使用者", role: "SALES" });
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);

  // 篩選條件
  const [monthFilter, setMonthFilter] = useState("");
  const [timeStandard, setTimeStandard] = useState(""); // 簽約/生產/完工/結案等階段過濾

  // 行內新增/編輯案場
  const [isProjectPanelOpen, setIsProjectPanelOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newProjectData, setNewProjectData] = useState({
    projectName: "", customerId: "", siteAddress: "", siteCondition: "", expectedDate: "",
    unitCount: "", cost: "", quoteAmount: "",
  });
  const [savingProject, setSavingProject] = useState(false);

  // 待辦 Modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskData, setNewTaskData] = useState({ projectId: "", subject: "", taskType: "SITE_VISIT", dueDatetime: new Date().toISOString().slice(0, 16), priority: "HIGH" });
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<SalesTaskItem | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionDate, setCompletionDate] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  );
  const [completingTask, setCompletingTask] = useState(false);
  const [completionError, setCompletionError] = useState("");

  useEffect(() => {
    fetchWorkbenchData();
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      if (Array.isArray(data)) setCustomers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWorkbenchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard/workbench");
      const json = await res.json();
      if (json.currentUser) setCurrentUser(json.currentUser);
      if (Array.isArray(json.myProjects)) setProjects(json.myProjects);
      if (Array.isArray(json.tasks)) setTasks(json.tasks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToComplete) return;

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
          completedAt: completionDate,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setCompletionError(result.error || "完成待辦失敗，請稍後再試");
        return;
      }

      await fetchWorkbenchData();
      setTaskToComplete(null);
      setCompletionNotes("");
    } catch (err) {
      console.error("Failed to complete task:", err);
      setCompletionError("完成待辦時發生錯誤，請稍後再試");
    } finally {
      setCompletingTask(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskData.subject || !newTaskData.projectId) return;
    setCreatingTask(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newTaskData, assignedToId: currentUser.id, assignedToName: currentUser.name }),
      });
      if (res.ok) {
        setShowTaskModal(false);
        setNewTaskData({ projectId: "", subject: "", taskType: "SITE_VISIT", dueDatetime: new Date().toISOString().slice(0, 16), priority: "HIGH" });
        await fetchWorkbenchData();
      }
    } finally { setCreatingTask(false); }
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectData.projectName || !newProjectData.customerId || !newProjectData.siteAddress) return;
    setSavingProject(true);
    try {
      const payload = {
        ...newProjectData,
        unitCount: newProjectData.unitCount ? Number(newProjectData.unitCount) : undefined,
        cost: newProjectData.cost ? Number(newProjectData.cost) : undefined,
        quoteAmount: newProjectData.quoteAmount ? Number(newProjectData.quoteAmount) : undefined,
      };
      await fetch("/api/projects", {
        method: editingProjectId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProjectId ? { id: editingProjectId, ...payload } : payload),
      });
      setIsProjectPanelOpen(false);
      setEditingProjectId(null);
      await fetchWorkbenchData();
    } finally { setSavingProject(false); }
  };

  const openAddProject = () => {
    setEditingProjectId(null);
    setNewProjectData({ projectName: "", customerId: customers[0]?.id || "", siteAddress: "", siteCondition: "", expectedDate: "", unitCount: "", cost: "", quoteAmount: "" });
    setIsProjectPanelOpen(true);
  };

  const openEditProject = (p: WorkbenchProject) => {
    setEditingProjectId(p.id);
    setNewProjectData({
      projectName: p.projectName, customerId: p.customerId, siteAddress: p.siteAddress, siteCondition: p.siteCondition,
      expectedDate: p.expectedDate ? p.expectedDate.slice(0,10) : "",
      unitCount: p.unitCount?.toString() || "", cost: p.cost?.toString() || "", quoteAmount: p.quoteAmount?.toString() || ""
    });
    setIsProjectPanelOpen(true);
  };

  if (loading) return <div className="p-16 text-center">正在載入業務工作台...</div>;

  // 過濾邏輯
  const filteredProjects = projects.filter((p) => {
    let match = true;
    if (timeStandard && p.currentStage !== timeStandard) match = false;
    if (monthFilter) {
      const dateToCheck = p.activeMilestone?.plannedDueDate || p.expectedDate || "";
      if (!dateToCheck.startsWith(monthFilter)) match = false;
    }
    return match;
  });
  const pendingTasks = tasks.filter((task) => !task.isCompleted);

  return (
    <div className="space-y-8 pb-16">
      <div className="flex justify-between border-b pb-4">
        <div>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">業務工作台</span>
          <h1 className="text-2xl font-black mt-1">案件列表</h1>
        </div>
        <button onClick={() => setShowTaskModal(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white"><Plus className="w-4 h-4"/> 建立待辦</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h2 className="text-base font-bold flex items-center gap-2 mb-4"><CheckSquare className="w-5 h-5 text-blue-600" /> 待辦事項</h2>
        <div className="divide-y">
          {pendingTasks.map((task) => (
            <div key={task.id} className="py-3 flex justify-between items-start">
              <div className="flex gap-3 items-start">
                <div>
                  <div className="font-bold text-sm">[{task.projectName}] {task.subject}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    預定完成：{task.dueDatetime.slice(0, 10)} | 優先：{task.priority}
                    {task.assignedByName && ` | 指派者：${task.assignedByName}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTaskToComplete(task);
                  setCompletionNotes("");
                  setCompletionDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
                  setCompletionError("");
                }}
                className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" /> 完成
              </button>
            </div>
          ))}
          {pendingTasks.length === 0 && <p className="py-6 text-center text-sm text-slate-500">目前沒有待處理事項</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-blue-600"/> 案件清單</h2>
          <div className="flex items-center gap-3">
            <button onClick={openAddProject} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="w-4 h-4"/> 新增案場</button>
          </div>
        </div>

        <div className="bg-white p-4 border-b flex gap-4 bg-slate-50/50">
          <label className="flex items-center gap-2 text-sm font-semibold">
            月份：<input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="border rounded px-2 py-1" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            階段：
            <select value={timeStandard} onChange={(e) => setTimeStandard(e.target.value)} className="border rounded px-2 py-1">
              <option value="">全部</option>
              <option value="CONTACT">接洽期 (含報價/簽約)</option>
              <option value="DESIGN">設計確認期</option>
              <option value="PRODUCTION">生產施工期</option>
              <option value="CLOSED">結案</option>
              <option value="WRAP_UP">收尾</option>
              <option value="LOST">流標</option>
            </select>
          </label>
        </div>

        {isProjectPanelOpen && (
          <form onSubmit={handleSaveProject} className="p-4 bg-emerald-50 border-b border-emerald-100">
            <div className="flex justify-between font-bold mb-3">{editingProjectId ? "編輯案場" : "新增案場"} <button type="button" onClick={() => setIsProjectPanelOpen(false)}><X className="w-5 h-5 text-slate-500"/></button></div>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <label>案場名稱 *<input required value={newProjectData.projectName} onChange={(e) => setNewProjectData({...newProjectData, projectName: e.target.value})} className="w-full border rounded p-1.5 mt-1"/></label>
              <label>客戶 *
                <select required value={newProjectData.customerId} onChange={(e) => setNewProjectData({...newProjectData, customerId: e.target.value})} className="w-full border rounded p-1.5 mt-1">
                  <option value="">選擇客戶</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>施工地址 *<input required value={newProjectData.siteAddress} onChange={(e) => setNewProjectData({...newProjectData, siteAddress: e.target.value})} className="w-full border rounded p-1.5 mt-1"/></label>
              <label>戶數<input type="number" value={newProjectData.unitCount} onChange={(e) => setNewProjectData({...newProjectData, unitCount: e.target.value})} className="w-full border rounded p-1.5 mt-1"/></label>
              <label>成本金額<input type="number" value={newProjectData.cost} onChange={(e) => setNewProjectData({...newProjectData, cost: e.target.value})} className="w-full border rounded p-1.5 mt-1"/></label>
              <label>報價金額<input type="number" value={newProjectData.quoteAmount} onChange={(e) => setNewProjectData({...newProjectData, quoteAmount: e.target.value})} className="w-full border rounded p-1.5 mt-1"/></label>
              <label>預計完工日<input type="date" value={newProjectData.expectedDate} onChange={(e) => setNewProjectData({...newProjectData, expectedDate: e.target.value})} className="w-full border rounded p-1.5 mt-1"/></label>
              <div className="flex items-end"><button disabled={savingProject || !newProjectData.projectName} className="w-full bg-emerald-600 text-white rounded p-1.5 font-bold">{savingProject ? "儲存中" : "儲存案場"}</button></div>
            </div>
          </form>
        )}

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3">狀態</th><th className="p-3">案場/地址</th><th className="p-3">客戶 (折數)</th><th className="p-3">預算/戶數</th><th className="p-3">目前階段</th><th className="p-3">當前進度</th><th className="p-3">預定完成日</th><th className="p-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredProjects.map(p => (
              <tr
                key={p.id}
                className={`hover:brightness-95 ${
                  p.activeMilestone?.phase === "EXTRA" || p.currentStage === "WRAP_UP" || p.currentStage === "LOST"
                    ? "bg-red-50"
                    : p.activeMilestone?.phase === "PRODUCTION" || ["PRODUCTION", "CLOSED", "BILLED", "DONE"].includes(p.currentStage)
                      ? "bg-green-50"
                      : p.activeMilestone?.phase === "DESIGN" || p.currentStage === "DESIGN"
                        ? "bg-blue-50"
                        : "bg-yellow-50"
                }`}
              >
                <td className="p-3"><span className={`px-2 py-1 rounded-full font-bold ${p.trafficLight.color==="RED"?"bg-red-100 text-red-700":p.trafficLight.color==="YELLOW"?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700"}`}>● {p.trafficLight.label}</span></td>
                <td className="p-3 font-bold">{p.projectName}<div className="text-[10px] text-slate-500">{p.siteAddress}</div></td>
                <td className="p-3">{p.customerName} <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">{p.defaultDiscount===1?"牌價":`${(p.defaultDiscount*10).toFixed(1)}折`}</span></td>
                <td className="p-3">NT$ {p.totalAmount || p.quoteAmount || 0}<br/><span className="text-[10px] text-slate-500">{p.unitCount?`${p.unitCount}戶`:"未填"}</span></td>
                <td className="p-3 font-bold text-slate-700">{PROJECT_STAGE_LABELS[p.currentStage] || p.currentStage}</td>
                <td className="p-3 font-bold">{p.currentStage === "LOST" ? "流標" : p.activeMilestone?.stageName || "完結"}</td>
                <td className="p-3">{(p.activeMilestone?.plannedDueDate || p.expectedDate)?.slice(0, 10)}</td>
                <td className="p-3 flex gap-2 justify-center">
                  <button onClick={() => openEditProject(p)} className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">編輯</button>
                  <Link href={`/projects/${p.id}/milestones`} className="bg-slate-200 text-slate-700 px-2 py-1 rounded text-xs">案件細節</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white p-6 rounded-xl w-96">
            <h3 className="font-bold mb-4">新增待辦</h3>
            <form onSubmit={handleCreateTask} className="space-y-3 text-sm">
              <label className="block">關聯案場<select required value={newTaskData.projectId} onChange={e=>setNewTaskData({...newTaskData, projectId: e.target.value})} className="w-full border p-1.5"><option value="">選擇</option>{projects.map(p=><option key={p.id} value={p.id}>{p.projectName}</option>)}</select></label>
              <label className="block">主題<input required value={newTaskData.subject} onChange={e=>setNewTaskData({...newTaskData, subject: e.target.value})} className="w-full border p-1.5"/></label>
              <div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowTaskModal(false)} className="px-3 py-1 bg-slate-200 rounded">取消</button><button disabled={creatingTask} className="px-3 py-1 bg-blue-600 text-white rounded">建立</button></div>
            </form>
          </div>
        </div>
      )}

      {taskToComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleCompleteTask} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-bold">完成待辦</h3>
            <p className="mb-4 text-sm text-slate-600">[{taskToComplete.projectName}] {taskToComplete.subject}</p>
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
            {completionError && <p role="alert" className="mt-3 text-sm text-red-600">{completionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTaskToComplete(null);
                  setCompletionError("");
                }}
                disabled={completingTask}
                className="rounded bg-slate-200 px-4 py-2 text-sm"
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
      )}
    </div>
  );
}
