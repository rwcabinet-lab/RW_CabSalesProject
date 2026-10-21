"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Check,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  UserRound,
  X,
  KeyRound,
  Palette,
  Sliders,
  Calendar,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { AppRole, PageAccessKey, PAGE_ACCESS_OPTIONS, ROLE_OPTIONS } from "@/lib/page-access";
import { DEFAULT_PROJECT_COLUMNS, MILESTONE_STAGE_LABELS, MILESTONE_DEFAULT_DAYS, PHASE_LABELS, normalizeProjectColumns } from "@/lib/constants";
import type { ApiResponse, ColumnItemDTO, MilestoneStageCodeDTO } from "@/types/dto";

type ManagedUser = { id: string; name: string; email: string; role: AppRole };
type RolePermission = { role: AppRole; label: string; pages: PageAccessKey[] };

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
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

  // 更改密碼彈窗
  const [passwordModal, setPasswordModal] = useState<{ open: boolean; user: ManagedUser | null; newPass: string; confirmPass: string }>({
    open: false, user: null, newPass: "", confirmPass: ""
  });
  const [passwordNotice, setPasswordNotice] = useState("");

  // 介面風格設定
  const [themeColor, setThemeColor] = useState<"blue" | "dark" | "emerald" | "amber" | "slate">("blue");
  const [themeDensity, setThemeDensity] = useState<"comfortable" | "compact">("comfortable");

  // 案件清單欄位設定
  const [columns, setColumns] = useState<ColumnItemDTO[]>(DEFAULT_PROJECT_COLUMNS);
  const [savingColumns, setSavingColumns] = useState(false);

  // 階段預設天數設定
  const [stageDays, setStageDays] = useState<Record<string, number>>(MILESTONE_DEFAULT_DAYS);
  const [savingDays, setSavingDays] = useState(false);

  useEffect(() => {
    loadAdminData();
    loadConfigs();
    const savedTheme = localStorage.getItem("app_theme_color") as typeof themeColor;
    if (savedTheme) setThemeColor(savedTheme);
    const savedDensity = localStorage.getItem("app_theme_density") as typeof themeDensity;
    if (savedDensity) setThemeDensity(savedDensity);
  }, []);

  const loadAdminData = async () => {
    setError("");
    try {
      const [usersResponse, permissionsResponse] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/permissions", { cache: "no-store" }),
      ]);
      const [usersData, permissionsData] = await Promise.all([
        usersResponse.json() as Promise<ApiResponse<ManagedUser[]>>,
        permissionsResponse.json() as Promise<ApiResponse<{ roles: RolePermission[] }>>,
      ]);
      setUsers(usersData);
      setPermissions(permissionsData.roles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "載入管理資料失敗");
    } finally {
      setLoading(false);
    }
  };

  const loadConfigs = async () => {
    try {
      const [colRes, dayRes] = await Promise.all([
        fetch("/api/admin/config?key=columns", { cache: "no-store" }),
        fetch("/api/admin/config?key=stageDays", { cache: "no-store" }),
      ]);
      const colData = await colRes.json();
      const dayData = await dayRes.json();
      setColumns(normalizeProjectColumns(colData.columns));
      if (dayData.stageDays) setStageDays(dayData.stageDays);
    } catch (err) {
      console.error("Failed to load configs", err);
    }
  };

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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "儲存帳號失敗");
      resetAccountForm();
      await loadAdminData();
      setNotice(accountId ? "帳號資料已更新。" : "帳號已新增。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存帳號失敗");
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (passwordModal.newPass !== passwordModal.confirmPass) {
      setPasswordNotice("兩次輸入的密碼不一致");
      return;
    }
    if (passwordModal.newPass.length < 4) {
      setPasswordNotice("新密碼長度至少需 4 碼以上");
      return;
    }
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: passwordModal.user?.id,
          newPassword: passwordModal.newPass,
          confirmPassword: passwordModal.confirmPass,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "密碼更新失敗");
      }
      setPasswordNotice("密碼變更成功！下次登入即生效。");
      setTimeout(() => {
        setPasswordModal({ open: false, user: null, newPass: "", confirmPass: "" });
        setPasswordNotice("");
      }, 1200);
    } catch (err) {
      setPasswordNotice(err instanceof Error ? err.message : "儲存密碼失敗");
    }
  };

  const handleApplyTheme = (color: typeof themeColor, density: typeof themeDensity) => {
    setThemeColor(color);
    setThemeDensity(density);
    localStorage.setItem("app_theme_color", color);
    localStorage.setItem("app_theme_density", density);

    // 即時動態套用至 document.documentElement 與 document.body
    const themeClasses = ["theme-blue", "theme-emerald", "theme-amber", "theme-slate", "theme-dark"];
    document.documentElement.classList.remove(...themeClasses);
    document.body.classList.remove(...themeClasses);
    if (color !== "blue") {
      document.documentElement.classList.add(`theme-${color}`);
      document.body.classList.add(`theme-${color}`);
    }

    if (density === "compact") {
      document.documentElement.classList.add("density-compact");
      document.body.classList.add("density-compact");
    } else {
      document.documentElement.classList.remove("density-compact");
      document.body.classList.remove("density-compact");
    }

    setNotice(`已即時套用【${color === "blue" ? "經典藍" : color === "dark" ? "暗黑極簡" : color === "emerald" ? "森林綠" : color === "amber" ? "暖陽金" : "質樸灰"}】與【${density === "comfortable" ? "寬鬆版面" : "緊湊版面"}】風格！`);
  };

  // 欄位開關與上移下移
  const toggleColumnVisible = (key: string) => {
    setColumns((cols) =>
      cols.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const newCols = [...columns];
    const temp = newCols[index];
    newCols[index] = newCols[targetIndex];
    newCols[targetIndex] = temp;
    // 重設 order
    newCols.forEach((c, idx) => (c.order = idx));
    setColumns(newCols);
  };

  const saveColumnsConfig = async () => {
    setSavingColumns(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "project_columns", value: columns }),
      });
      if (!res.ok) throw new Error("儲存欄位設定失敗");
      const result = await res.json() as { columns?: ColumnItemDTO[] };
      if (Array.isArray(result.columns)) setColumns(result.columns);
      setNotice("案件清單顯示項目與順序已成功儲存至全域設定！");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存欄位設定失敗");
    } finally {
      setSavingColumns(false);
    }
  };

  const saveStageDaysConfig = async () => {
    setSavingDays(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "milestone_default_days", value: stageDays }),
      });
      if (!res.ok) throw new Error("儲存預設天數失敗");
      setNotice("各階段進度預設天數已成功更新！");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存預設天數失敗");
    } finally {
      setSavingDays(false);
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
      if (!response.ok) throw new Error("儲存頁面權限失敗");
      setNotice("各層級頁面權限已儲存。");
      await loadAdminData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存頁面權限失敗");
    } finally {
      setSavingPermissions(false);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-100 p-3 text-blue-700"><ShieldCheck className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">管理者與系統設定</h1>
          <p className="mt-1 text-sm text-slate-600">管理帳號密碼、全域案件清單欄位順序、各階段預設天數及介面風格風格。</p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {/* 1. 案件清單全域欄位設定 (主管監控室即時表格樣式，支援拖曳與顯隱) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold">案件清單欄位項目與順序（全域表格視圖調整）</h2>
          </div>
          <button
            type="button"
            onClick={saveColumnsConfig}
            disabled={savingColumns}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingColumns ? "儲存中..." : "儲存欄位設定"}
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          以主管監控室表格樣式預覽。您可以點擊表頭的 <b>👁️ 圖示</b> 開關欄位顯示，或點擊 <b>◀ / ▶ 箭頭或直接拖曳表頭</b> 調整欄位左右順序。儲存後工作台與主管看板將同步套用。
        </p>

        {/* 模擬即時預覽表格 */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {columns.map((col, idx) => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", idx.toString())}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIdx = Number(e.dataTransfer.getData("text/plain"));
                      if (!isNaN(fromIdx) && fromIdx !== idx) {
                        const newCols = [...columns];
                        const [moved] = newCols.splice(fromIdx, 1);
                        newCols.splice(idx, 0, moved);
                        newCols.forEach((c, i) => (c.order = i));
                        setColumns(newCols);
                      }
                    }}
                    className={`p-3 border-r border-slate-200 transition cursor-grab active:cursor-grabbing select-none ${
                      col.visible ? "bg-white text-slate-800" : "bg-slate-100/70 text-slate-400 line-through"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-bold flex items-center gap-1">
                        ⋮⋮ {col.label}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleColumnVisible(col.key)}
                          className="p-1 hover:text-blue-600 rounded"
                          title={col.visible ? "點擊隱藏此欄位" : "點擊顯示此欄位"}
                        >
                          {col.visible ? <Eye className="h-3.5 w-3.5 text-blue-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                        </button>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveColumn(idx, "up")}
                          className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20"
                          title="向左移動"
                        >
                          ◀
                        </button>
                        <button
                          type="button"
                          disabled={idx === columns.length - 1}
                          onClick={() => moveColumn(idx, "down")}
                          className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20"
                          title="向右移動"
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              <tr className="hover:bg-slate-50 text-slate-600">
                {columns.map((col) => {
                  if (!col.visible) {
                    return (
                      <td key={col.key} className="p-3 border-r text-center text-slate-300 italic bg-slate-50/50">
                        (已隱藏)
                      </td>
                    );
                  }
                  switch (col.key) {
                    case "trafficLight":
                      return (
                        <td key={col.key} className="p-3 border-r">
                          <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 text-[11px]">
                            ● 剩 5 天
                          </span>
                        </td>
                      );
                    case "projectName":
                      return (
                        <td key={col.key} className="p-3 border-r font-bold text-slate-900">
                          樣品案場 A
                          <div className="text-[10px] text-slate-400 font-normal">台北市大安區新生南路</div>
                        </td>
                      );
                    case "customer":
                      return (
                        <td key={col.key} className="p-3 border-r">
                          隆美興業 <span className="text-[10px] bg-blue-50 text-blue-700 px-1 rounded font-semibold">8.5折</span>
                        </td>
                      );
                    case "salesRep":
                      return (
                        <td key={col.key} className="p-3 border-r">
                          林宏遠 / 張育菁
                        </td>
                      );
                    case "stageProgress":
                      return (
                        <td key={col.key} className="p-3 border-r font-bold text-slate-700">
                          設計提案/報價/簽約
                          <div className="mt-1 text-[10px] font-normal text-slate-500">報價單</div>
                        </td>
                      );
                    case "quoteAndUnits":
                    case "amount":
                      return (
                        <td key={col.key} className="p-3 border-r">
                          <div className="font-bold text-slate-900">$38.5 萬</div>
                          <div className="text-[10px] text-slate-400">2 戶</div>
                        </td>
                      );
                    case "unitCount":
                      return null;
                    case "expectedDate":
                      return (
                        <td key={col.key} className="p-3 border-r">
                          2026-11-30
                        </td>
                      );
                    case "actions":
                      return (
                        <td key={col.key} className="p-3 border-r text-center">
                          <span className="px-2 py-1 rounded bg-slate-100 font-bold text-slate-600">操作鈕</span>
                        </td>
                      );
                    default:
                      return <td key={col.key} className="p-3 border-r">-</td>;
                  }
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. 各階段預設天數設定 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold">各階段進度預設天數設定</h2>
          </div>
          <button
            type="button"
            onClick={saveStageDaysConfig}
            disabled={savingDays}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingDays ? "儲存中..." : "儲存預設天數"}
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          設定新建立案場時自動計算預定完成日的標準作業天數，各案場細節內仍可自行手動覆蓋修改。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Object.entries(MILESTONE_STAGE_LABELS)
            .filter(([code]) => code !== "X-2")
            .map(([code, label]) => (
            <div key={code} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-700 truncate" title={label}>
                [{code}] {label}
              </span>
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={stageDays[code] ?? 3}
                  onChange={(e) =>
                    setStageDays({ ...stageDays, [code]: Number(e.target.value) || 1 })
                  }
                  className="w-16 rounded border border-slate-300 px-2 py-1 text-xs text-center font-bold"
                />
                <span className="text-xs text-slate-500">天</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 介面風格多樣化選擇 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-bold">系統介面風格自訂</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          切換主題色彩與畫面佈局密度，偏好設定將儲存於此瀏覽器。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">主題色彩</label>
            <div className="flex flex-wrap gap-3">
              {[
                { id: "blue", label: "經典藍 (預設)", bg: "bg-blue-600" },
                { id: "emerald", label: "森林綠", bg: "bg-emerald-600" },
                { id: "amber", label: "暖陽橘", bg: "bg-amber-600" },
                { id: "slate", label: "質樸灰", bg: "bg-slate-700" },
                { id: "dark", label: "極簡深色", bg: "bg-slate-900" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleApplyTheme(t.id as any, themeDensity)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${
                    themeColor === t.id ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full ${t.bg}`} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">版面顯示密度</label>
            <div className="flex gap-3">
              {[
                { id: "comfortable", label: "寬鬆舒適" },
                { id: "compact", label: "緊湊精簡" },
              ].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleApplyTheme(themeColor, d.id as any)}
                  className={`px-4 py-2 rounded-lg border text-xs font-semibold ${
                    themeDensity === d.id ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. 帳號管理與更改密碼 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <UserRound className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold">帳號清單與權限設定</h2>
        </div>
        <form onSubmit={saveAccount} className="grid gap-4 md:grid-cols-4">
          <div>
            <label htmlFor="account-name" className="mb-1.5 block text-sm font-medium">姓名</label>
            <input id="account-name" required value={name} onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label htmlFor="account-email" className="mb-1.5 block text-sm font-medium">電子郵件（登入帳號）</label>
            <input id="account-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label htmlFor="account-role" className="mb-1.5 block text-sm font-medium">帳號層級</label>
            <select id="account-role" value={role} onChange={(event) => setRole(event.target.value as AppRole)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500">
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
              className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
          </div>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">姓名</th>
                <th className="px-3 py-2 font-semibold">電子郵件</th>
                <th className="px-3 py-2 font-semibold">層級</th>
                <th className="px-3 py-2 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3 font-medium text-slate-800">{user.name}</td>
                  <td className="px-3 py-3 text-slate-600">{user.email}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{roleLabel(user.role)}</span></td>
                  <td className="px-3 py-3 text-right flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPasswordModal({ open: true, user, newPass: "", confirmPass: "" })}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100"
                    >
                      <KeyRound className="h-3.5 w-3.5" />改密碼
                    </button>
                    <button type="button" onClick={() => editAccount(user)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                      <Pencil className="h-3.5 w-3.5" />編輯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. 各層級可瀏覽頁面 */}
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
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={savePermissions} disabled={savingPermissions || loading || permissions.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            <Save className="h-4 w-4" />{savingPermissions ? "儲存中..." : "儲存頁面權限"}
          </button>
        </div>
      </section>

      {/* 更改密碼 Modal */}
      {passwordModal.open && passwordModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-900">
                <KeyRound className="h-5 w-5 text-amber-600" />
                變更密碼 — {passwordModal.user.name}
              </h3>
              <button
                type="button"
                onClick={() => setPasswordModal({ open: false, user: null, newPass: "", confirmPass: "" })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSavePassword} className="space-y-3 text-sm">
              <p className="text-xs text-slate-500 bg-amber-50 p-2.5 rounded border border-amber-200">
                目前系統共用登入密碼為 <b>0000</b>，在此可設定使用者專屬密碼。
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">新密碼</label>
                <input
                  type="password"
                  required
                  placeholder="請輸入新密碼 (預設: 0000)"
                  value={passwordModal.newPass}
                  onChange={(e) => setPasswordModal({ ...passwordModal, newPass: e.target.value })}
                  className="w-full rounded border border-slate-300 p-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">確認新密碼</label>
                <input
                  type="password"
                  required
                  placeholder="再次輸入新密碼"
                  value={passwordModal.confirmPass}
                  onChange={(e) => setPasswordModal({ ...passwordModal, confirmPass: e.target.value })}
                  className="w-full rounded border border-slate-300 p-2 text-sm outline-none focus:border-amber-500"
                />
              </div>
              {passwordNotice && (
                <p className="text-xs font-bold text-emerald-600">{passwordNotice}</p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setPasswordModal({ open: false, user: null, newPass: "", confirmPass: "" })}
                  className="rounded px-3 py-1.5 bg-slate-200 text-slate-700 font-semibold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded px-4 py-1.5 bg-amber-600 text-white font-bold hover:bg-amber-700 shadow"
                >
                  儲存變更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
