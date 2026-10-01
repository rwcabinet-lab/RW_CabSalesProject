import Link from "next/link";
import { Users, LayoutDashboard, Kanban, ArrowRight, CheckCircle2, ShieldAlert, Sparkles, Building2 } from "lucide-react";
import { INITIAL_PROJECTS, INITIAL_CUSTOMERS } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <div className="space-y-8 py-2">
      {/* 歡迎 Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-300 border border-blue-400/30">
            <Sparkles className="w-3.5 h-3.5" /> 系統櫃工廠前段業務數位化賦能
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            系統櫃工廠業務報價與時程追蹤系統
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            整合「三層式櫃體元件拆解算價引擎」、「B2B/B2C 折率自動核算」、「五大里程碑時程警示」與「主管全局監控」，徹底告別傳統紙本手稿與 Excel 錯漏。
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/customers"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold border border-white/20 transition"
            >
              <Users className="w-4 h-4" /> 客戶主檔 (B2B/B2C)
            </Link>
          </div>
        </div>
      </div>

      {/* 核心模組快捷入口 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 客戶管理 */}
        <Link
          href="/customers"
          className="group relative rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-400 transition duration-200"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <Users className="w-6 h-6" />
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              主檔管理
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-600 transition">
            客戶主檔管理 (B2B / B2C)
          </h3>
          <p className="text-xs text-slate-600 mt-2 line-clamp-3">
            支援隆美、設計公司、經銷公司、工廠、建設/營造、一般消費者與公關案，並設定預設折率、付款條件與統一編號。
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-emerald-600 gap-1">
            查看現有客戶名冊 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>

        {/* 案場狀態 */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md">
                <Building2 className="w-6 h-6" />
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">
                進行中案場
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              案場快速導覽
            </h3>
            <div className="mt-3 space-y-2">
              {INITIAL_PROJECTS.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded bg-slate-50 border border-slate-100">
                  <div className="truncate max-w-[180px] font-medium text-slate-800">{p.projectName}</div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    p.isDelayed ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {p.currentStage}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
            <span>共有 {INITIAL_PROJECTS.length} 個進行中案場</span>
            <Link href="/dashboard/workbench" className="text-blue-600 font-semibold hover:underline">
              開啟業務工作台
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
