"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Pencil, Plus, Save, ShieldCheck, UserRound, X } from "lucide-react";
import { AppRole, PageAccessKey, PAGE_ACCESS_OPTIONS, ROLE_OPTIONS } from "@/lib/page-access";

type ManagedUser = { id: string; name: string; email: string; role: AppRole };
type RolePermission = { role: AppRole; label: string; pages: PageAccessKey[] };

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

async function responseError(response: Response, fallback: string) {
  if (response.ok) return "";
  const data = await response.json().catch(() => ({}));
  return data.error || fallback;
}

export default function AdminPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("SALES");
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAdminData = async () => {
    setError("");
    try {
      const [usersResponse, permissionsResponse] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/permissions", { cache: "no-store" }),
      ]);
      const usersError = await responseError(usersResponse, "無法載入帳號清單");
      const permissionsError = await responseError(permissionsResponse, "無法載入頁面權限");
      if (usersError) throw new Error(usersError);
      if (permissionsError) throw new Error(permissionsError);
      const [usersData, permissionsData] = await Promise.all([
        usersResponse.json(),
        permissionsResponse.json(),
      ]);
      setUsers(usersData);
      setPermissions(permissionsData.roles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "載入管理資料失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  const resetAccountForm = () => {
    setAccountId("");
    setName("");
    setEmail("");
    setRole("SALES");
  };

  const editAccount = (user: ManagedUser) => {
    setAccountId(user.id);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setNotice("");
    setError("");
  };

  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingAccount(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: accountId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accountId || undefined, name, email, role }),
      });
      const errorMessage = await responseError(response, "儲存帳號失敗");
      if (errorMessage) throw new Error(errorMessage);
      resetAccountForm();
      await loadAdminData();
      setNotice(accountId ? "帳號資料已更新。" : "帳號已新增。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存帳號失敗");
    } finally {
      setSavingAccount(false);
    }
  };

  const togglePermission = (targetRole: AppRole, page: PageAccessKey) => {
    setPermissions((current) => current.map((item) => {
      if (item.role !== targetRole || (targetRole === "ADMIN" && page === "admin")) return item;
      const pages = item.pages.includes(page)
        ? item.pages.filter((currentPage) => currentPage !== page)
        : [...item.pages, page];
      return { ...item, pages };
    }));
  };

  const savePermissions = async () => {
    setSavingPermissions(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: permissions.map(({ role: currentRole, pages }) => ({
          role: currentRole,
          pages,
        })) }),
      });
      const errorMessage = await responseError(response, "儲存頁面權限失敗");
      if (errorMessage) throw new Error(errorMessage);
      setNotice("各層級頁面權限已儲存。");
      await loadAdminData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存頁面權限失敗");
    } finally {
      setSavingPermissions(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><ShieldCheck className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">管理者設定</h1>
          <p className="mt-1 text-sm text-slate-600">管理系統帳號，並設定每個層級可以瀏覽的頁面。</p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <UserRound className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold">新增 / 修改帳號</h2>
        </div>
        <form onSubmit={saveAccount} className="grid gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="account-name" className="mb-1.5 block text-sm font-medium">姓名</label>
            <input id="account-name" required value={name} onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label htmlFor="account-email" className="mb-1.5 block text-sm font-medium">電子郵件（登入帳號）</label>
            <input id="account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label htmlFor="account-role" className="mb-1.5 block text-sm font-medium">帳號層級</label>
            <select id="account-role" value={role} onChange={(event) => setRole(event.target.value as AppRole)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={savingAccount}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {accountId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {savingAccount ? "儲存中..." : accountId ? "更新帳號" : "新增帳號"}
            </button>
            {accountId && <button type="button" onClick={resetAccountForm} aria-label="取消編輯"
              className="rounded-lg border border-slate-300 p-2.5 text-slate-600 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
          </div>
        </form>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr><th className="px-3 py-2 font-semibold">姓名</th><th className="px-3 py-2 font-semibold">電子郵件</th><th className="px-3 py-2 font-semibold">層級</th><th className="px-3 py-2 text-right font-semibold">操作</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 py-3 font-medium text-slate-800">{user.name}</td>
                  <td className="px-3 py-3 text-slate-600">{user.email}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{roleLabel(user.role)}</span></td>
                  <td className="px-3 py-3 text-right">
                    <button type="button" onClick={() => editAccount(user)} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                      <Pencil className="h-3.5 w-3.5" />編輯
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">目前沒有可管理的帳號</td></tr>}
              {loading && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">載入帳號中...</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">登入仍使用系統共用預覽密碼；新增帳號會立即出現在登入清單中。</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-2 flex items-center gap-2">
          <Check className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-bold">各層級可瀏覽頁面</h2>
        </div>
        <p className="mb-5 text-sm text-slate-600">權限同時套用於頁面和相關資料 API；管理者設定僅限管理員，且管理員至少保留一個。</p>
        <div className="space-y-5">
          {permissions.map((item) => (
            <div key={item.role} className="overflow-x-auto rounded-lg border border-slate-200">
              <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold">{item.label}</h3>
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {PAGE_ACCESS_OPTIONS.map((page) => {
                  const checked = item.pages.includes(page.key);
                  const adminPage = page.key === "admin";
                  return (
                    <label key={page.key} className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${checked ? "text-slate-800" : "text-slate-500"} ${adminPage && item.role !== "ADMIN" ? "opacity-50" : ""}`}>
                      <input type="checkbox" checked={checked} disabled={adminPage}
                        onChange={() => togglePermission(item.role, page.key)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                      <span>{page.label}{adminPage && <span className="ml-1 text-xs text-slate-400">（限管理員）</span>}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {!loading && permissions.length === 0 && <p className="text-sm text-slate-500">無法載入權限設定。</p>}
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={savePermissions} disabled={savingPermissions || loading || permissions.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            <Save className="h-4 w-4" />{savingPermissions ? "儲存中..." : "儲存頁面權限"}
          </button>
        </div>
      </section>
    </div>
  );
}
