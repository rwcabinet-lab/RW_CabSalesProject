"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Clock,
  Plus,
  Edit3,
  CheckCircle2,
  X,
  Trash2,
} from "lucide-react";
import { PROJECT_STAGE_LABELS, DEFAULT_PROJECT_COLUMNS } from "@/lib/mock-data";
import { formatTenThousands, fromTenThousands, toTenThousands } from "@/lib/currency";
import type {
  ApiResponse,
  ColumnItemDTO,
  CustomerDTO,
  TaskDTO,
  WorkbenchDashboardDTO,
  WorkbenchProjectDTO,
} from "@/types/dto";

const getDefaultTaskDueDatetime = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function SalesWorkbenchPage() {
  const [projects, setProjects] = useState<WorkbenchProjectDTO[]>([]);
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [currentUser, setCurrentUser] = useState({ id: "", name: "使用者", role: "SALES" });
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [columns, setColumns] = useState<ColumnItemDTO[]>(DEFAULT_PROJECT_COLUMNS);

  // 篩選條件：預設排除已流標與已立帳 (進行中)
  const [monthFilter, setMonthFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("ACTIVE"); // 預設 ACTIVE 進行中 (排除 LOST / BILLED)
  const [dateSort, setDateSort] = useState<"NONE" | "ASC" | "DESC">("NONE");

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
  const [newTaskData, setNewTaskData] = useState({ projectId: "", subject: "", taskType: "SITE_VISIT", dueDatetime: getDefaultTaskDueDatetime(), priority: "HIGH" });
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<TaskDTO | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionDate, setCompletionDate] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  );
  const [completingTask, setCompletingTask] = useState(false);
  const [completionError, setCompletionError] = useState("");

  useEffect(() => {
    // 平行載入資料，消除等待時間
    Promise.all([fetchWorkbenchData(), fetchCustomers(), fetchColumnConfig()]);
  }, []);

  const fetchColumnConfig = async () => {
    try {
      const res = await fetch("/api/projects/config/columns", { cache: "no-store" });
      const data = await res.json() as ApiResponse<{ columns: ColumnItemDTO[] }>;
      if (!res.ok || !Array.isArray(data.columns)) {
        throw new Error(data.error || "無法取得全域案件欄位設定");
      }
      setColumns(data.columns);
    } catch (error) {
      console.error("Failed to fetch shared project columns:", error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch("/api/customers");
      const data = await res.json() as ApiResponse<CustomerDTO[]>;
      if (Array.isArray(data)) setCustomers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWorkbenchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard/workbench");
      const json = await res.json() as ApiResponse<WorkbenchDashboardDTO>;
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

    const completedAt = completionDate || new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    setCompletingTask(true);
    setCompletionError("");
    setTasks((current) => current.map((task) =>
      task.id === taskToComplete.id
        ? { ...task, isCompleted: true, resultNotes: completionNotes.trim(), completedAt }
        : task
    ));
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
      const result = await res.json() as ApiResponse<{ success: boolean; task: TaskDTO }>;
      if (!res.ok) {
        setCompletionError(result.error || "完成待辦失敗，請稍後再試");
        setTasks((current) => current.map((task) =>
          task.id === taskToComplete.id
            ? { ...task, isCompleted: false, resultNotes: task.resultNotes, completedAt: task.completedAt }
            : task
        ));
        return;
      }

      setTaskToComplete(null);
      setCompletionNotes("");
    } catch (err) {
      console.error("Failed to complete task:", err);
      setTasks((current) => current.map((task) =>
        task.id === taskToComplete.id
          ? { ...task, isCompleted: false, resultNotes: task.resultNotes, completedAt: task.completedAt }
          : task
      ));
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
        body: JSON.stringify({
          ...newTaskData,
          dueDatetime: new Date(newTaskData.dueDatetime).toISOString(),
          assignedToId: currentUser.id,
        }),
      });
      if (res.ok) {
        setShowTaskModal(false);
        setNewTaskData({ projectId: "", subject: "", taskType: "SITE_VISIT", dueDatetime: getDefaultTaskDueDatetime(), priority: "HIGH" });
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
        cost: newProjectData.cost ? fromTenThousands(Number(newProjectData.cost)) : undefined,
        quoteAmount: newProjectData.quoteAmount ? fromTenThousands(Number(newProjectData.quoteAmount)) : undefined,
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

  const openEditProject = (p: WorkbenchProjectDTO) => {
    setEditingProjectId(p.id);
    setNewProjectData({
      projectName: p.projectName, customerId: p.customerId, siteAddress: p.siteAddress, siteCondition: p.siteCondition,
      expectedDate: p.expectedDate ? p.expectedDate.slice(0,10) : "",
      unitCount: p.unitCount?.toString() || "",
      cost: p.cost != null ? toTenThousands(p.cost).toFixed(1) : "",
      quoteAmount: p.quoteAmount != null ? toTenThousands(p.quoteAmount).toFixed(1) : "",
    });
    setIsProjectPanelOpen(true);
  };

  if (loading) return <div className="p-16 text-center text-slate-500 font-semibold">正在載入業務工作台...</div>;

  // 預定完工日排序
  // 過濾邏輯：預設排除已流標/已立帳 (stageFilter === "ACTIVE")
  const filteredProjects = projects.filter((p) => {
    let match = true;
    if (stageFilter === "ACTIVE") {
      if (p.currentStage === "LOST" || p.currentStage === "BILLED") match = false;
    } else if (stageFilter) {
      if (p.currentStage !== stageFilter) match = false;
    }
    if (monthFilter) {
      const dateToCheck = p.activeMilestone?.plannedDueDate || p.expectedDate || "";
      if (!dateToCheck.startsWith(monthFilter)) match = false;
    }
    return match;
  });

  // 依完工日排序
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (dateSort === "NONE") return 0;
    const dateA = a.expectedDate || "";
    const dateB = b.expectedDate || "";
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateSort === "ASC" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
  });

  const toggleDateSort = () => {
    if (dateSort === "NONE") setDateSort("ASC");
    else if (dateSort === "ASC") setDateSort("DESC");
    else setDateSort("NONE");
  };

  const pendingTasks = tasks.filter((task) => !task.isCompleted);
  const isAdmin = currentUser.role === "ADMIN";
  const visibleTasks = isAdmin ? tasks : pendingTasks;
  const canDeleteTask = (task: TaskDTO) => isAdmin || task.assignedById === currentUser.id || task.assignedToId === currentUser.id;

  const handleDeleteTask = async (task: TaskDTO) => {
    if (!window.confirm(`確定刪除待辦「${task.subject}」？`)) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      const result = await res.json() as ApiResponse<{ success: boolean }>;
      if (!res.ok) {
        window.alert(result.error || "刪除待辦失敗");
        return;
      }
      await fetchWorkbenchData();
    } catch (err) {
      console.error("Failed to delete task:", err);
      window.alert("刪除待辦時發生錯誤，請稍後重試");
    }
  };

  const handleDeleteProject = async (project: WorkbenchProjectDTO) => {
    if (!window.confirm(`確定刪除案件「${project.projectName}」？\n此操作會一併刪除相關里程碑、待辦與報價資料，且無法復原。`)) return;
    try {
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id }),
      });
      const result = await res.json() as ApiResponse<{ success: boolean }>;
      if (!res.ok) {
        window.alert(result.error || "刪除案件失敗");
        return;
      }
      await fetchWorkbenchData();
    } catch (err) {
      console.error("Failed to delete project:", err);
      window.alert("刪除案件時發生錯誤，請稍後重試");
    }
  };

  const visibleColumns = [...columns].sort((a, b) => a.order - b.order).filter((c) => c.visible);

  return (
    <div className="space-y-8 pb-16">
      <div className="flex justify-between border-b pb-4">
        <div>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">業務工作台</span>
          <h1 className="text-2xl font-black mt-1">案件列表</h1>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2"><CheckSquare className="w-5 h-5 text-blue-600" /> 待辦事項</h2>
          <button onClick={() => setShowTaskModal(true)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="w-4 h-4"/> 建立待辦</button>
        </div>
        {visibleTasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-3">待辦事項</th><th className="p-3">預定完成日</th><th className="p-3">優先</th><th className="p-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold">
                      [{task.projectName}] {task.subject}
                      {task.isCompleted && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">已完成</span>}
                      {task.assignedByName && <div className="mt-1 text-[10px] font-normal text-slate-500">建立者/指派者：{task.assignedByName}</div>}
                    </td>
                    <td className="p-3">{task.dueDatetime.slice(0, 10)}</td>
                    <td className="p-3">{task.priority}</td>
                    <td className="p-3 text-center">
                      {!task.isCompleted && (
                        <button
                          type="button"
                          onClick={() => {
                            setTaskToComplete(task);
                            setCompletionNotes("");
                            setCompletionDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
                            setCompletionError("");
                          }}
                          className="mx-auto flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-4 w-4" /> 完成
                        </button>
                      )}
                      {canDeleteTask(task) && (
                        <button type="button" onClick={() => handleDeleteTask(task)} className="mx-auto mt-1 flex items-center gap-1 rounded bg-red-100 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-200">
                          <Trash2 className="h-3.5 w-3.5" /> 刪除
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-6 text-center text-sm text-slate-500">{isAdmin ? "目前沒有待辦事項" : "目前沒有待處理事項"}</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-blue-600"/> 案件清單</h2>
          <div className="flex items-center gap-3">
            <button onClick={openAddProject} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="w-4 h-4"/> 新增案場</button>
          </div>
        </div>

        <div className="bg-white p-4 border-b flex flex-wrap gap-4 bg-slate-50/50">
          <label className="flex items-center gap-2 text-sm font-semibold">
            月份：<input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="border rounded px-2 py-1" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            階段：
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="border rounded px-2 py-1">
              <option value="ACTIVE">進行中案件 (預設，排除已流標/已立帳)</option>
              <option value="">全部案件</option>
              <option value="DEVELOP">第一階段：案件開發</option>
              <option value="REQUIREMENT">第二階段：現況及需求確認</option>
              <option value="PROPOSAL">第三階段：設計提案/報價/簽約</option>
              <option value="PRE_PROD">第四階段：生產前確認/拆單</option>
              <option value="PROD_SHIP">第五階段：生產及派送</option>
              <option value="INSTALL">第六階段：安裝及驗收</option>
              <option value="CLOSURE">第七階段：結案/售後</option>
              <option value="WRAP_UP">收尾中</option>
              <option value="LOST">已流標</option>
              <option value="BILLED">已立帳</option>
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
              <label>成本金額（萬）<input type="number" step="0.1" value={newProjectData.cost} onChange={(e) => setNewProjectData({...newProjectData, cost: e.target.value})} className="mt-1 w-full border rounded p-1.5 text-right tabular-nums"/></label>
              <label>報價（萬）<input type="number" step="0.1" value={newProjectData.quoteAmount} onChange={(e) => setNewProjectData({...newProjectData, quoteAmount: e.target.value})} className="mt-1 w-full border rounded p-1.5 text-right tabular-nums"/></label>
              <label>預計完工日<input type="date" value={newProjectData.expectedDate} onChange={(e) => setNewProjectData({...newProjectData, expectedDate: e.target.value})} className="w-full border rounded p-1.5 mt-1"/></label>
              <div className="flex items-end"><button disabled={savingProject || !newProjectData.projectName} className="w-full bg-emerald-600 text-white rounded p-1.5 font-bold">{savingProject ? "儲存中" : "儲存案場"}</button></div>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col.key} className={`p-3 ${col.key === "actions" ? "text-center" : ""}`}>
                    {col.key === "expectedDate" ? (
                      <button
                        type="button"
                        onClick={toggleDateSort}
                        className="inline-flex items-center gap-1 font-bold text-slate-700 hover:text-blue-600 focus:outline-none"
                      >
                        {col.label}
                        <span className="text-[11px] text-blue-600 font-black">
                          {dateSort === "ASC" ? "🔼" : dateSort === "DESC" ? "🔽" : "↕️"}
                        </span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedProjects.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:brightness-95 ${
                    p.currentStage === "LOST" || p.currentStage === "WRAP_UP"
                      ? "bg-red-50/50"
                      : ["INSTALL", "CLOSURE", "CLOSED", "BILLED", "DONE"].includes(p.currentStage)
                        ? "bg-emerald-50/40"
                        : ["PROPOSAL", "PRE_PROD", "PROD_SHIP"].includes(p.currentStage)
                          ? "bg-blue-50/40"
                          : "bg-amber-50/40"
                  }`}
                >
                  {visibleColumns.map((col) => {
                    switch (col.key) {
                      case "trafficLight":
                        return (
                          <td key={col.key} className="p-3">
                            <span className={`px-2 py-1 rounded-full font-bold ${
                              p.trafficLight.color === "RED" ? "bg-red-100 text-red-700" :
                              p.trafficLight.color === "YELLOW" ? "bg-amber-100 text-amber-700" :
                              "bg-emerald-100 text-emerald-700"
                            }`}>
                              ● {p.trafficLight.label}
                            </span>
                          </td>
                        );
                      case "projectName":
                        return (
                          <td key={col.key} className="p-3 font-bold">
                            {p.projectName}
                            <div className="text-[10px] text-slate-500 font-normal">{p.siteAddress}</div>
                          </td>
                        );
                      case "customer":
                        return (
                          <td key={col.key} className="p-3">
                            {p.customerName}{" "}
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-semibold">
                              {p.defaultDiscount === 1 ? "牌價" : `${((p.defaultDiscount || 1) * 10).toFixed(1)}折`}
                            </span>
                          </td>
                        );
                      case "salesRep":
                        return (
                          <td key={col.key} className="p-3 text-slate-700 font-medium">
                            {p.salesRepName || "-"} {p.salesAssistantName ? ` / ${p.salesAssistantName}` : ""}
                          </td>
                        );
                      case "stageProgress":
                        return (
                          <td key={col.key} className="p-3 font-bold text-slate-700">
                            {PROJECT_STAGE_LABELS[p.currentStage] || p.currentStage}
                            <div className="mt-1 text-[10px] font-normal text-slate-500">
                              {p.currentStage === "LOST" ? "—" : p.activeMilestone?.stageName || "完結"}
                            </div>
                          </td>
                        );
                      case "quoteAndUnits":
                      case "amount":
                        return (
                          <td key={col.key} className="p-3">
                            <div className="tabular-nums font-bold text-slate-900">
                              {formatTenThousands(p.totalAmount ?? p.quoteAmount ?? 0)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {p.unitCount ? `${p.unitCount} 戶` : "未填戶數"}
                            </div>
                          </td>
                        );
                      case "unitCount":
                        return null;
                      case "expectedDate":
                        return (
                          <td key={col.key} className="p-3 text-slate-600 font-medium">
                            {p.expectedDate?.slice(0, 10) || "未設定"}
                          </td>
                        );
                      case "actions":
                        return (
                          <td key={col.key} className="p-3 flex gap-2 justify-center">
                            <button
                              onClick={() => openEditProject(p)}
                              className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-semibold"
                            >
                              編輯
                            </button>
                            <Link
                              href={`/projects/${p.id}/milestones`}
                              prefetch={true}
                              className="bg-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-semibold hover:bg-blue-100 hover:text-blue-700"
                            >
                              案件細節
                            </Link>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteProject(p)}
                                className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-semibold"
                              >
                                刪除
                              </button>
                            )}
                          </td>
                        );
                      default:
                        return null;
                    }
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white p-6 rounded-xl w-96 shadow-2xl">
            <h3 className="font-bold mb-4">新增待辦</h3>
            <form onSubmit={handleCreateTask} className="space-y-3 text-sm">
              <label className="block font-semibold">關聯案場<select required value={newTaskData.projectId} onChange={e=>setNewTaskData({...newTaskData, projectId: e.target.value})} className="w-full border p-1.5 mt-1 rounded"><option value="">選擇</option>{projects.map(p=><option key={p.id} value={p.id}>{p.projectName}</option>)}</select></label>
              <label className="block font-semibold">主題<input required value={newTaskData.subject} onChange={e=>setNewTaskData({...newTaskData, subject: e.target.value})} className="w-full border p-1.5 mt-1 rounded"/></label>
              <label className="block font-semibold">預計完成時間<input required type="datetime-local" value={newTaskData.dueDatetime} onChange={e=>setNewTaskData({...newTaskData, dueDatetime: e.target.value})} className="w-full border p-1.5 mt-1 rounded"/></label>
              <label className="block font-semibold">優先度
                <select value={newTaskData.priority} onChange={e=>setNewTaskData({...newTaskData, priority: e.target.value})} className="w-full border p-1.5 mt-1 rounded">
                  <option value="HIGH">高</option>
                  <option value="MEDIUM">中</option>
                  <option value="LOW">低</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={()=>setShowTaskModal(false)} className="px-3 py-1 bg-slate-200 rounded font-bold">取消</button><button disabled={creatingTask} className="px-3 py-1 bg-blue-600 text-white rounded font-bold">建立</button></div>
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
      )}
    </div>
  );
}
