"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Kanban, HardHat, LogOut, Settings } from "lucide-react";
import { PageAccessKey } from "@/lib/page-access";
import type { ApiResponse } from "@/types/dto";

const navItems = [
  { key: "workbench", href: "/dashboard/workbench", label: "業務工作台", icon: LayoutDashboard },
  { key: "manager", href: "/dashboard/manager", label: "主管監控看板", icon: Kanban },
  { key: "views", href: "/views", label: "多元可視化", icon: HardHat },
  { key: "customers", href: "/customers", label: "客戶主檔", icon: Users },
  { key: "admin", href: "/admin", label: "管理者設定", icon: Settings },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{
    id: string;
    name: string;
    role: string;
    accessiblePages: PageAccessKey[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.ok
        ? response.json() as Promise<ApiResponse<{
            user: {
              id: string;
              name: string;
              role: string;
              accessiblePages: PageAccessKey[];
            } | null;
          }>>
        : null)
      .then((data) => setUser(data?.user || null))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const roleLabel = user?.role === "ADMIN" ? "管理員" : user?.role === "LEVEL_MANAGER" ? "理級主管" : user?.role === "SALES_MANAGER" ? "業務主管" : user?.role === "ASSISTANT" ? "業務助理" : user ? "業務專員" : "未登入";

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm no-print">
      <div className="max-w-7xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white shadow-md">
            <HardHat className="w-5 h-5" />
          </div>
          <Link href="/" className="font-black text-base text-slate-900 tracking-tight flex items-center gap-2">
            系統櫃工廠
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
              業務時程追蹤系統
            </span>
          </Link>
        </div>

        {/* 導覽連結 — 使用 prefetch 消除首次點擊延遲 */}
        <nav className="flex items-center space-x-0.5 sm:space-x-1">
          {navItems.filter((item) => user?.accessiblePages.includes(item.key)).map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 使用者資訊 */}
        <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l border-slate-200">
          <div className="hidden sm:flex w-8 h-8 rounded-full bg-slate-800 text-white items-center justify-center text-xs font-bold shadow">
            {user?.name?.slice(0, 1) || "?"}
          </div>
          <div className="hidden sm:block text-xs text-right">
            <div className="font-semibold text-slate-800">{user?.name || "未登入"}</div>
            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 rounded">
              {roleLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="登出"
            aria-label="登出"
            className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
