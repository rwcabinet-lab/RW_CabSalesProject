"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Printer,
  Download,
  Settings,
  RefreshCw,
  ExternalLink,
  Filter,
  Search,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  X,
  MoreVertical,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useManagerProjectStatusQuery, QUERY_KEYS } from "@/hooks/useQueries";
import { toast } from "@/stores/useToastStore";
import type {
  ManagerProjectStatusReportDTO,
  ProjectStatusItemDTO,
  ProjectStatusYearGroupDTO,
} from "@/types/dto";

interface TargetEditForm {
  annualTarget: number;
  q1Target: number;
  q1Actual: number;
  q2Target: number;
  q2Actual: number;
  q3Target: number;
  q3Actual: number;
  currTarget: number;
  currActual: number;
}

export function ManagerProjectStatusReport() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(10);
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 目標設定彈窗
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetForm, setTargetForm] = useState<TargetEditForm>({
    annualTarget: 250000000,
    q1Target: 60000000,
    q1Actual: 45500000,
    q2Target: 60000000,
    q2Actual: 37900000,
    q3Target: 60000000,
    q3Actual: 52600000,
    currTarget: 20000000,
    currActual: 14900000,
  });

  // 分類手動切換彈窗
  const [actionMenuProject, setActionMenuProject] = useState<ProjectStatusItemDTO | null>(null);

  const {
    data: report,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useManagerProjectStatusQuery(selectedYear, selectedMonth);

  // 地區選單清單
  const allRegions = useMemo(() => {
    if (!report) return [];
    const set = new Set<string>();
    const gather = (groups: ProjectStatusYearGroupDTO[]) => {
      groups.forEach((g) => g.projects.forEach((p) => p.region && set.add(p.region)));
    };
    gather(report.signedSection.yearlyGroups);
    gather(report.estimatingSection.yearlyGroups);
    gather(report.quotedSection.yearlyGroups);
    return Array.from(set).sort();
  }, [report]);

  // 過濾邏輯（地區與關鍵字）
  const filterProjects = useCallback(
    (projects: ProjectStatusItemDTO[]) => {
      return projects.filter((p) => {
        if (regionFilter !== "ALL" && p.region !== regionFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const mCustomer = p.customerName.toLowerCase().includes(q);
          const mProject = p.projectName.toLowerCase().includes(q);
          const mRegion = p.region.toLowerCase().includes(q);
          if (!mCustomer && !mProject && !mRegion) return false;
        }
        return true;
      });
    },
    [regionFilter, searchQuery]
  );

  // 過濾後的區塊資料
  const filterSection = useCallback(
    (section: ManagerProjectStatusReportDTO["signedSection"]) => {
      return section.yearlyGroups
        .map((g) => {
          const filtered = filterProjects(g.projects);
          const subtotal = filtered.reduce((s, p) => s + (p.amount || 0), 0);
          return {
            ...g,
            projects: filtered,
            subtotalAmount: subtotal,
            subtotalLabel: `$ ${(subtotal / 1_000_000).toFixed(1)}M`,
            totalUnits: filtered.reduce((s, p) => s + (p.unitCount || 0), 0),
          };
        })
        .filter((g) => g.projects.length > 0);
    },
    [filterProjects]
  );

  const filteredSignedGroups = useMemo(
    () => (report ? filterSection(report.signedSection) : []),
    [report, filterSection]
  );
  const filteredEstimatingGroups = useMemo(
    () => (report ? filterSection(report.estimatingSection) : []),
    [report, filterSection]
  );
  const filteredQuotedGroups = useMemo(
    () => (report ? filterSection(report.quotedSection) : []),
    [report, filterSection]
  );

  // 開啟目標編輯視窗並載入現有數據
  const handleOpenTargetModal = () => {
    if (report?.targetSummary) {
      const ts = report.targetSummary;
      const periods = ts.periods;
      setTargetForm({
        annualTarget: ts.annualTarget || 250000000,
        q1Target: periods[0]?.targetAmount || 60000000,
        q1Actual: periods[0]?.actualAmount || 45500000,
        q2Target: periods[1]?.targetAmount || 60000000,
        q2Actual: periods[1]?.actualAmount || 37900000,
        q3Target: periods[2]?.targetAmount || 60000000,
        q3Actual: periods[2]?.actualAmount || 52600000,
        currTarget: periods[3]?.targetAmount || 20000000,
        currActual: periods[3]?.actualAmount || 14900000,
      });
    }
    setTargetModalOpen(true);
  };

  // 儲存目標設定
  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        action: "UPDATE_TARGETS",
        year: selectedYear,
        config: {
          annualYear: selectedYear,
          annualTarget: Number(targetForm.annualTarget),
          periods: [
            {
              periodKey: `${selectedYear}/Q1`,
              periodLabel: `${selectedYear}/Q1`,
              targetAmount: Number(targetForm.q1Target),
              manualActual: Number(targetForm.q1Actual),
            },
            {
              periodKey: `${selectedYear}/Q2`,
              periodLabel: `${selectedYear}/Q2`,
              targetAmount: Number(targetForm.q2Target),
              manualActual: Number(targetForm.q2Actual),
            },
            {
              periodKey: `${selectedYear}/Q3`,
              periodLabel: `${selectedYear}/Q3`,
              targetAmount: Number(targetForm.q3Target),
              manualActual: Number(targetForm.q3Actual),
            },
            {
              periodKey: `${selectedYear}/${selectedMonth}月`,
              periodLabel: `${selectedYear}/${selectedMonth}月`,
              targetAmount: Number(targetForm.currTarget),
              manualActual: Number(targetForm.currActual),
              isCurrent: true,
            },
          ],
        },
      };

      const res = await fetch("/api/dashboard/manager/status-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("儲存目標失敗");
      toast.success("經營目標設定已更新！");
      setTargetModalOpen(false);
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新目標時發生錯誤");
    }
  };

  // 變更專案階段覆寫
  const handleOverrideSection = async (section: "SIGNED" | "ESTIMATING" | "QUOTED" | "AUTO") => {
    if (!actionMenuProject) return;
    try {
      const res = await fetch("/api/dashboard/manager/status-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OVERRIDE_SECTION",
          projectId: actionMenuProject.id,
          section,
        }),
      });
      if (!res.ok) throw new Error("更新階段失敗");
      toast.success(`案場「${actionMenuProject.projectName}」分類已更新`);
      setActionMenuProject(null);
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新階段時發生錯誤");
    }
  };

  // 匯出 Excel (CSV with UTF-8 BOM)
  const handleExportCSV = () => {
    if (!report) return;

    let csv = "\uFEFF"; // UTF-8 BOM
    csv += `${selectedMonth} 月份系統櫃部經營會議報告\n\n`;

    // 經營目標
    csv += `2026年目標,NT $${(report.targetSummary.annualTarget / 1000000).toFixed(0)}M,達成率,${report.targetSummary.achievementRate}%,累積業績,$ ${(report.targetSummary.cumulativeActual / 1000000).toFixed(1)}M\n`;
    csv += `月份,目標,業績/月,達成率,累積業績\n`;
    report.targetSummary.periods.forEach((p) => {
      csv += `${p.periodLabel},$ ${(p.targetAmount / 1000000).toFixed(1)}M,$ ${(p.actualAmount / 1000000).toFixed(1)}M,${p.achievementRate}%,$ ${(p.cumulativeActual / 1000000).toFixed(1)}M\n`;
    });
    csv += `\n`;

    // 已簽約
    csv += `【已簽約】\n竣工日期,客戶名稱,案場名稱,工程地區,戶數,金額,合計\n`;
    report.signedSection.yearlyGroups.forEach((g) => {
      g.projects.forEach((p, idx) => {
        const subtotal = idx === 0 ? g.subtotalLabel : "";
        csv += `"${g.year}","${p.customerName}","${p.projectName}","${p.region}",${p.unitCount},${p.amount || 0},"${subtotal}"\n`;
      });
    });
    csv += `\n`;

    // 估價中
    csv += `【估價中】\n竣工日期,客戶名稱,案場名稱,工程地區,戶數,進度\n`;
    report.estimatingSection.yearlyGroups.forEach((g) => {
      g.projects.forEach((p) => {
        csv += `"${g.year}","${p.customerName}","${p.projectName}","${p.region}",${p.unitCount},"${p.progressNotes || "估價中"}"\n`;
      });
    });
    csv += `\n`;

    // 已報價
    csv += `【已報價】\n竣工日期,客戶名稱,案場名稱,工程地區,戶數,金額,合計\n`;
    report.quotedSection.yearlyGroups.forEach((g) => {
      g.projects.forEach((p, idx) => {
        const subtotal = idx === 0 ? g.subtotalLabel : "";
        csv += `"${g.year}","${p.customerName}","${p.projectName}","${p.region}",${p.unitCount},${p.amount || 0},"${subtotal}"\n`;
      });
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `系統櫃部經營會議報告_${selectedYear}年${selectedMonth}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已成功匯出 Excel (CSV) 報表");
  };

  if (isLoading && !report) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <div className="text-slate-600 font-bold">載入案件現況統計報表數據中...</div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl">
        載入報表失敗：{error instanceof Error ? error.message : "發生未知錯誤"}
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      {/* 頂部操作工具列 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {/* 年度選擇 */}
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <span>年份：</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {[2025, 2026, 2027, 2028, 2029].map((y) => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </select>
          </div>

          {/* 月份選擇 */}
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <span>月份：</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
          </div>

          {/* 地區過濾 */}
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <span>地區：</span>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">全部地區 ({allRegions.length})</option>
              {allRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* 關鍵字搜尋 */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜尋案名、客戶或地區..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-48 sm:w-60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 動作按鈕 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenTargetModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-colors"
            title="自訂年度目標與各季實績"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            設定目標
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 shadow-sm transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            匯出 Excel
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            列印 / PDF
          </button>

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
            title="重新整理資料"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* 報表主視覺主體 (與附圖完全一致之四宮格版面) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm print:p-0 print:border-none print:shadow-none space-y-6">
        {/* 頂部標題 */}
        <div className="text-center py-2">
          <h1 className="text-2xl sm:text-3xl font-black text-rose-600 tracking-wider inline-block">
            {selectedMonth} 月份系統櫃部經營會議報告
          </h1>
        </div>

        {/* 左右對稱排版：左欄 (目標達成率 + 已簽約) / 右欄 (估價中 + 已報價) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* ===================== 左側欄位 ===================== */}
          <div className="space-y-6">
            {/* 1. 頂部左側：目標與業績達成率卡片 */}
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
              {/* 綠色大橫幅 */}
              <div className="bg-[#8da35e] text-white px-4 py-2.5 font-bold flex flex-wrap items-center justify-between text-sm sm:text-base tracking-wide border-b border-[#7b9150]">
                <div>{selectedYear} 年目標 NT ${(report.targetSummary.annualTarget / 1_000_000).toFixed(0)}M</div>
                <div className="flex items-center gap-4">
                  <span>達成率：{report.targetSummary.achievementRate}%</span>
                  <span>累積業績：$ {(report.targetSummary.cumulativeActual / 1_000_000).toFixed(1)}M</span>
                </div>
              </div>

              {/* 目標明細表 */}
              <table className="w-full text-xs sm:text-sm text-center border-collapse">
                <thead>
                  <tr className="bg-[#eaf0dc] text-slate-800 font-bold border-b border-slate-300">
                    <th className="py-2 px-3 border-r border-slate-300 w-1/5">月份</th>
                    <th className="py-2 px-3 border-r border-slate-300 w-1/5">目標</th>
                    <th className="py-2 px-3 border-r border-slate-300 w-1/5">業績/月</th>
                    <th className="py-2 px-3 border-r border-slate-300 w-1/5">達成率</th>
                    <th className="py-2 px-3 w-1/5">累積業績</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.targetSummary.periods.map((p) => {
                    const isCurr = p.isCurrent;
                    return (
                      <tr
                        key={p.periodKey}
                        className={`hover:bg-slate-50 transition-colors ${
                          isCurr ? "text-rose-600 font-bold bg-rose-50/40" : "text-slate-800"
                        }`}
                      >
                        <td className="py-2 px-3 border-r border-slate-200">{p.periodLabel}</td>
                        <td className="py-2 px-3 border-r border-slate-200">
                          目標 ${(p.targetAmount / 1_000_000).toFixed(1)}M
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200">
                          業績 ${(p.actualAmount / 1_000_000).toFixed(1)}M
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200">{p.achievementRate}%</td>
                        <td className="py-2 px-3 font-semibold">
                          $ {(p.cumulativeActual / 1_000_000).toFixed(1)}M
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 2. 左下方：已簽約 表格 */}
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#8da35e] text-white py-2 px-4 text-center font-bold text-base tracking-wider border-b border-[#7b9150]">
                已簽約
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#eaf0dc] text-slate-800 font-bold border-b border-slate-300 text-center">
                      <th className="py-2 px-2 border-r border-slate-300 w-16">竣工日期</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-24">客戶名稱</th>
                      <th className="py-2 px-3 border-r border-slate-300 text-left">案場名稱</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-16">工程地區</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-12">戶數</th>
                      <th className="py-2 px-3 border-r border-slate-300 w-28 text-right">金額</th>
                      <th className="py-2 px-3 w-20 text-center font-black">合計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSignedGroups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          尚無符合條件之已簽約案場
                        </td>
                      </tr>
                    ) : (
                      filteredSignedGroups.map((group) => {
                        return group.projects.map((proj, pIdx) => (
                          <tr
                            key={proj.id}
                            className="hover:bg-amber-50/30 transition-colors group text-slate-800"
                          >
                            {/* 合併儲存格：竣工年度 */}
                            {pIdx === 0 && (
                              <td
                                rowSpan={group.projects.length}
                                className="py-2 px-2 border-r border-slate-300 font-bold text-center bg-slate-50/60 align-middle text-slate-700"
                              >
                                {group.year}
                              </td>
                            )}

                            {/* 客戶名稱 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center truncate max-w-[100px]" title={proj.customerName}>
                              {proj.customerName}
                            </td>

                            {/* 案場名稱 (點擊直達進度) */}
                            <td className="py-2 px-3 border-r border-slate-200 font-medium">
                              <div className="flex items-center justify-between gap-1">
                                <Link
                                  href={`/projects/${proj.id}/milestones`}
                                  className="hover:text-blue-600 hover:underline transition-colors truncate"
                                  title={proj.projectName}
                                >
                                  {proj.projectName}
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setActionMenuProject(proj)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-slate-700 transition-opacity print:hidden"
                                  title="調整階段"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>

                            {/* 工程地區 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-600">
                              {proj.region}
                            </td>

                            {/* 戶數 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center tabular-nums">
                              {proj.unitCount}
                            </td>

                            {/* 金額 */}
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-medium tabular-nums">
                              ${proj.amount ? proj.amount.toLocaleString("en-US") : "0"}
                            </td>

                            {/* 合計 (合併顯示各年度百萬小計) */}
                            {pIdx === 0 && (
                              <td
                                rowSpan={group.projects.length}
                                className="py-2 px-2 text-center font-black text-slate-900 bg-emerald-50/30 align-middle tabular-nums text-sm"
                              >
                                {group.subtotalLabel}
                              </td>
                            )}
                          </tr>
                        ));
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ===================== 右側欄位 ===================== */}
          <div className="space-y-6">
            {/* 3. 右上方：估價中 表格 */}
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#a8bf7b] text-slate-900 py-2 px-4 text-center font-bold text-base tracking-wider border-b border-[#92a867]">
                估價中
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#eaf0dc] text-slate-800 font-bold border-b border-slate-300 text-center">
                      <th className="py-2 px-2 border-r border-slate-300 w-16">竣工日期</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-24">客戶名稱</th>
                      <th className="py-2 px-3 border-r border-slate-300 text-left">案場名稱</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-16">工程地區</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-12">戶數</th>
                      <th className="py-2 px-3 text-center w-36">進度</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredEstimatingGroups.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          尚無符合條件之估價中案場
                        </td>
                      </tr>
                    ) : (
                      filteredEstimatingGroups.map((group) => {
                        return group.projects.map((proj, pIdx) => (
                          <tr
                            key={proj.id}
                            className="hover:bg-amber-50/30 transition-colors group text-slate-800"
                          >
                            {/* 合併儲存格：竣工年度 */}
                            {pIdx === 0 && (
                              <td
                                rowSpan={group.projects.length}
                                className="py-2 px-2 border-r border-slate-300 font-bold text-center bg-slate-50/60 align-middle text-slate-700"
                              >
                                {group.year}
                              </td>
                            )}

                            {/* 客戶名稱 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center truncate max-w-[100px]" title={proj.customerName}>
                              {proj.customerName}
                            </td>

                            {/* 案場名稱 */}
                            <td className="py-2 px-3 border-r border-slate-200 font-medium">
                              <div className="flex items-center justify-between gap-1">
                                <Link
                                  href={`/projects/${proj.id}/milestones`}
                                  className="hover:text-blue-600 hover:underline transition-colors truncate"
                                  title={proj.projectName}
                                >
                                  {proj.projectName}
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setActionMenuProject(proj)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-slate-700 transition-opacity print:hidden"
                                  title="調整階段"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>

                            {/* 工程地區 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-600">
                              {proj.region}
                            </td>

                            {/* 戶數 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center tabular-nums">
                              {proj.unitCount}
                            </td>

                            {/* 進度狀態 */}
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                  proj.progressNotes?.includes("核對中")
                                    ? "bg-amber-100 text-amber-800"
                                    : proj.progressNotes?.includes("已丈量")
                                    ? "bg-blue-100 text-blue-800"
                                    : proj.progressNotes?.includes("尚未提供")
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {proj.progressNotes || "估價中"}
                              </span>
                            </td>
                          </tr>
                        ));
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. 右下方：已報價 表格 */}
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#8da35e] text-white py-2 px-4 text-center font-bold text-base tracking-wider border-b border-[#7b9150]">
                已報價
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#eaf0dc] text-slate-800 font-bold border-b border-slate-300 text-center">
                      <th className="py-2 px-2 border-r border-slate-300 w-16">竣工日期</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-24">客戶名稱</th>
                      <th className="py-2 px-3 border-r border-slate-300 text-left">案場名稱</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-16">工程地區</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-12">戶數</th>
                      <th className="py-2 px-3 border-r border-slate-300 w-28 text-right">金額</th>
                      <th className="py-2 px-3 w-20 text-center font-black">合計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredQuotedGroups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          尚無符合條件之已報價案場
                        </td>
                      </tr>
                    ) : (
                      filteredQuotedGroups.map((group) => {
                        return group.projects.map((proj, pIdx) => (
                          <tr
                            key={proj.id}
                            className="hover:bg-amber-50/30 transition-colors group text-slate-800"
                          >
                            {/* 合併儲存格：竣工年度 */}
                            {pIdx === 0 && (
                              <td
                                rowSpan={group.projects.length}
                                className="py-2 px-2 border-r border-slate-300 font-bold text-center bg-slate-50/60 align-middle text-slate-700"
                              >
                                {group.year}
                              </td>
                            )}

                            {/* 客戶名稱 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center truncate max-w-[100px]" title={proj.customerName}>
                              {proj.customerName}
                            </td>

                            {/* 案場名稱 */}
                            <td className="py-2 px-3 border-r border-slate-200 font-medium">
                              <div className="flex items-center justify-between gap-1">
                                <Link
                                  href={`/projects/${proj.id}/milestones`}
                                  className="hover:text-blue-600 hover:underline transition-colors truncate"
                                  title={proj.projectName}
                                >
                                  {proj.projectName}
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setActionMenuProject(proj)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-slate-700 transition-opacity print:hidden"
                                  title="調整階段"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>

                            {/* 工程地區 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center text-slate-600">
                              {proj.region}
                            </td>

                            {/* 戶數 */}
                            <td className="py-2 px-2 border-r border-slate-200 text-center tabular-nums">
                              {proj.unitCount}
                            </td>

                            {/* 金額 */}
                            <td className="py-2 px-3 border-r border-slate-200 text-right font-medium tabular-nums">
                              ${proj.amount ? proj.amount.toLocaleString("en-US") : "0"}
                            </td>

                            {/* 合計 (合併顯示各年度百萬小計) */}
                            {pIdx === 0 && (
                              <td
                                rowSpan={group.projects.length}
                                className="py-2 px-2 text-center font-black text-slate-900 bg-emerald-50/30 align-middle tabular-nums text-sm"
                              >
                                {group.subtotalLabel}
                              </td>
                            )}
                          </tr>
                        ));
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 彈窗：目標設定 */}
      {targetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-800">
                設定 {selectedYear} 年經營會議目標與實績
              </h3>
              <button
                type="button"
                onClick={() => setTargetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTargets} className="space-y-4 text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">全年營運總目標 (NT$)</label>
                <input
                  type="number"
                  value={targetForm.annualTarget}
                  onChange={(e) =>
                    setTargetForm({ ...targetForm, annualTarget: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  placeholder="250000000"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl space-y-2 border">
                  <div className="font-bold text-slate-700">2026/Q1</div>
                  <div>
                    <span className="text-xs text-slate-500">目標：</span>
                    <input
                      type="number"
                      value={targetForm.q1Target}
                      onChange={(e) => setTargetForm({ ...targetForm, q1Target: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded p-1 text-xs font-mono mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">業績：</span>
                    <input
                      type="number"
                      value={targetForm.q1Actual}
                      onChange={(e) => setTargetForm({ ...targetForm, q1Actual: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded p-1 text-xs font-mono mt-0.5"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-2 border">
                  <div className="font-bold text-slate-700">2026/Q2</div>
                  <div>
                    <span className="text-xs text-slate-500">目標：</span>
                    <input
                      type="number"
                      value={targetForm.q2Target}
                      onChange={(e) => setTargetForm({ ...targetForm, q2Target: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded p-1 text-xs font-mono mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">業績：</span>
                    <input
                      type="number"
                      value={targetForm.q2Actual}
                      onChange={(e) => setTargetForm({ ...targetForm, q2Actual: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded p-1 text-xs font-mono mt-0.5"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-2 border">
                  <div className="font-bold text-slate-700">2026/Q3</div>
                  <div>
                    <span className="text-xs text-slate-500">目標：</span>
                    <input
                      type="number"
                      value={targetForm.q3Target}
                      onChange={(e) => setTargetForm({ ...targetForm, q3Target: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded p-1 text-xs font-mono mt-0.5"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">業績：</span>
                    <input
                      type="number"
                      value={targetForm.q3Actual}
                      onChange={(e) => setTargetForm({ ...targetForm, q3Actual: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded p-1 text-xs font-mono mt-0.5"
                    />
                  </div>
                </div>

                <div className="p-3 bg-rose-50 rounded-xl space-y-2 border border-rose-200">
                  <div className="font-bold text-rose-700">2026/{selectedMonth}月 (當前)</div>
                  <div>
                    <span className="text-xs text-rose-600">目標：</span>
                    <input
                      type="number"
                      value={targetForm.currTarget}
                      onChange={(e) => setTargetForm({ ...targetForm, currTarget: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded p-1 text-xs font-mono mt-0.5 border-rose-300"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-rose-600">業績：</span>
                    <input
                      type="number"
                      value={targetForm.currActual}
                      onChange={(e) => setTargetForm({ ...targetForm, currActual: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded p-1 text-xs font-mono mt-0.5 border-rose-300"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setTargetModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold shadow-sm"
                >
                  儲存目標配置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 彈窗：案件階段分類覆寫 */}
      {actionMenuProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="font-bold text-slate-800 truncate pr-2">
                調整分類：{actionMenuProject.projectName}
              </div>
              <button
                type="button"
                onClick={() => setActionMenuProject(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-500">
              客戶：{actionMenuProject.customerName}｜地區：{actionMenuProject.region}｜
              金額：${actionMenuProject.amount ? actionMenuProject.amount.toLocaleString("en-US") : "0"}
            </div>

            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleOverrideSection("SIGNED")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 transition-colors flex items-center justify-between"
              >
                <span>歸類至【已簽約】</span>
                {actionMenuProject.overrideSection === "SIGNED" && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleOverrideSection("ESTIMATING")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 transition-colors flex items-center justify-between"
              >
                <span>歸類至【估價中】</span>
                {actionMenuProject.overrideSection === "ESTIMATING" && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleOverrideSection("QUOTED")}
                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 transition-colors flex items-center justify-between"
              >
                <span>歸類至【已報價】</span>
                {actionMenuProject.overrideSection === "QUOTED" && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleOverrideSection("AUTO")}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 text-slate-500 border border-dashed transition-colors"
              >
                恢復為系統里程碑自動判定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
