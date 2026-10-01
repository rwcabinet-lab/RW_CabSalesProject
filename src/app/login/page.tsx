"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, LogIn } from "lucide-react";

type LoginUser = { id: string; name: string; role: string };

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("0000");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await fetch("/api/auth/users");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "無法載入使用者");
        setUsers(data);
        if (data.length > 0) setUserId(data[0].id);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "無法載入使用者");
      } finally {
        setLoadingUsers(false);
      }
    }
    loadUsers();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登入失敗");
      router.replace("/dashboard/workbench");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登入失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-slate-900 px-8 py-8 text-white">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <Building2 className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold uppercase text-blue-300">Cabinet Factory</p>
          <h1 className="mt-1 text-2xl font-bold">業務時程追蹤系統</h1>
          <p className="mt-2 text-sm text-slate-300">登入以繼續使用工作台</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-8">
          <div>
            <label htmlFor="login-user" className="mb-1.5 block text-sm font-semibold text-slate-700">使用者</label>
            <select
              id="login-user"
              required
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              disabled={loadingUsers || users.length === 0}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
            >
              {loadingUsers && <option value="">載入使用者中...</option>}
              {!loadingUsers && users.length === 0 && <option value="">沒有可用使用者</option>}
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">密碼</label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting || loadingUsers || users.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" /> {submitting ? "登入中..." : "登入"}
          </button>
        </form>
      </section>
    </main>
  );
}
