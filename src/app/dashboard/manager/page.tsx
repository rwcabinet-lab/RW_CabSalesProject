"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Users, LayoutDashboard, CheckSquare, TrendingUp, Sparkles, AlertCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/stores/useToastStore";
import { formatTenThousands } from "@/lib/currency";
import { PROJECT_STAGE_LABELS, DEFAULT_PROJECT_COLUMNS } from "@/lib/constants";
import { isAssignableRole } from "@/lib/page-access";
import type { ApiResponse, AssignableUserDTO, ColumnItemDTO, ManagerDashboardDTO, TaskDTO } from "@/types/dto";
import {
  useManagerDashboardQuery,
  useUsersQuery,
  useSessionQuery,
  useColumnConfigQuery,
  QUERY_KEYS,
} from "@/hooks/useQueries";
import { ManagerAssignTaskModal } from "@/components/dashboard/ManagerAssignTaskModal";

const todayDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const EMPTY_OVERVIEW: ManagerDashboardDTO["allProjectsOverview"] = [];

const SalesWorkloadChart = dynamic(
  () => import("@/components/dashboard/ManagerCharts").then((mod) => mod.SalesWorkloadChart),
  {
    ssr: false,
    loading: () => <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />,
  }
);

const StageBottlenecksChart = dynamic(
  () => import("@/components/dashboard/ManagerCharts").then((mod) => mod.StageBottlenecksChart),
  {
    ssr: false,
    loading: () => <div className="h-64 bg-slate-50 animate-pulse rounded-xl" />,
  }
);

export default function ManagerDashboardPage() {
  const queryClient = useQueryClient();

  // 過濾條件：預設排除已流標與已立帳 (進行中)
  const [dateMode, setDateMode] = useState<"DATE" | "MONTH">("DATE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [stageFilter, setStageFilter] = useState("ACTIVE");
  const [businessFilter, setBusinessFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateSort, setDateSort] = useState<"NONE" | "ASC" | "DESC">("NONE");
  const [statusSort, setStatusSort] = useState<"NONE" | "URGENT_FIRST" | "NORMAL_FIRST">("NONE");

  // React Query 資料快取 (單一真實來源)
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = useManagerDashboardQuery(
    dateMode === "MONTH" ? startMonth : undefined,
    dateMode === "MONTH" ? endMonth : undefined,
    dateMode === "DATE" ? startDate : undefined,
    dateMode === "DATE" ? endDate : undefined,
  );
  const { data: users = [] } = useUsersQuery();
  const { data: sessionUser } = useSessionQuery();
  const { data: columnsData = DEFAULT_PROJECT_COLUMNS } = useColumnConfigQuery();

  const data = dashboardData ?? null;
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const assignableUsers = users.filter((u) => isAssignableRole(u.role)) as AssignableUserDTO[];
  const columns = columnsData;
  const isAdmin = sessionUser?.role === "ADMIN";
  const loading = dashboardLoading && !data;
  const loadError = dashboardError instanceof Error ? dashboardError.message : "";

  const invalidateManager = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard", "manager"] }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.workbench }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.viewsData }),
    ]);
  };

  // 任務指派
  const [assignModal, setAssignModal] = useState<{ open: boolean; projectId: string; projectName: string; taskId: string; userId: string; subject: string; priority: "HIGH" | "MEDIUM" | "LOW"; dueDate: string }>({
    open: false, projectId: "", projectName: "", taskId: "", userId: "", subject: "", priority: "MEDIUM", dueDate: todayDate()
  });

  const handleDeleteAssignedTask = async (task: TaskDTO) => {
    if (!window.confirm(`確定刪除已指派任務「${task.subject}」？`)) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      const result = await res.json() as ApiResponse<{ success: boolean }>;
      if (!res.ok) {
        toast.error(result.error || "刪除任務失敗");
        return;
      }
      queryClient.setQueryData<ManagerDashboardDTO>(
        QUERY_KEYS.managerDashboard(
          dateMode === "MONTH" ? startMonth : undefined,
          dateMode === "MONTH" ? endMonth : undefined,
          dateMode === "DATE" ? startDate : undefined,
          dateMode === "DATE" ? endDate : undefined,
        ),
        (current) =>
          current
            ? {
                ...current,
                assignedTasks: current.assignedTasks.filter((item) => item.id !== task.id),
              }
            : current
      );
      toast.success("已成功刪除該指派任務");
      void invalidateManager();
    } catch (err) {
      console.error("Failed to delete assigned task:", err);
      toast.error("刪除任務時發生錯誤，請稍後重試");
    }
  };

  const handleDeleteProject = async (project: ManagerDashboardDTO["allProjectsOverview"][number]) => {
    if (!window.confirm(`確定刪除案件「${project.projectName}」？\n此操作會一併刪除相關里程碑、待辦與報價資料，且無法復原。`)) return;
    setDeletingProjectId(project.id);
    try {
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id }),
      });
      const result = await res.json() as ApiResponse<{ success: boolean }>;
      if (!res.ok) throw new Error(result.error || "刪除案件失敗");
      queryClient.setQueryData<ManagerDashboardDTO>(
        QUERY_KEYS.managerDashboard(
          dateMode === "MONTH" ? startMonth : undefined,
          dateMode === "MONTH" ? endMonth : undefined,
          dateMode === "DATE" ? startDate : undefined,
          dateMode === "DATE" ? endDate : undefined,
        ),
        (current) =>
          current
            ? {
                ...current,
                allProjectsOverview: current.allProjectsOverview.filter((item) => item.id !== project.id),
                alertList: current.alertList.filter((item) => item.id !== project.id),
              }
            : current
      );
      void invalidateManager();
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.customers });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.managerCustomerStats });
      toast.success(`已成功刪除案件「${project.projectName}」`);
    } catch (error) {
      console.error("Failed to delete project:", error);
      toast.error(error instanceof Error ? error.message : "刪除案件時發生錯誤，請稍後重試");
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleTaskAssignedSuccess = (task: TaskDTO, isEditingTask: boolean) => {
    queryClient.setQueryData<ManagerDashboardDTO>(
      QUERY_KEYS.managerDashboard(
        dateMode === "MONTH" ? startMonth : undefined,
        dateMode === "MONTH" ? endMonth : undefined,
        dateMode === "DATE" ? startDate : undefined,
        dateMode === "DATE" ? endDate : undefined,
      ),
      (current) =>
        current
          ? {
              ...current,
              assignedTasks: isEditingTask
                ? current.assignedTasks.map((t) => (t.id === task.id ? task : t))
                : [task, ...current.assignedTasks],
            }
          : current
    );
    setAssignModal({ open: false, projectId: "", projectName: "", taskId: "", userId: "", subject: "", priority: "MEDIUM", dueDate: todayDate() });
    void invalidateManager();
  };

  // 預定完工日排序
  // 案場總覽過濾：預設排除已流標/請款
  const allProjectsOverview = data?.allProjectsOverview ?? EMPTY_OVERVIEW;

  const filteredOverview = useMemo(() => {
    return allProjectsOverview.filter((p) => {
      if (stageFilter === "ACTIVE") {
        if (p.currentStage === "LOST" || p.isClosed || p.currentStage === "BILLED" || p.currentStage === "CLOSED") return false;
      } else if (stageFilter === "BILLED" || stageFilter === "CLOSED") {
        if (!p.isClosed && p.currentStage !== "BILLED" && p.currentStage !== "CLOSED") return false;
      } else if (stageFilter && p.currentStage !== stageFilter) {
        return false;
      }
      if (businessFilter === "__UNASSIGNED__") {
        if (p.salesRepName && p.salesRepName !== "未指派") return false;
      } else if (businessFilter && p.salesRepName !== businessFilter) {
        return false;
      }
      const projectStatus = p.currentStage === "LOST" ? "LOST" : p.trafficLight.color;
      if (statusFilter && projectStatus !== statusFilter) return false;

      const projectDate = (p.expectedDate || "").slice(0, 10);
      const projectMonth = (p.expectedDate || "").slice(0, 7);

      if (dateMode === "DATE") {
        if (startDate && projectDate && projectDate < startDate) return false;
        if (endDate && projectDate && projectDate > endDate) return false;
        if ((startDate || endDate) && !projectDate) return false;
      } else {
        if (startMonth && projectMonth && projectMonth < startMonth) return false;
        if (endMonth && projectMonth && projectMonth > endMonth) return false;
        if ((startMonth || endMonth) && !projectMonth) return false;
      }
      return true;
    });
  }, [allProjectsOverview, stageFilter, businessFilter, statusFilter, dateMode, startDate, endDate, startMonth, endMonth]);

  // 依完工日與狀態排序
  const sortedOverview = useMemo(() => {
    return [...filteredOverview].sort((a, b) => {
      if (statusSort !== "NONE") {
        const getStatusWeight = (item: typeof a) => {
          if (item.currentStage === "LOST") return 5;
          if (item.trafficLight.color === "RED") return 1;
          if (item.trafficLight.color === "YELLOW") return 2;
          if (item.trafficLight.color === "GREEN") return 3;
          return 4;
        };
        const diff = getStatusWeight(a) - getStatusWeight(b);
        if (diff !== 0) {
          return statusSort === "URGENT_FIRST" ? diff : -diff;
        }
      }
      if (dateSort === "NONE") return 0;
      const dateA = a.expectedDate || "";
      const dateB = b.expectedDate || "";
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateSort === "ASC" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });
  }, [filteredOverview, statusSort, dateSort]);

  const toggleDateSort = () => {
    if (dateSort === "NONE") setDateSort("ASC");
    else if (dateSort === "ASC") setDateSort("DESC");
    else setDateSort("NONE");
  };

  const toggleStatusSort = () => {
    if (statusSort === "NONE") setStatusSort("URGENT_FIRST");
    else if (statusSort === "URGENT_FIRST") setStatusSort("NORMAL_FIRST");
    else setStatusSort("NONE");
  };

  const totalFilteredAmount = useMemo(() => {
    return sortedOverview.reduce(
      (sum, p) => sum + (p.quoteAmount || p.totalAmount || 0),
      0
    );
  }, [sortedOverview]);

  const businessOptions = useMemo(() => {
    return Array.from(new Set(allProjectsOverview.map((project) => project.salesRepName))).sort();
  }, [allProjectsOverview]);

  const visibleColumns = useMemo(() => {
    return [...columns].sort((a, b) => a.order - b.order).filter((c) => c.visible);
  }, [columns]);

  if (loading && !data) return <div className="p-16 text-center text-slate-500 font-semibold">載入主管監控室數據中...</div>;
  if (loadError && !data) return <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>;
  if (!data) return null;

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap justify-between items-center border-b pb-4 gap-4">
        <div>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">主管監控室</span>
          <h1 className="text-2xl font-black mt-1">營運總覽分析</h1>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          <div className="px-4 py-2 text-sm font-bold rounded-lg bg-white text-blue-600 shadow-sm">
            營運總覽分析
          </div>
          <Link
            href="/dashboard/manager/customers"
            className="px-4 py-2 text-sm font-bold rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
          >
            客戶資料統計
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-slate-500 text-xs font-bold mb-1">進行中總案場數</div>
          <div className="text-3xl font-black">{data.kpi.totalProjects}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-slate-500 text-xs font-bold mb-1">已簽約/生產預估總額</div>
          <div className="text-right text-3xl font-black tabular-nums">{formatTenThousands(data.kpi.signedTotal)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-slate-500 text-xs font-bold mb-1">成交率</div>
          <div className="text-3xl font-black">{data.kpi.conversionRate}%</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-center border-l-4 border-l-red-500">
          <div className="text-red-600 text-xs font-bold mb-1">逾期案件</div>
          <div className="text-3xl font-black text-red-600">{data.kpi.delayedCount}</div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b px-6 py-4 font-bold">
          <CheckSquare className="h-5 w-5 text-blue-600" />已指派任務
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">{data.assignedTasks.length}</span>
        </div>
        {data.assignedTasks.length ? (
          <div className="divide-y px-6">
            {data.assignedTasks.map((task) => (
              <article key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <h3 className="font-semibold">{task.subject}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {task.projectName || "未命名案場"}｜指派給：{task.assignedToName || "未知人員"}｜{task.isCompleted ? `已完成${task.completedAt ? `（${task.completedAt}）` : ""}` : "進行中"}｜優先度：{task.priority === "HIGH" ? "高" : task.priority === "LOW" ? "低" : "中"}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>預定完成：{task.dueDatetime.slice(0, 10)}</span>
                  <Link href={`/projects/${task.projectId}/milestones`} prefetch={true} className="rounded bg-slate-100 px-3 py-1.5 font-bold text-slate-700 hover:bg-blue-100 hover:text-blue-700">查看案件</Link>
                  <button type="button" onClick={() => handleDeleteAssignedTask(task)} className="rounded bg-red-100 px-3 py-1.5 font-bold text-red-700 hover:bg-red-200">刪除</button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="px-6 py-5 text-center text-sm text-slate-500">目前沒有已指派任務</p>}
      </section>

      {/* 圖表區塊 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              人員案場負載與異常分佈
            </h3>
            <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-blue-400 inline-block"></span> 藍外柱：總案場數
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-3.5 rounded bg-red-500 inline-block"></span> 紅內柱：延誤案場數
              </span>
            </div>
          </div>
          <div className="h-64">
            <SalesWorkloadChart data={data.salesWorkload} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 className="text-base font-bold flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            案件階段分佈與卡關瓶頸
          </h3>
          <div className="h-64">
            <StageBottlenecksChart data={data.stageBottlenecks} />
          </div>
        </div>
      </div>

      {/* 統一案件清單 (套用全域欄位設定) */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2"><LayoutDashboard className="w-5 h-5 text-blue-600"/> 所有案件狀態總覽</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <div className="flex items-center gap-1.5">
              <span>時間區間：</span>
              <select
                value={dateMode}
                onChange={(e) => {
                  setDateMode(e.target.value as "DATE" | "MONTH");
                  setStartDate("");
                  setEndDate("");
                  setStartMonth("");
                  setEndMonth("");
                }}
                className="border rounded px-1.5 py-0.5 text-xs bg-white text-slate-700 font-medium"
              >
                <option value="DATE">日期</option>
                <option value="MONTH">月份</option>
              </select>
              {dateMode === "DATE" ? (
                <>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border rounded px-2 py-1 text-xs"
                    title="起始日期"
                  />
                  <span className="text-slate-400">至</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border rounded px-2 py-1 text-xs"
                    title="結束日期"
                  />
                  {(startDate || endDate) && (
                    <button
                      type="button"
                      onClick={() => { setStartDate(""); setEndDate(""); }}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      ✕ 清除
                    </button>
                  )}
                </>
              ) : (
                <>
                  <input
                    type="month"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="border rounded px-2 py-1 text-xs"
                    title="起始月份"
                  />
                  <span className="text-slate-400">至</span>
                  <input
                    type="month"
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                    className="border rounded px-2 py-1 text-xs"
                    title="結束月份"
                  />
                  {(startMonth || endMonth) && (
                    <button
                      type="button"
                      onClick={() => { setStartMonth(""); setEndMonth(""); }}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      ✕ 清除
                    </button>
                  )}
                </>
              )}
            </div>
            <label className="flex items-center gap-2">
              狀態：
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-2 py-1">
                <option value="">全部狀態</option>
                <option value="RED">逾期</option>
                <option value="YELLOW">即將到期</option>
                <option value="GREEN">正常</option>
                <option value="GRAY">暫緩/未排定/已完成</option>
                <option value="LOST">已流標</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              業務：
              <select value={businessFilter} onChange={(e) => setBusinessFilter(e.target.value)} className="border rounded px-2 py-1">
                <option value="">全部業務</option>
                <option value="__UNASSIGNED__">未指定</option>
                {businessOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              階段：
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="border rounded px-2 py-1">
                <option value="ACTIVE">進行中案件 (預設，排除已流標/請款)</option>
                <option value="">全部階段</option>
                <option value="DEVELOP">第一階段：案件開發</option>
                <option value="REQUIREMENT">第二階段：現況及需求確認</option>
                <option value="PROPOSAL">第三階段：設計提案/報價/簽約</option>
                <option value="PRE_PROD">第四階段：生產前確認/拆單</option>
                <option value="PROD_SHIP">第五階段：生產及派送</option>
                <option value="INSTALL">第六階段：安裝及驗收</option>
                <option value="CLOSURE">第七階段：請款/售後</option>
                <option value="WRAP_UP">收尾中</option>
                <option value="LOST">已流標</option>
                <option value="BILLED">請款</option>
              </select>
            </label>
          </div>
        </div>

        {/* 篩選結果摘要 */}
        <div className="px-6 py-2.5 bg-blue-50/50 border-b flex justify-between items-center text-xs text-blue-900 font-semibold">
          <div>
            篩選結果：共 <span className="text-sm font-bold text-blue-700">{sortedOverview.length}</span> 案，報價總額{" "}
            <span className="text-sm font-bold text-blue-700">NT$ {totalFilteredAmount.toLocaleString()}</span>
          </div>
        </div>

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
                    ) : col.key === "trafficLight" ? (
                      <button
                        type="button"
                        onClick={toggleStatusSort}
                        className="inline-flex items-center gap-1 font-bold text-slate-700 hover:text-blue-600 focus:outline-none"
                      >
                        {col.label}
                        <span className="text-[11px] text-blue-600 font-black">
                          {statusSort === "URGENT_FIRST" ? "🔴🔼" : statusSort === "NORMAL_FIRST" ? "🟢🔽" : "↕️"}
                        </span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                <th className="p-3 text-center">指派任務</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedOverview.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  {visibleColumns.map((col) => {
                    switch (col.key) {
                      case "trafficLight":
                        return (
                          <td key={col.key} className="p-3">
                            <span className={`px-2 py-1 rounded-full font-bold ${
                              p.currentStage === "LOST" || p.trafficLight.color === "GRAY" ? "bg-slate-100 text-slate-600" :
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
                            {p.siteAddress && <div className="text-[10px] text-slate-500 font-normal">{p.siteAddress}</div>}
                          </td>
                        );
                      case "customer":
                        return (
                          <td key={col.key} className="p-3">
                            {p.customerName}{" "}
                            {p.defaultDiscount && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-semibold">
                                {p.defaultDiscount === 1 ? "牌價" : `${(p.defaultDiscount * 10).toFixed(1)}折`}
                              </span>
                            )}
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
                            {p.isClosed ? "請款" : (PROJECT_STAGE_LABELS[p.currentStage] || p.currentStage)}
                            <div className="mt-1 text-[10px] font-normal text-slate-500">
                              {p.currentStage === "LOST" ? p.currentStageLabel : p.activeMilestoneName || p.lastCompletedMilestoneName || "—"}
                            </div>
                            {p.unassignedNextMilestoneName && (
                              <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                                <AlertCircle className="h-3 w-3" />
                                下一項「{p.unassignedNextMilestoneName}」待指派
                              </div>
                            )}
                          </td>
                        );
                      case "quoteAndUnits":
                      case "amount":
                        return (
                          <td key={col.key} className="p-3">
                            <div className="tabular-nums font-bold text-slate-900">
                              {formatTenThousands(p.quoteAmount ?? p.totalAmount ?? 0)}
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
                            {p.expectedDate?.slice(0, 10) || "-"}
                          </td>
                        );
                      case "actions":
                        return (
                          <td key={col.key} className="p-3 text-center">
                            <Link
                              href={`/projects/${p.id}/milestones`}
                              prefetch={true}
                              className="inline-flex h-7 items-center justify-center rounded bg-slate-100 px-2.5 text-xs font-bold text-slate-700 hover:bg-blue-100 hover:text-blue-700"
                            >
                              案件細節
                            </Link>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteProject(p)}
                                disabled={deletingProjectId !== null}
                                className="ml-2 inline-flex h-7 items-center justify-center gap-1 rounded bg-red-100 px-2 text-xs font-bold text-red-700 hover:bg-red-200"
                              >
                                <Trash2 className="h-3.5 w-3.5" />刪除
                              </button>
                            )}
                          </td>
                        );
                      default:
                        return null;
                    }
                  })}
                  <td className="p-3 text-center">
                    <button
                      onClick={() => setAssignModal({
                        open: true,
                        projectId: p.id,
                        projectName: p.projectName,
                        taskId: "",
                        userId: "",
                        subject: "",
                        priority: "MEDIUM",
                        dueDate: todayDate(),
                      })}
                      className="inline-flex h-7 items-center justify-center rounded bg-blue-600 px-2.5 text-xs font-bold text-white shadow hover:bg-blue-700"
                    >
                      指派任務
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 指派任務 Modal (獨立封裝元件) */}
      {assignModal.open && (
        <ManagerAssignTaskModal
          modalData={assignModal}
          assignableUsers={assignableUsers}
          onClose={() => setAssignModal((prev) => ({ ...prev, open: false }))}
          onSuccess={handleTaskAssignedSuccess}
        />
      )}
    </div>
  );
}
