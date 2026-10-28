"use client";

import { useState, useMemo, Fragment } from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import { PROJECT_STAGE_LABELS, DEFAULT_PROJECT_COLUMNS } from "@/lib/constants";
import { isAssignableRole } from "@/lib/page-access";
import { formatTenThousands } from "@/lib/currency";
import type {
  ApiResponse,
  TaskDTO,
  WorkbenchDashboardDTO,
  WorkbenchProjectDTO,
} from "@/types/dto";
import { useWorkbenchQuery, useCustomersQuery, useUsersQuery, useColumnConfigQuery, QUERY_KEYS } from "@/hooks/useQueries";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { useShallow } from "zustand/react/shallow";
import { WorkbenchCreateTaskModal, WorkbenchCompleteTaskModal } from "@/components/workbench/WorkbenchModals";
import { WorkbenchAddProjectPanel, WorkbenchEditProjectRow } from "@/components/workbench/WorkbenchProjectForms";
import { toast } from "@/stores/useToastStore";

const EMPTY_PROJECTS: WorkbenchProjectDTO[] = [];
const EMPTY_TASKS: TaskDTO[] = [];
const DEFAULT_USER = { id: "", name: "使用者", role: "SALES" };

export default function SalesWorkbenchPage() {
  const queryClient = useQueryClient();
  const { data: workbenchData, isLoading: workbenchLoading } = useWorkbenchQuery();
  const { data: customers = [] } = useCustomersQuery();
  const { data: users = [] } = useUsersQuery();
  const { data: columnConfig = DEFAULT_PROJECT_COLUMNS } = useColumnConfigQuery();

  const selectableUsers = useMemo(
    () => users.filter((u) => isAssignableRole(u.role)),
    [users]
  );

  // Zustand Store 狀態 (篩選、排序、表單暫存與對話框控制 - 使用細粒度 Selector 避免多餘 Re-render)
  const {
    startMonth,
    endMonth,
    statusFilter,
    stageFilter,
    dateSort,
    statusSort,
    isProjectPanelOpen,
    editingProjectId,
  } = useWorkbenchStore(
    useShallow((s) => ({
      startMonth: s.startMonth,
      endMonth: s.endMonth,
      statusFilter: s.statusFilter,
      stageFilter: s.stageFilter,
      dateSort: s.dateSort,
      statusSort: s.statusSort,
      isProjectPanelOpen: s.isProjectPanelOpen,
      editingProjectId: s.editingProjectId,
    }))
  );

  const setStartMonth = useWorkbenchStore((s) => s.setStartMonth);
  const setEndMonth = useWorkbenchStore((s) => s.setEndMonth);
  const setStatusFilter = useWorkbenchStore((s) => s.setStatusFilter);
  const setStageFilter = useWorkbenchStore((s) => s.setStageFilter);
  const toggleDateSort = useWorkbenchStore((s) => s.toggleDateSort);
  const toggleStatusSort = useWorkbenchStore((s) => s.toggleStatusSort);
  const setProjectPanelOpen = useWorkbenchStore((s) => s.setProjectPanelOpen);
  const openAddProject = useWorkbenchStore((s) => s.openAddProject);
  const openEditProject = useWorkbenchStore((s) => s.openEditProject);
  const closeEditProject = useWorkbenchStore((s) => s.closeEditProject);
  const setShowTaskModal = useWorkbenchStore((s) => s.setShowTaskModal);
  const setTaskToComplete = useWorkbenchStore((s) => s.setTaskToComplete);

  // 伺服端狀態單一真實來源 (Single Source of Truth from TanStack Query)
  const projects = workbenchData?.myProjects ?? EMPTY_PROJECTS;
  const tasks = workbenchData?.tasks ?? EMPTY_TASKS;
  const currentUser = workbenchData?.currentUser ?? DEFAULT_USER;
  const loading = workbenchLoading && !workbenchData;
  const columns = columnConfig;

  const invalidateWorkbench = async (options?: { includeViews?: boolean }) => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.workbench });
    if (options?.includeViews) {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.viewsData, refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "manager"], refetchType: "none" });
    }
  };

  // 預定完工日與狀態排序
  // 過濾邏輯：預設排除已流標/結案 (stageFilter === "ACTIVE")
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      let match = true;
      if (stageFilter === "ACTIVE") {
        if (p.currentStage === "LOST" || p.isClosed) match = false;
      } else if (stageFilter === "CLOSED") {
        if (!p.isClosed && p.currentStage !== "CLOSED") match = false;
      } else if (stageFilter) {
        if (p.currentStage !== stageFilter) match = false;
      }
      const projectStatus = p.currentStage === "LOST" ? "LOST" : p.trafficLight.color;
      if (statusFilter && projectStatus !== statusFilter) match = false;

      const dateToCheck = p.activeMilestone?.plannedDueDate || p.expectedDate || "";
      const projectMonth = dateToCheck.slice(0, 7);
      if (startMonth && projectMonth && projectMonth < startMonth) match = false;
      if (endMonth && projectMonth && projectMonth > endMonth) match = false;
      if ((startMonth || endMonth) && !projectMonth) match = false;
      return match;
    });
  }, [projects, stageFilter, statusFilter, startMonth, endMonth]);

  // 依完工日與狀態排序
  const sortedProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
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
  }, [filteredProjects, statusSort, dateSort]);

  const totalFilteredAmount = useMemo(() => {
    return sortedProjects.reduce(
      (sum, p) => sum + (p.quoteAmount || p.totalAmount || 0),
      0
    );
  }, [sortedProjects]);

  const pendingTasks = useMemo(() => {
    return tasks.filter((task) => !task.isCompleted);
  }, [tasks]);

  const isAdmin = currentUser.role === "ADMIN";
  const visibleTasks = isAdmin ? tasks : pendingTasks;
  const canDeleteTask = (task: TaskDTO) =>
    isAdmin || task.assignedById === currentUser.id || task.assignedToId === currentUser.id;

  const handleDeleteTask = async (task: TaskDTO) => {
    if (!window.confirm(`確定刪除待辦「${task.subject}」？`)) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      const result = (await res.json()) as ApiResponse<{ success: boolean }>;
      if (!res.ok) {
        toast.error(result.error || "刪除待辦失敗");
        return;
      }
      queryClient.setQueryData<WorkbenchDashboardDTO>(QUERY_KEYS.workbench, (old) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.filter((item) => item.id !== task.id),
        };
      });
      toast.success("已成功刪除該待辦事項");
      void invalidateWorkbench({ includeViews: true });
    } catch (err) {
      console.error("Failed to delete task:", err);
      toast.error("刪除待辦時發生錯誤，請稍後重試");
    }
  };

  const handleDeleteProject = async (project: WorkbenchProjectDTO) => {
    if (
      !window.confirm(
        `確定刪除案件「${project.projectName}」？\n此操作會一併刪除相關里程碑、待辦與報價資料，且無法復原。`
      )
    )
      return;
    try {
      const res = await fetch("/api/projects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id }),
      });
      const result = (await res.json()) as ApiResponse<{ success: boolean }>;
      if (!res.ok) {
        toast.error(result.error || "刪除案件失敗");
        return;
      }
      queryClient.setQueryData<WorkbenchDashboardDTO>(QUERY_KEYS.workbench, (old) => {
        if (!old) return old;
        return {
          ...old,
          myProjects: old.myProjects.filter((item) => item.id !== project.id),
        };
      });
      toast.success(`已成功刪除案件「${project.projectName}」`);
      void invalidateWorkbench({ includeViews: true });
    } catch (err) {
      console.error("Failed to delete project:", err);
      toast.error("刪除案件時發生錯誤，請稍後重試");
    }
  };

  const visibleColumns = useMemo(() => {
    return [...columns].sort((a, b) => a.order - b.order).filter((c) => c.visible);
  }, [columns]);

  if (loading) return <div className="p-16 text-center text-slate-500 font-semibold">正在載入業務工作台...</div>;

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
          <h2 className="text-base font-bold flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" /> 待辦事項
          </h2>
          <button
            onClick={() => setShowTaskModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> 建立待辦
          </button>
        </div>
        {visibleTasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-3">待辦事項</th>
                  <th className="p-3">預定完成日</th>
                  <th className="p-3">優先</th>
                  <th className="p-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleTasks.map((task) => {
                  const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
                    .toISOString()
                    .slice(0, 10);
                  const isOverdue =
                    !task.isCompleted && task.dueDatetime && task.dueDatetime.slice(0, 10) < todayStr;

                  return (
                    <tr
                      key={task.id}
                      className={isOverdue ? "bg-red-50/80 hover:bg-red-100/70" : "hover:bg-slate-50"}
                    >
                      <td className="p-3 font-bold">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className={isOverdue ? "text-red-900" : ""}>
                            [{task.projectName}] {task.subject}
                          </span>
                          {task.isCompleted && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              已完成
                            </span>
                          )}
                          {isOverdue && (
                            <span className="rounded bg-red-100 border border-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-700 animate-pulse">
                              已逾期
                            </span>
                          )}
                        </div>
                        {task.assignedByName && (
                          <div className="mt-1 text-[10px] font-normal text-slate-500">
                            建立者/指派者：{task.assignedByName}
                          </div>
                        )}
                      </td>
                      <td className={`p-3 font-medium ${isOverdue ? "text-red-600 font-bold" : ""}`}>
                        {task.dueDatetime.slice(0, 10)}
                      </td>
                      <td className="p-3">{task.priority}</td>
                      <td className="p-3 text-center">
                        {!task.isCompleted && (
                          <button
                            type="button"
                            onClick={() => {
                              setTaskToComplete(task);
                            }}
                            className="mx-auto flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-4 w-4" /> 完成
                          </button>
                        )}
                        {canDeleteTask(task) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task)}
                            className="mx-auto mt-1 flex items-center gap-1 rounded bg-red-100 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-200"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> 刪除
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">
            {isAdmin ? "目前沒有待辦事項" : "目前沒有待處理事項"}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" /> 案件清單
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const firstCust = customers[0];
                const defaultRepId = selectableUsers.some((u) => u.id === firstCust?.salesRepId)
                  ? firstCust.salesRepId
                  : selectableUsers[0]?.id || "";
                openAddProject(firstCust?.id || "", defaultRepId);
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" /> 新增案場
            </button>
          </div>
        </div>

        <div className="bg-white p-4 border-b flex flex-wrap gap-4 bg-slate-50/50">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <span>月份：</span>
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
            <span className="text-slate-400">至</span>
            <input
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            />
            {(startMonth || endMonth) && (
              <button
                type="button"
                onClick={() => {
                  setStartMonth("");
                  setEndMonth("");
                }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ✕ 清除
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            狀態：
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            >
              <option value="">全部狀態</option>
              <option value="RED">逾期</option>
              <option value="YELLOW">即將到期</option>
              <option value="GREEN">正常</option>
              <option value="GRAY">暫緩/未排定/已完成</option>
              <option value="LOST">已流標</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            階段：
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            >
              <option value="ACTIVE">進行中案件 (預設，排除已流標/結案)</option>
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
              <option value="CLOSED">結案</option>
            </select>
          </label>
        </div>

        {/* 篩選結果摘要 */}
        <div className="px-6 py-2.5 bg-blue-50/50 border-b flex justify-between items-center text-xs text-blue-900 font-semibold">
          <div>
            篩選結果：共 <span className="text-sm font-bold text-blue-700">{sortedProjects.length}</span> 案，報價總額{" "}
            <span className="text-sm font-bold text-blue-700">NT$ {totalFilteredAmount.toLocaleString()}</span>
          </div>
        </div>

        {isProjectPanelOpen && !editingProjectId && (
          <WorkbenchAddProjectPanel
            customers={customers}
            selectableUsers={selectableUsers}
            onInvalidate={invalidateWorkbench}
          />
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
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedProjects.map((p) => (
                <Fragment key={p.id}>
                  <tr
                    className={`hover:brightness-95 ${
                      editingProjectId === p.id
                        ? "bg-emerald-50/70 ring-1 ring-emerald-500"
                        : p.currentStage === "LOST"
                        ? "bg-slate-50/80 opacity-75"
                        : p.currentStage === "WRAP_UP"
                        ? "bg-amber-50/50"
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
                              <span
                                className={`px-2 py-1 rounded-full font-bold ${
                                  p.currentStage === "LOST" || p.trafficLight.color === "GRAY"
                                    ? "bg-slate-100 text-slate-600"
                                    : p.trafficLight.color === "RED"
                                    ? "bg-red-100 text-red-700"
                                    : p.trafficLight.color === "YELLOW"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
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
                  {editingProjectId === p.id && (
                    <WorkbenchEditProjectRow
                      projectId={p.id}
                      projectName={p.projectName}
                      colSpan={visibleColumns.length}
                      customers={customers}
                      selectableUsers={selectableUsers}
                      onInvalidate={invalidateWorkbench}
                    />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WorkbenchCreateTaskModal
        currentUserId={currentUser.id}
        projects={projects}
        onInvalidate={invalidateWorkbench}
      />

      <WorkbenchCompleteTaskModal onInvalidate={invalidateWorkbench} />
    </div>
  );
}
