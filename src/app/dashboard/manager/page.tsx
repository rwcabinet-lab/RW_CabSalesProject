"use client";

import { useState, useEffect } from "react";
import { Users, Kanban, LayoutDashboard, Clock, CheckCircle2, TrendingUp, Sparkles, AlertCircle, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Link from "next/link";

interface ManagerDashboardData {
  kpi: { totalProjects: number; signedTotal: number; conversionRate: number; delayedCount: number; };
  alertList: any[];
  salesWorkload: any[];
  stageBottlenecks: any[];
  allProjectsOverview: any[];
}

interface AssignableUser {
  id: string;
  name: string;
  role: "SALES" | "ASSISTANT";
}

export default function ManagerDashboardPage() {
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // 過濾條件
  const [monthFilter, setMonthFilter] = useState("");
  const [timeStandard, setTimeStandard] = useState("");

  // 任務指派
  const [assignModal, setAssignModal] = useState<{ open: boolean; projectId: string; projectName: string; userId: string; subject: string }>({
    open: false, projectId: "", projectName: "", userId: "", subject: ""
  });
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, [monthFilter]); // 只將 monthFilter 送入 API，timeStandard 給前端過濾用

  useEffect(() => {
    fetch("/api/auth/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("無法載入指派人員");
        return res.json();
      })
      .then((users: { id: string; name: string; role: string }[]) => {
        setAssignableUsers(users.filter((user): user is AssignableUser =>
          user.role === "SALES" || user.role === "ASSISTANT"
        ));
      })
      .catch((err) => {
        console.error(err);
        setAssignableUsers([]);
      });
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dashboard/manager${monthFilter ? `?month=${monthFilter}` : ""}`);
      const json = await res.json();
      if (!res.ok || !json.kpi || !Array.isArray(json.allProjectsOverview)) {
        throw new Error(json.error || "無法取得主管看板資料");
      }
      setData(json);
      setLoadError("");
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "無法取得主管看板資料");
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true);
    try {
      const res = await fetch("/api/dashboard/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: assignModal.projectId,
          assignedToId: assignModal.userId,
          subject: assignModal.subject,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "指派任務失敗");
      setAssignModal({ open: false, projectId: "", projectName: "", userId: "", subject: "" });
      alert("指派成功！");
    } catch (err) {
      alert(err instanceof Error ? err.message : "指派任務失敗");
    } finally {
      setAssigning(false);
    }
  };

  if (loading && !data) return <div className="p-16 text-center">載入主管看板中...</div>;
  if (loadError && !data) return <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>;
  if (!data) return null;

  // 案場總覽前端二次過濾 (大階段過濾)
  const filteredOverview = data.allProjectsOverview.filter(p => {
    if (timeStandard && p.currentStage !== timeStandard) return false;
    return true;
  });

  return (
    <div className="space-y-8 pb-16">
      <div className="flex justify-between border-b pb-4">
        <div>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">主管監控看板</span>
          <h1 className="text-2xl font-black mt-1">營運總覽與瓶頸分析</h1>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-slate-500 text-xs font-bold mb-1">進行中總案場數</div>
          <div className="text-3xl font-black">{data.kpi.totalProjects}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-slate-500 text-xs font-bold mb-1">已簽約/生產預估總額</div>
          <div className="text-3xl font-black">NT$ {data.kpi.signedTotal.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-slate-500 text-xs font-bold mb-1">成交推進率</div>
          <div className="text-3xl font-black">{data.kpi.conversionRate}%</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col justify-center border-l-4 border-l-red-500">
          <div className="text-red-600 text-xs font-bold mb-1">嚴重延誤/逾期案場</div>
          <div className="text-3xl font-black text-red-600">{data.kpi.delayedCount}</div>
        </div>
      </div>

      {/* 恢復：圖表區塊 (人員負載與階段瓶頸) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 人員案場負載與異常分佈 */}
        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 className="text-base font-bold flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-blue-600" />
            人員案場負載與異常分佈
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.salesWorkload} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="salesRepName" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                <Bar dataKey="totalProjects" name="總案場數" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="delayedProjects" name="延誤案場數" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 案件階段分佈與卡關瓶頸 */}
        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 className="text-base font-bold flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            案件階段分佈與卡關瓶頸
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stageBottlenecks} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="stageLabel" tick={{ fontSize: 12, fill: "#64748b", fontWeight: "bold" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
                <Bar dataKey="projectCount" name="停留案場數" fill="#cbd5e1" radius={[0, 4, 4, 0]}>
                  {data.stageBottlenecks.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.delayedCount > 2 ? "#f87171" : entry.delayedCount > 0 ? "#fbbf24" : "#cbd5e1"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 新增的所有案件狀態總覽區域 */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2"><LayoutDashboard className="w-5 h-5 text-blue-600"/> 所有案件狀態總覽</h2>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <label className="flex items-center gap-2">
              月份：<input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="border rounded px-2 py-1" />
            </label>
            <label className="flex items-center gap-2">
              階段標準：
              <select value={timeStandard} onChange={(e) => setTimeStandard(e.target.value)} className="border rounded px-2 py-1">
                <option value="">全部</option>
                <option value="CONTACT">接洽期</option>
                <option value="DESIGN">設計確認期</option>
                <option value="PRODUCTION">生產施工期</option>
                <option value="CLOSED">結案</option>
              </select>
            </label>
          </div>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3">狀態</th><th className="p-3">案場</th><th className="p-3">業務/業助</th><th className="p-3">階段/進度</th><th className="p-3">預計完成日</th><th className="p-3 text-center">指派任務</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredOverview.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full font-bold ${p.trafficLight.color==="RED"?"bg-red-100 text-red-700":p.trafficLight.color==="YELLOW"?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700"}`}>
                    ● {p.trafficLight.label}
                  </span>
                </td>
                <td className="p-3 font-bold">{p.projectName}</td>
                <td className="p-3">{p.salesRepName} / {p.salesAssistantName || "-"}</td>
                <td className="p-3 font-bold text-slate-700">{p.currentStageLabel} - {p.activeMilestoneName}</td>
                <td className="p-3">{p.expectedDate || "-"}</td>
                <td className="p-3 text-center">
                  <button onClick={() => setAssignModal({ open: true, projectId: p.id, projectName: p.projectName, userId: "", subject: "" })} className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow hover:bg-blue-700">指派任務</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 指派任務 Modal */}
      {assignModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white p-6 rounded-xl w-96 shadow-2xl">
            <h3 className="font-bold mb-4 flex items-center gap-2"><Sparkles className="text-blue-600 w-5 h-5"/> 指派任務 - {assignModal.projectName}</h3>
            <form onSubmit={handleAssignTask} className="space-y-3 text-sm">
              <label className="block font-semibold">指派對象
                <select required value={assignModal.userId} onChange={e=>setAssignModal({...assignModal, userId: e.target.value})} className="w-full border p-2 mt-1 rounded">
                  <option value="">選擇人員</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role === "SALES" ? "業務" : "業助"})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-semibold">任務要求/主題
                <textarea required rows={3} value={assignModal.subject} onChange={e=>setAssignModal({...assignModal, subject: e.target.value})} className="w-full border p-2 mt-1 rounded" placeholder="例如：請盡速確認客戶廚具圖面"/>
              </label>
              <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={()=>setAssignModal({...assignModal,open:false})} className="px-4 py-2 bg-slate-200 rounded font-bold">取消</button><button disabled={assigning} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">{assigning ? "傳送中..." : "確認指派"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
