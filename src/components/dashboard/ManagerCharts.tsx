"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { SalesWorkloadDTO, StageBottleneckDTO } from "@/types/dto";
import { formatTenThousands } from "@/lib/currency";
import { CUSTOMER_TYPE_LABELS } from "@/lib/constants";

interface SalesWorkloadChartProps {
  data: SalesWorkloadDTO[];
}

export function SalesWorkloadChart({ data }: SalesWorkloadChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">
        目前無符合條件之人員案場負載資料
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
        <XAxis
          xAxisId="total"
          dataKey="salesRepName"
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <XAxis xAxisId="delayed" dataKey="salesRepName" hide />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
          formatter={(value: any, name: any) => [`${value} 案`, name]}
        />
        <Bar xAxisId="total" dataKey="totalProjects" name="總案場數" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar xAxisId="delayed" dataKey="delayedProjects" name="延誤案場數" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface StageBottlenecksChartProps {
  data: StageBottleneckDTO[];
}

export function StageBottlenecksChart({ data }: StageBottlenecksChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
        <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="stageLabel" tick={{ fontSize: 12, fill: "#64748b", fontWeight: "bold" }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
        <Bar dataKey="projectCount" name="停留案場數" fill="#cbd5e1" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.delayedCount > 2 ? "#f87171" : entry.delayedCount > 0 ? "#fbbf24" : "#cbd5e1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface CustomerTypeDistributionChartProps {
  data: Array<{
    type: string;
    label: string;
    count: number;
    totalAmount: number;
  }>;
}

export function CustomerTypeDistributionChart({ data }: CustomerTypeDistributionChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    label: CUSTOMER_TYPE_LABELS[item.type] || item.label,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
          {chartData.map((_, idx) => (
            <Cell key={`bar-${idx}`} fill={idx % 2 === 0 ? "#3b82f6" : "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
