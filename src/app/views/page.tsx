"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  Calendar,
  Search,
  Filter,
  RotateCcw,
  X,
  User,
  Building2,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { GanttChart } from "@/components/views/GanttChart";
import { CalendarView } from "@/components/views/CalendarView";
import { SectionHelpButton } from "@/components/common/SectionHelpButton";
import type { CalendarStaffDTO, ProjectWithMilestonesDTO, TaskDTO } from "@/types/dto";
import { useViewsDataQuery } from "@/hooks/useQueries";
import { CUSTOMER_TYPE_LABELS, matchesStage } from "@/lib/constants";
import { useViewsStore } from "@/stores/useViewsStore";
import { useShallow } from "zustand/react/shallow";

const STAGE_FILTER_OPTIONS = [
  { value: "", label: "全部階段" },
  { value: "ACTIVE", label: "進行中案件" },
  { value: "DEVELOP", label: "第一階段：案件開發" },
  { value: "REQUIREMENT", label: "第二階段：現況及需求確認" },
  { value: "PROPOSAL", label: "第三階段：提案/報價/簽約" },
  { value: "PRE_PROD", label: "第四階段：生產前確認/拆單" },
  { value: "PROD_SHIP", label: "第五階段：生產及派送" },
  { value: "INSTALL", label: "第六階段：安裝及驗收" },
  { value: "CLOSURE", label: "第七階段：立帳/結案" },
  { value: "BILLED", label: "結案" },
  { value: "WRAP_UP", label: "收尾" },
  { value: "LOST", label: "流標" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部狀態" },
  { value: "RED", label: "🔴 逾期卡關" },
  { value: "GREEN", label: "🟢 進度正常" },
  { value: "BILLED", label: "🏁 已結案" },
  { value: "LOST", label: "⚪ 流標" },
];

function checkIsClosed(p: ProjectWithMilestonesDTO): boolean {
  if (p.currentStage === "BILLED" || p.currentStage === "CLOSED" || p.currentStage === "DONE") return true;
  return Boolean(p.milestones?.some((m) => m.stageCode === "7-2" && m.status === "COMPLETED"));
}

const EMPTY_PROJECTS: ProjectWithMilestonesDTO[] = [];
const EMPTY_TASKS: TaskDTO[] = [];
const EMPTY_STAFF: CalendarStaffDTO[] = [];

export default function VisualViewsPage() {
  const { data: viewsData, isLoading: viewsLoading, error: viewsError, refetch } = useViewsDataQuery();

  const [activeTab, setActiveTab] = useState<"gantt" | "calendar">("gantt");
  const projects = viewsData?.projects ?? EMPTY_PROJECTS;
  const tasks = viewsData?.tasks ?? EMPTY_TASKS;
  const staff = viewsData?.staff ?? EMPTY_STAFF;

  // 篩選條件狀態 (由 useViewsStore 全域持久化管理，切換頁面不重置)
  const {
    searchQuery,
    salesFilter,
    typeFilter,
    stageFilter,
    statusFilter,
  } = useViewsStore(
    useShallow((s) => ({
      searchQuery: s.searchQuery,
      salesFilter: s.salesFilter,
      typeFilter: s.typeFilter,
      stageFilter: s.stageFilter,
      statusFilter: s.statusFilter,
    }))
  );

  const setSearchQuery = useViewsStore((s) => s.setSearchQuery);
  const setSalesFilter = useViewsStore((s) => s.setSalesFilter);
  const setTypeFilter = useViewsStore((s) => s.setTypeFilter);
  const setStageFilter = useViewsStore((s) => s.setStageFilter);
  const setStatusFilter = useViewsStore((s) => s.setStatusFilter);
  const resetFilters = useViewsStore((s) => s.resetFilters);
  const initFromStorage = useViewsStore((s) => s.initFromStorage);

  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  const loading = viewsLoading && !viewsData;
  const loadError = viewsError instanceof Error ? viewsError.message : "";

  // 動態負責業務清單
  const salesOptions = useMemo(() => {
    const reps = new Set<string>();
    projects.forEach((p) => {
      if (p.salesRepName && p.salesRepName !== "未指定" && p.salesRepName !== "未指派") reps.add(p.salesRepName);
    });
    return Array.from(reps).sort((a, b) => a.localeCompare(b, "zh-TW"));
  }, [projects]);

  // 動態客戶類型清單
  const customerTypeOptions = useMemo(() => {
    const types = new Set<string>();
    projects.forEach((p) => {
      if (p.customerType) types.add(p.customerType);
    });
    return Array.from(types).sort();
  }, [projects]);

  // 過濾案場核心邏輯
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const isClosed = checkIsClosed(p);

      // 1. 階段篩選
      if (stageFilter === "ACTIVE") {
        if (p.currentStage === "LOST" || isClosed || p.currentStage === "BILLED" || p.currentStage === "CLOSED") return false;
      } else if (stageFilter === "BILLED" || stageFilter === "CLOSED") {
        if (!isClosed && p.currentStage !== "BILLED" && p.currentStage !== "CLOSED") return false;
      } else if (stageFilter === "LOST") {
        if (p.currentStage !== "LOST") return false;
      } else if (stageFilter) {
        if (!matchesStage(p.currentStage, stageFilter)) return false;
      }

      // 2. 狀態燈號篩選
      if (statusFilter === "RED") {
        if (!p.isDelayed || p.currentStage === "LOST" || isClosed) return false;
      } else if (statusFilter === "GREEN") {
        if (p.isDelayed || p.currentStage === "LOST" || isClosed) return false;
      } else if (statusFilter === "BILLED" || statusFilter === "CLOSED") {
        if (!isClosed) return false;
      } else if (statusFilter === "LOST") {
        if (p.currentStage !== "LOST") return false;
      }

      // 3. 負責業務
      if (salesFilter && p.salesRepName !== salesFilter) {
        return false;
      }

      // 4. 客戶類型
      if (typeFilter && p.customerType !== typeFilter) return false;

      // 5. 關鍵字搜尋 (案場名稱 / 業主名稱 / 案場地址 / 負責業務)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = p.projectName.toLowerCase().includes(q);
        const matchCustomer = p.customerName.toLowerCase().includes(q);
        const matchAddress = p.siteAddress?.toLowerCase().includes(q);
        const matchSales = p.salesRepName?.toLowerCase().includes(q);
        if (!matchName && !matchCustomer && !matchAddress && !matchSales) return false;
      }

      return true;
    });
  }, [projects, stageFilter, statusFilter, salesFilter, typeFilter, searchQuery]);

  // 過濾任務列表 (與過濾後的案場連動)
  const filteredProjectIds = useMemo(() => new Set(filteredProjects.map((p) => p.id)), [filteredProjects]);
  const filteredTasks = useMemo(() => tasks.filter((t) => filteredProjectIds.has(t.projectId)), [tasks, filteredProjectIds]);

  // 篩選結果報價總額
  const totalFilteredAmount = useMemo(() => {
    return filteredProjects.reduce(
      (sum, p) => sum + (p.quoteAmount ?? p.estimatedBudget ?? 0),
      0
    );
  }, [filteredProjects]);

  // 篩選統計細項
  const activeCount = useMemo(() => filteredProjects.filter((p) => p.currentStage !== "LOST" && !checkIsClosed(p)).length, [filteredProjects]);
  const delayedCount = useMemo(() => filteredProjects.filter((p) => p.isDelayed && p.currentStage !== "LOST" && !checkIsClosed(p)).length, [filteredProjects]);
  const closedCount = useMemo(() => filteredProjects.filter(checkIsClosed).length, [filteredProjects]);
  const lostCount = useMemo(() => filteredProjects.filter((p) => p.currentStage === "LOST").length, [filteredProjects]);

  const activeFilterCount = [
    searchQuery.trim(),
    salesFilter,
    typeFilter,
    stageFilter,
    statusFilter,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-16">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <p className="text-slate-500 font-medium text-sm">正在載入視覺時程數據...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-16 text-center space-y-4">
        <p role="alert" className="text-red-600 font-medium">{loadError}</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          重新載入
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      {/* 頁面標題與模式切換 Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">甘特圖時程軸、行事曆排程</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
            全廠專案時程檢視
          </h1>
        </div>

        {/* Tab 標籤切換組件 */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab("gantt")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "gantt"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>甘特圖 (Gantt)</span>
          </button>

          <button
            onClick={() => setActiveTab("calendar")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "calendar"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>行事曆 (Calendar)</span>
          </button>
        </div>
      </div>

      {/* 篩選條件工具列 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="bg-slate-50/70 px-4 py-2 border-b flex items-center justify-between text-xs text-slate-600 font-bold">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>時程綜合篩選條件</span>
            <SectionHelpButton sectionId="views-filters" />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition ${
              activeFilterCount > 0
                ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
            title="回復預設篩選條件"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>回復預設{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* 第一列：搜尋輸入框與下拉篩選選單 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 關鍵字搜尋 */}
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜尋案場名稱 / 業主 / 地址 / 業務..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  title="清除搜尋"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 負責業務 */}
            <div className="flex items-center gap-1.5 bg-slate-50/50 border border-slate-200 rounded-xl px-2.5 py-1">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={salesFilter}
                onChange={(e) => setSalesFilter(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
              >
                <option value="">全部業務</option>
                {salesOptions.map((rep) => (
                  <option key={rep} value={rep}>
                    {rep}
                  </option>
                ))}
              </select>
            </div>

            {/* 客戶類型 */}
            <div className="flex items-center gap-1.5 bg-slate-50/50 border border-slate-200 rounded-xl px-2.5 py-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
              >
                <option value="">全部客群</option>
                {customerTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {CUSTOMER_TYPE_LABELS[type] || type}
                  </option>
                ))}
              </select>
            </div>

            {/* 案件階段 */}
            <div className="flex items-center gap-1.5 bg-slate-50/50 border border-slate-200 rounded-xl px-2.5 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
              >
                {STAGE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 狀態燈號 */}
            <div className="flex items-center gap-1.5 bg-slate-50/50 border border-slate-200 rounded-xl px-2.5 py-1">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 篩選結果統計資訊列 */}
        <div className="px-4 py-2.5 bg-blue-50/60 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 font-medium">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              篩選結果：共 <strong className="text-blue-700 font-bold">{filteredProjects.length}</strong> 個案場
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-700">進行中 {activeCount} 案</span>
            {delayedCount > 0 && (
              <span className="text-red-700 font-bold">🔴 逾期卡關 {delayedCount} 案</span>
            )}
            <span className="text-teal-700">🏁 已結案 {closedCount} 案</span>
            {lostCount > 0 && (
              <span className="text-slate-500">⚪ 流標 {lostCount} 案</span>
            )}
            <span className="text-slate-300">|</span>
            <span>
              報價總額：<strong className="text-blue-700 font-mono font-bold">NT$ {totalFilteredAmount.toLocaleString()}</strong>
            </span>
          </div>

          <div className="text-[11px] text-slate-500">
            {activeTab === "gantt" && "💡 甘特圖僅顯示符合條件之案場時程軸"}
            {activeTab === "calendar" && "💡 行事曆僅呈現符合條件之案場待辦與里程碑"}
          </div>
        </div>
      </div>

      {/* 視圖內容 */}
      {activeTab === "gantt" && <GanttChart projects={filteredProjects} tasks={filteredTasks} />}

      {activeTab === "calendar" && (
        <CalendarView projects={filteredProjects} tasks={filteredTasks} staff={staff} />
      )}
    </div>
  );
}
