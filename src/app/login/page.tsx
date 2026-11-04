"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LogIn, Loader2, User } from "lucide-react";
import type { ApiResponse } from "@/types/dto";

export default function LoginPage() {
  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNo = employeeNo.trim();
    if (!trimmedNo) {
      setError("請輸入員工編號（五碼工號）");
      return;
    }
    if (!password) {
      setError("請輸入密碼");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeNo: trimmedNo, password }),
      });
      const data = (await response.json()) as ApiResponse<{ redirectTo?: string }>;
      if (!response.ok) throw new Error(data.error || "登入失敗，請確認員工編號與密碼");
      setRedirecting(true);
      window.location.href = data.redirectTo || "/dashboard/workbench";
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登入失敗");
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-slate-900 px-8 py-8 text-white">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-white p-1.5 shadow-md">
            <img src="/logo.png" alt="正道工業系統櫃事業部" className="h-full w-full object-contain" />
          </div>
          <p className="text-xs font-semibold text-blue-300 tracking-wider">正道工業系統櫃事業部</p>
          <h1 className="mt-1 text-2xl font-bold">業務時程追蹤系統</h1>
          <p className="mt-2 text-sm text-slate-300">登入以繼續使用工作台</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-8">
          <div>
            <label htmlFor="login-employee-no" className="mb-1.5 block text-sm font-semibold text-slate-700">
              員工編號
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-employee-no"
                type="text"
                required
                autoFocus
                placeholder="請輸入大成或正道的五碼工號"
                autoComplete="username"
                value={employeeNo}
                disabled={submitting}
                onChange={(event) => {
                  setEmployeeNo(event.target.value);
                  if (error) setError("");
                }}
                className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3 text-sm font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
              密碼
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-password"
                type="password"
                required
                placeholder="請輸入密碼"
                autoComplete="current-password"
                value={password}
                disabled={submitting}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError("");
                }}
                className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {redirecting ? "登入成功，跳轉中..." : "登入驗證中..."}
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" /> 登入
              </>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
