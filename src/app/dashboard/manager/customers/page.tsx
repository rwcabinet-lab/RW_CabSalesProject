"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Users, Building2, TrendingUp, Search, Filter, ArrowUpDown, CheckCircle2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

import type { CustomerStatItemDTO as CustomerStatItem, CustomerStatsDashboardDTO as CustomerStatsData } from "@/types/dto";
import { useManagerCustomerStatsQuery } from "@/hooks/useQueries";

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  LONGMEI_STORE: "隆美",
  CABINET_FACTORY: "工廠",
  DESIGN_COMPANY: "設計公司",
  DEALER_COMPANY: "經銷公司",
  CONSTRUCTION: "建設／營造",
  LABOR_MATERIAL: "連工帶料",
  INDIVIDUAL: "一般消費者",
  DESIGNER: "設計師",
  CONTRACTOR: "統包／營造",
  PR: "公關客戶",
  DEALER: "經銷商",
  HOMEOWNER: "一般消費者",
  DIRECT: "直接業主",
  OTHER: "其他",
};

function formatTenThousands(amount: number) {
  if (!amount) return "$0";
  const inTenThousands = amount / 10000;
  return `$${inTenThousands.toLocaleString("zh-TW", {
    minimumFractionDigits: inTenThousands % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })} 萬`;
}

export default function CustomerStatsPage() {
  const { data, isLoading: loading } = useManagerCustomerStatsQuery();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [sortBy, setSortBy] = useState<"projects" | "amount" | "signedAmount" | "name">("projects");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const salesOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.customers.map((c) => c.salesRepName).filter(Boolean))).sort();
  }, [data]);

  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    return data.customers.filter((c) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesTaxId = c.taxId.includes(query);
        const matchesPhone = c.phone.includes(query);
        if (!matchesName && !matchesTaxId && !matchesPhone) return false;
      }
      if (typeFilter && c.customerType !== typeFilter) return false;
      if (salesFilter && c.salesRepName !== salesFilter) return false;
      return true;
    });
  }, [data, searchQuery, typeFilter, salesFilter]);

  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      let comparison = 0;
      if (sortBy === "projects") {
        comparison = a.totalProjects - b.totalProjects;
      } else if (sortBy === "signedAmount") {
        comparison = (a.totalSignedAmount || 0) - (b.totalSignedAmount || 0);
      } else if (sortBy === "amount") {
        comparison = a.totalQuoteAmount - b.totalQuoteAmount;
      } else {
        comparison = a.name.localeCompare(b.name, "zh-Hant");
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });
  }, [filteredCustomers, sortBy, sortOrder]);

  const totalFilteredAmount = useMemo(() => {
    return sortedCustomers.reduce((sum, c) => sum + c.totalQuoteAmount, 0);
  }, [sortedCustomers]);

  const toggleSort = (field: "projects" | "amount" | "signedAmount" | "name") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        載入客戶統計資料中...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-red-500">
        無法載入客戶統計資料
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* 頂部導覽列 */}
      <div className="flex flex-wrap justify-between items-center border-b pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
              主管監控室
            </span>
          </div>
          <h1 className="text-2xl font-black mt-1">客戶資料統計與分析</h1>
        </div>

        {/* 標籤頁切換 */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <Link
            href="/dashboard/manager"
            className="px-4 py-2 text-sm font-bold rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
          >
            營運總覽與瓶頸分析
          </Link>
          <div className="px-4 py-2 text-sm font-bold rounded-lg bg-white text-blue-600 shadow-sm">
            客戶資料統計
          </div>
        </div>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <div className="text-slate-500 text-xs font-bold mb-1 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-blue-500" />
            總客戶數
          </div>
          <div className="text-3xl font-black text-slate-800">{data.kpi.totalCustomers}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <div className="text-slate-500 text-xs font-bold mb-1 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            合作進行中客戶
          </div>
          <div className="text-3xl font-black text-blue-600">
            {data.kpi.activeCustomerCount}
            <span className="text-xs text-slate-400 font-normal ml-2">
              (佔比 {Math.round((data.kpi.activeCustomerCount / (data.kpi.totalCustomers || 1)) * 100)}%)
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <div className="text-slate-500 text-xs font-bold mb-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            累計成交總額
          </div>
          <div className="text-3xl font-black text-emerald-600 tabular-nums">
            {formatTenThousands(data.kpi.totalSignedSum || 0)}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border shadow-sm">
          <div className="text-slate-500 text-xs font-bold mb-1 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            客戶案場報價總額
          </div>
          <div className="text-3xl font-black text-indigo-600 tabular-nums">
            {formatTenThousands(data.kpi.totalQuoteSum)}
          </div>
        </div>
      </div>

      {/* 客戶類型分佈圖表 */}
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <h3 className="text-base font-bold flex items-center gap-2 mb-4 text-slate-800">
          <Users className="w-5 h-5 text-blue-600" />
          客戶類型與案場金額分佈
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.customerTypeDistribution.map((item) => ({
                ...item,
                label: CUSTOMER_TYPE_LABELS[item.type] || item.label,
              }))}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
            >
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                formatter={(value: any, name: any) => {
                  if (name === "客戶數量") return [`${value} 家`, name];
                  return [formatTenThousands(Number(value)), name];
                }}
                contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
              />
              <Bar dataKey="count" name="客戶數量" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                {data.customerTypeDistribution.map((entry, idx) => (
                  <Cell key={`bar-${idx}`} fill={idx % 2 === 0 ? "#3b82f6" : "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 客戶列表與篩選 */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        {/* 工具列 */}
        <div className="bg-slate-50 px-6 py-4 border-b flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-800">客戶清單與案場彙整</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {/* 搜尋 */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜尋客戶名稱/統編/電話..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 客戶類型 */}
            <label className="flex items-center gap-1.5 font-semibold text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              類型：
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="">全部類型</option>
                {data.customerTypeDistribution.map((t) => (
                  <option key={t.type} value={t.type}>
                    {CUSTOMER_TYPE_LABELS[t.type] || t.label} ({t.count})
                  </option>
                ))}
              </select>
            </label>

            {/* 負責業務 */}
            <label className="flex items-center gap-1.5 font-semibold text-slate-600">
              業務：
              <select
                value={salesFilter}
                onChange={(e) => setSalesFilter(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="">全部業務</option>
                {salesOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* 篩選結果摘要 */}
        <div className="px-6 py-2.5 bg-blue-50/50 border-b flex justify-between items-center text-xs text-blue-900 font-semibold">
          <div>
            篩選結果：共 <span className="text-sm font-bold text-blue-700">{sortedCustomers.length}</span> 家客戶，案場報價總額{" "}
            <span className="text-sm font-bold text-blue-700">NT$ {totalFilteredAmount.toLocaleString()}</span>
          </div>
          <div className="text-slate-500 font-normal">
            點擊表頭欄位可切換排序
          </div>
        </div>

        {/* 表格 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b text-xs">
              <tr>
                <th
                  className="px-6 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    客戶名稱
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3">客戶類型</th>
                <th className="px-4 py-3">負責業務</th>
                <th className="px-4 py-3 text-right">預設折數</th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort("projects")}
                >
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1">
                      案場統計
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                    <span className="text-[11px] font-normal text-slate-400">總數(進度/結案/流標)</span>
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort("signedAmount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    累計成交總額
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => toggleSort("amount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    累計報價總額
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-6 py-3">最新案場</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {sortedCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">
                    <div>{c.name}</div>
                    <div className="text-xs font-normal text-slate-400 mt-0.5">
                      {c.phone ? `☎ ${c.phone}` : ""} {c.taxId ? `｜統編: ${c.taxId}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                      {CUSTOMER_TYPE_LABELS[c.customerType] || c.customerTypeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-800">
                    {c.salesRepName || "-"}
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-slate-600">
                    {c.defaultDiscount ? `${c.defaultDiscount} 折` : "無"}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold">
                    <span className="text-slate-900">{c.totalProjects}</span>
                    <span className="text-xs text-slate-400 block sm:inline sm:ml-1">
                      (
                      <span className="text-blue-600">{c.activeProjects}</span>/
                      <span className="text-emerald-600">{c.closedProjects}</span>/
                      <span className="text-red-500">{c.lostProjects}</span>
                      )
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-bold text-emerald-600 tabular-nums">
                    {c.totalSignedAmount > 0 ? formatTenThousands(c.totalSignedAmount) : "-"}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900 tabular-nums">
                    {c.totalQuoteAmount > 0 ? formatTenThousands(c.totalQuoteAmount) : "-"}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {c.latestProjectName ? (
                      <span className="font-medium text-slate-800 truncate max-w-[200px] block">
                        {c.latestProjectName}
                      </span>
                    ) : (
                      <span className="text-slate-400">尚無案場</span>
                    )}
                  </td>
                </tr>
              ))}
              {sortedCustomers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">
                    沒有符合篩選條件的客戶資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
