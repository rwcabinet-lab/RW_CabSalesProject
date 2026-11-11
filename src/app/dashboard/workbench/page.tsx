"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Clock,
  Plus,
  Edit3,
  CheckCircle2,
  X,
  Search,
  RefreshCw,
  Pin,
  RotateCcw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PROJECT_STAGE_LABELS, DEFAULT_PROJECT_COLUMNS } from "@/lib/constants";
import { isAssignableRole } from "@/lib/page-access";
import { formatNTD } from "@/lib/currency";
import { getTaskScheduleStatus } from "@/lib/schedule-engine";
import type {
  ApiResponse,
  TaskDTO,
  WorkbenchDashboardDTO,
  WorkbenchProjectDTO,
} from "@/types/dto";
import { useWorkbenchQuery, useCustomersQuery, useUsersQuery, useColumnConfigQuery, QUERY_KEYS } from "@/hooks/useQueries";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { useShallow } from "zustand/react/shallow";
import {
  WorkbenchCreateTaskModal,
  WorkbenchCompleteTaskModal,
  WorkbenchAdvanceMilestoneModal,
} from "@/components/workbench/WorkbenchModals";
import { WorkbenchAddProjectPanel, WorkbenchEditProjectRow } from "@/components/workbench/WorkbenchProjectForms";
import { SectionHelpButton } from "@/components/common/SectionHelpButton";
import { usePinnedProjects, sortProjectsWithPins } from "@/hooks/usePinnedProjects";
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
    searchQuery,
    statusFilter,
    stageFilter,
    dateSort,
    statusSort,
    isProjectPanelOpen,
    editingProjectId,
  } = useWorkbenchStore(
    useShallow((s) => ({
      searchQuery: s.searchQuery,
      statusFilter: s.statusFilter,
      stageFilter: s.stageFilter,
      dateSort: s.dateSort,
      statusSort: s.statusSort,
      isProjectPanelOpen: s.isProjectPanelOpen,
      editingProjectId: s.editingProjectId,
    }))
  );

  const setSearchQuery = useWorkbenchStore((s) => s.setSearchQuery);
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
  const setProjectToAdvance = useWorkbenchStore((s) => s.setProjectToAdvance);
  const resetFilters = useWorkbenchStore((s) => s.resetFilters);
  const initFromStorage = useWorkbenchStore((s) => s.initFromStorage);

  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  // 伺服端狀態單一真實來源 (Single Source of Truth from TanStack Query)
  const projects = workbenchData?.myProjects ?? EMPTY_PROJECTS;
  const tasks = workbenchData?.tasks ?? EMPTY_TASKS;
  const currentUser = workbenchData?.currentUser ?? DEFAULT_USER;
  const loading = workbenchLoading && !workbenchData;
  const columns = columnConfig;

  const { pinnedSet, isPinned, togglePin } = usePinnedProjects(currentUser.id);

  const invalidateWorkbench = async (options?: { includeViews?: boolean }) => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.workbench });
    if (options?.includeViews) {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.viewsData, refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "manager"], refetchType: "none" });
    }
  };

  // 預定進場日與狀態排序
  // 過濾邏輯：預設排除已流標/立帳 (stageFilter === "ACTIVE")
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      let match = true;
      if (stageFilter === "ACTIVE") {
        if (p.currentStage === "LOST" || p.isClosed || p.currentStage === "BILLED" || p.currentStage === "CLOSED") match = false;
      } else if (stageFilter === "BILLED" || stageFilter === "CLOSED") {
        if (!p.isClosed && p.currentStage !== "BILLED" && p.currentStage !== "CLOSED") match = false;
      } else if (stageFilter) {
        if (p.currentStage !== stageFilter) match = false;
      }
      const projectStatus = p.currentStage === "LOST" ? "LOST" : p.trafficLight.color;
      if (statusFilter && projectStatus !== statusFilter) match = false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const mProject = p.projectName?.toLowerCase().includes(q);
        const mCustomer = p.customerName?.toLowerCase().includes(q);
        const mAddress = p.siteAddress?.toLowerCase().includes(q);
        const mSales = p.salesRepName?.toLowerCase().includes(q);
        const mAssistant = p.salesAssistantName?.toLowerCase().includes(q);
        if (!mProject && !mCustomer && !mAddress && !mSales && !mAssistant) {
          match = false;
        }
      }

      return match;
    });
  }, [projects, stageFilter, statusFilter, searchQuery]);

  // 依進場日與狀態排序（支援圖釘置頂）
  const sortedProjects = useMemo(() => {
    return sortProjectsWithPins(filteredProjects, pinnedSet, (a, b) => {
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
  }, [filteredProjects, statusSort, dateSort, pinnedSet]);

  const totalFilteredAmount = useMemo(() => {
    return sortedProjects.reduce(
      (sum, p) => sum + (p.quoteAmount || p.totalAmount || 0),
      0
    );
  }, [sortedProjects]);

  // 待辦事項區域：只顯示自行新建與主管指派的待辦（排除 milestoneId 關聯之正規里程碑待辦）
  const manualTasks = useMemo(() => {
    return tasks.filter((task) => !task.milestoneId);
  }, [tasks]);

  const pendingTasks = useMemo(() => {
    return manualTasks.filter((task) => !task.isCompleted);
  }, [manualTasks]);

  const isAdmin = currentUser.role === "ADMIN";
  const visibleTasks = isAdmin ? manualTasks : pendingTasks;

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-16">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <p className="text-sm text-slate-500 font-medium">正在載入案場筆記...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <div className="flex justify-between border-b pb-4">
        <div>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">案場筆記</span>
          <h1 className="text-2xl font-black mt-1">案件列表</h1>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" /> 待辦事項
            <span className="text-xs font-normal text-slate-500">（個人自建與主管交辦）</span>
            <SectionHelpButton sectionId="workbench-tasks" />
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
                  const projectForTask = projects.find((p) => p.id === task.projectId);
                  const isProjectPaused = projectForTask?.trafficLight?.label === "需追蹤";
                  const isPaused = Boolean(task.isPaused || isProjectPaused);
                  const status = getTaskScheduleStatus({ ...task, isPaused });
                  const isAlert = status.isOverdue || status.isDueToday;

                  return (
                    <tr
                      key={task.id}
                      className={
                        isAlert
                          ? "bg-red-50/80 hover:bg-red-100/70"
                          : status.isPaused
                          ? "bg-slate-50/60 hover:bg-slate-100/60"
                          : "hover:bg-slate-50"
                      }
                    >
                      <td className="p-3 font-bold">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className={isAlert ? "text-red-900" : ""}>
                            [{task.projectName}] {task.subject}
                          </span>
                          {status.isCompleted && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              已完成
                            </span>
                          )}
                          {status.isPaused && !status.isCompleted && (
                            <span className="rounded bg-slate-100 border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              需追蹤
                            </span>
                          )}
                          {status.isOverdue && (
                            <span className="rounded bg-red-100 border border-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-700 animate-pulse">
                              已逾期
                            </span>
                          )}
                          {status.isDueToday && (
                            <span className="rounded bg-red-100 border border-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-700 animate-pulse">
                              已到期
                            </span>
                          )}
                        </div>
                        {task.assignedByName && (
                          <div className="mt-1 text-[10px] font-normal text-slate-500">
                            建立者/指派者：{task.assignedByName}
                          </div>
                        )}
                      </td>
                      <td className={`p-3 font-medium ${isAlert ? "text-red-600 font-bold" : status.isPaused ? "text-slate-400 italic font-medium" : ""}`}>
                        {status.isPaused ? "需追蹤" : status.dueDateStr || "未設定"}
                      </td>
                      <td className="p-3">{task.priority}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {!task.isCompleted && (
                            <button
                              type="button"
                              onClick={() => {
                                setTaskToComplete(task);
                              }}
                              className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition-colors"
                            >
                              <CheckCircle2 className="h-4 w-4" /> 完成
                            </button>
                          )}
                          {task.projectId && (
                            <Link
                              href={`/projects/${task.projectId}/milestones`}
                              prefetch={true}
                              className="bg-slate-200 text-slate-700 px-3 py-1 rounded text-xs font-semibold hover:bg-blue-100 hover:text-blue-700 shadow-sm transition-colors"
                            >
                              案件細節
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">
            {isAdmin ? "目前沒有自建或主管指派待辦" : "目前沒有待處理的自建或主管交辦事項"}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" /> 案場總覽
            <SectionHelpButton sectionId="workbench-projects" />
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
              className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> 新增案場
            </button>
          </div>
        </div>

        <div className="bg-white p-4 border-b flex flex-wrap items-center gap-4 bg-slate-50/50">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜尋案名/客戶/地址/業務..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pl-8 pr-7 border border-slate-300 rounded text-xs bg-white font-normal focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="清除搜尋"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            狀態：
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 border border-slate-300 rounded px-2 text-xs bg-white"
            >
              <option value="">全部狀態</option>
              <option value="RED">逾期</option>
              <option value="YELLOW">即將到期</option>
              <option value="GREEN">正常</option>
              <option value="GRAY">需追蹤/未排定/已完成</option>
              <option value="LOST">流標</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            階段：
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="h-7 border border-slate-300 rounded px-2 text-xs bg-white"
            >
              <option value="ACTIVE">進行中案件</option>
              <option value="">全部案件</option>
              <option value="DEVELOP">第一階段：案件開發</option>
              <option value="REQUIREMENT">第二階段：現況及需求確認</option>
              <option value="PROPOSAL">第三階段：設計提案/報價/簽約</option>
              <option value="PRE_PROD">第四階段：生產前確認/拆單</option>
              <option value="PROD_SHIP">第五階段：生產及派送</option>
              <option value="INSTALL">第六階段：安裝及驗收</option>
              <option value="CLOSURE">第七階段：立帳/結案</option>
              <option value="WRAP_UP">收尾</option>
              <option value="LOST">流標</option>
              <option value="BILLED">結案</option>
            </select>
          </label>
          <button
            type="button"
            onClick={resetFilters}
            className={`inline-flex h-7 items-center gap-1.5 px-2.5 rounded border text-xs font-semibold transition-colors ${
              searchQuery.trim() || statusFilter || stageFilter !== "ACTIVE" || dateSort !== "NONE" || statusSort !== "NONE"
                ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
            title="回復預設篩選條件"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            回復預設
          </button>
        </div>

        {/* 篩選結果摘要 */}
        <div className="px-6 py-2.5 bg-blue-50/50 border-b flex flex-wrap items-center gap-4 text-xs text-blue-900 font-semibold">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              篩選結果：共 <span className="text-sm font-bold text-blue-700">{sortedProjects.length}</span> 案
            </span>
            {sortedProjects.some((p) => pinnedSet.has(p.id)) && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <Pin className="w-3 h-3 fill-amber-700 -rotate-45" />
                {sortedProjects.filter((p) => pinnedSet.has(p.id)).length} 案置頂中
              </span>
            )}
            <span>
              ，報價總額 <span className="text-sm font-bold text-blue-700">NT$ {totalFilteredAmount.toLocaleString()}</span>
            </span>
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
              {sortedProjects.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="p-8 text-center text-slate-400">
                    目前無符合條件的案件
                  </td>
                </tr>
              ) : (
                sortedProjects.map((p) => (
                  <Fragment key={p.id}>
                  <tr
                    className={`hover:brightness-95 [&>td]:align-middle transition-colors ${
                      isPinned(p.id) ? "border-l-4 border-l-amber-400 " : ""
                    }${
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
                        case "projectName": {
                          const pinned = isPinned(p.id);
                          return (
                            <td key={col.key} className="p-3 font-bold">
                              <div className="flex items-start gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nowPinned = togglePin(p.id);
                                    if (nowPinned) {
                                      toast.success(`已將案件「${p.projectName}」置頂`);
                                    } else {
                                      toast.info(`已取消案件「${p.projectName}」置頂`);
                                    }
                                  }}
                                  className={`mt-0.5 p-1 rounded transition-colors shrink-0 ${
                                    pinned
                                      ? "text-amber-500 hover:text-amber-600 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-300"
                                      : "text-slate-300 hover:text-slate-600 hover:bg-slate-100"
                                  }`}
                                  title={pinned ? "取消置頂" : "置頂案件至清單最上方"}
                                  aria-label={pinned ? "取消置頂" : "置頂案件至清單最上方"}
                                >
                                  <Pin className={`w-3.5 h-3.5 ${pinned ? "fill-amber-500 -rotate-45" : ""}`} />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-slate-900">{p.projectName}</span>
                                    {pinned && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 shadow-xs">
                                        <Pin className="w-2.5 h-2.5 fill-amber-700 -rotate-45 inline" /> 置頂
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-normal">{p.siteAddress}</div>
                                </div>
                              </div>
                            </td>
                          );
                        }
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
                              <div>{p.isClosed ? "結案" : (PROJECT_STAGE_LABELS[p.currentStage] || p.currentStage)}</div>
                              <div className="mt-1 text-[11px] font-normal">
                                {p.currentStage === "LOST" ? (
                                  <span className="text-slate-400">—</span>
                                ) : p.isClosed ? (
                                  <span className="text-emerald-700 font-semibold">已結案</span>
                                ) : p.activeMilestone ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-blue-800 font-bold">
                                    {p.activeMilestone.stageName}
                                    {p.activeMilestone.plannedDueDate && (
                                      <span className="text-[10px] text-blue-600 font-normal">
                                        ({p.activeMilestone.plannedDueDate.slice(5, 10)})
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">完結</span>
                                )}
                              </div>
                            </td>
                          );
                        case "quoteAndUnits":
                        case "amount":
                          return (
                            <td key={col.key} className="p-3">
                              <div className="tabular-nums font-bold text-slate-900">
                                {formatNTD(p.quoteAmount ?? p.totalAmount ?? 0)}
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
                            <td key={col.key} className="p-3 text-center align-middle">
                              <div className="flex items-center justify-center gap-1.5">
                                {p.activeMilestone && !p.isClosed && p.currentStage !== "LOST" && (
                                  <button
                                    type="button"
                                    onClick={() => setProjectToAdvance(p)}
                                    className="inline-flex h-7 items-center justify-center rounded bg-blue-600 px-2.5 text-xs font-bold text-white hover:bg-blue-700 shadow-xs transition-colors"
                                    title={`推進當前進度：${p.activeMilestone.stageName}`}
                                  >
                                    項目推進
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openEditProject(p)}
                                  className="inline-flex h-7 items-center justify-center rounded bg-amber-100 px-2.5 text-xs font-bold text-amber-800 hover:bg-amber-200 transition-colors"
                                >
                                  編輯
                                </button>
                                <Link
                                  href={`/projects/${p.id}/milestones`}
                                  prefetch={true}
                                  className="inline-flex h-7 items-center justify-center rounded bg-slate-100 px-2.5 text-xs font-bold text-slate-700 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                >
                                  案件細節
                                </Link>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProject(p)}
                                    className="inline-flex h-7 items-center justify-center rounded bg-red-100 px-2.5 text-xs font-bold text-red-700 hover:bg-red-200 transition-colors"
                                  >
                                    刪除
                                  </button>
                                )}
                              </div>
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
              )))}
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

      <WorkbenchAdvanceMilestoneModal onInvalidate={invalidateWorkbench} />
    </div>
  );
}
