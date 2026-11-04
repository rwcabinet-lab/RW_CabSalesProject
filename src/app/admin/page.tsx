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
  Sliders,
  Calendar,
  FastForward,
  Eye,
  EyeOff,
  History,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { AppRole, PageAccessKey, PAGE_ACCESS_OPTIONS, ROLE_OPTIONS } from "@/lib/page-access";
import {
  DEFAULT_PROJECT_COLUMNS,
  MILESTONE_STAGE_LABELS,
  MILESTONE_DEFAULT_DAYS,
  PHASE_LABELS,
  normalizeProjectColumns,
  CUSTOMER_TYPE_START_STAGE_CODES,
  STANDARD_MILESTONE_STAGE_CODES,
} from "@/lib/constants";
import { SectionHelpButton } from "@/components/common/SectionHelpButton";
import type { ApiResponse, ColumnItemDTO, MilestoneStageCodeDTO, LoginRecordDTO } from "@/types/dto";

type ManagedUser = { id: string; name: string; email: string; role: AppRole };
type RolePermission = { role: AppRole; label: string; pages: PageAccessKey[] };

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

function parseUserAgent(ua?: string) {
  if (!ua) return "未知裝置";
  let os = "其他";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";

  let browser = "瀏覽器";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari";
  else if (ua.includes("Firefox/")) browser = "Firefox";

  return `${os} · ${browser}`;
}

const CONFIGURABLE_CUSTOMER_TYPES = [
  { key: "CABINET_FACTORY", label: "工廠", badge: "代工加工", desc: "通常自備施工圖與拆單規格，預設【4-4 拆單並提交生產】" },
  { key: "DESIGN_COMPANY", label: "設計公司", badge: "設計提案", desc: "自備空間配置底圖，預設【3-1 設計圖】" },
  { key: "DEALER_COMPANY", label: "經銷公司", badge: "經銷通路", desc: "常態簽約經銷夥伴，自備規格需求，預設【3-2 報價單】" },
  { key: "CONSTRUCTION", label: "建設/營造", badge: "工程營造", desc: "建設建案或工程標案，預設由【1-1 客源開發】開始" },
  { key: "PR", label: "公關案", badge: "公關專案", desc: "公關客戶或特殊樣品案場，預設由【1-1 客源開發】開始" },
  { key: "LONGMEI_STORE", label: "隆美", badge: "門市專案", desc: "門市專案或轉單，預設由【1-1 客源開發】開始" },
  { key: "INDIVIDUAL", label: "一般消費者", badge: "終端業主", desc: "一般個人與住宅散客業主，完整執行【1-1 客源開發】流程" },
];

export default function AdminPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // 新增人員帳號（最上方表單專用）
  const [newName, setNewName] = useState("");
  const [newEmployeeId, setNewEmployeeId] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("SALES");
  const [savingNewAccount, setSavingNewAccount] = useState(false);

  // 列表行內即時編輯帳號
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmployeeId, setEditEmployeeId] = useState("");
  const [editRole, setEditRole] = useState<AppRole>("SALES");
  const [savingInlineUserId, setSavingInlineUserId] = useState<string | null>(null);

  // 更改密碼彈窗
  const [passwordModal, setPasswordModal] = useState<{ open: boolean; user: ManagedUser | null; newPass: string; confirmPass: string }>({
    open: false, user: null, newPass: "", confirmPass: ""
  });
  const [passwordNotice, setPasswordNotice] = useState("");

  // 登入紀錄彈窗
  const [loginLogsModal, setLoginLogsModal] = useState<{
    open: boolean;
    user: ManagedUser | null;
    loading: boolean;
    logs: LoginRecordDTO[];
    error: string;
  }>({
    open: false,
    user: null,
    loading: false,
    logs: [],
    error: "",
  });

  const openLoginRecords = async (user: ManagedUser) => {
    setLoginLogsModal({
      open: true,
      user,
      loading: true,
      logs: [],
      error: "",
    });
    try {
      const res = await fetch(`/api/admin/login-logs?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "無法載入登入紀錄");
      setLoginLogsModal((prev) => ({
        ...prev,
        loading: false,
        logs: Array.isArray(data) ? data : [],
      }));
    } catch (err) {
      setLoginLogsModal((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "載入登入紀錄失敗",
      }));
    }
  };

  // 案件清單欄位設定與拖曳預覽
  const [columns, setColumns] = useState<ColumnItemDTO[]>(DEFAULT_PROJECT_COLUMNS);
  const [savingColumns, setSavingColumns] = useState(false);
  const [draggedColIdx, setDraggedColIdx] = useState<number | null>(null);
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null);

  // 階段預設天數設定
  const [stageDays, setStageDays] = useState<Record<string, number>>(MILESTONE_DEFAULT_DAYS);
  const [savingDays, setSavingDays] = useState(false);

  // 各客戶類型預設起始進度設定
  const [customerTypeStages, setCustomerTypeStages] = useState<Record<string, string>>(
    CUSTOMER_TYPE_START_STAGE_CODES as Record<string, string>
  );
  const [savingTypeStages, setSavingTypeStages] = useState(false);

  useEffect(() => {
    loadAdminData();
    loadConfigs();
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
      const [colRes, dayRes, typeRes] = await Promise.all([
        fetch("/api/admin/config?key=columns", { cache: "no-store" }),
        fetch("/api/admin/config?key=stageDays", { cache: "no-store" }),
        fetch("/api/admin/config?key=customerTypeStages", { cache: "no-store" }),
      ]);
      const colData = await colRes.json();
      const dayData = await dayRes.json();
      const typeData = await typeRes.json();
      setColumns(normalizeProjectColumns(colData.columns));
      if (dayData.stageDays) setStageDays(dayData.stageDays);
      if (typeData.customerTypeStages) setCustomerTypeStages(typeData.customerTypeStages);
    } catch (err) {
      console.error("Failed to load configs", err);
    }
  };

  // 新增人員帳號（最上方表單專用）
  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newName.trim()) {
      setError("請輸入姓名");
      return;
    }
    if (!newEmployeeId.trim()) {
      setError("請輸入員工編號");
      return;
    }
    setSavingNewAccount(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmployeeId.trim(), role: newRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "新增帳號失敗");
      setNewName("");
      setNewEmployeeId("");
      setNewRole("SALES");
      await loadAdminData();
      setNotice(`帳號「${data.name}」（員工編號：${data.email}）已新增。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "新增帳號失敗");
    } finally {
      setSavingNewAccount(false);
    }
  };

  // 列表行內即時編輯帳號
  const startEditInlineUser = (user: ManagedUser) => {
    setEditingUserId(user.id);
    setEditName(user.name);
    setEditEmployeeId(user.email);
    setEditRole(user.role);
    setError("");
    setNotice("");
  };

  const cancelEditInlineUser = () => {
    setEditingUserId(null);
    setEditName("");
    setEditEmployeeId("");
    setEditRole("SALES");
  };

  const handleSaveInlineUser = async (targetId: string) => {
    if (!editName.trim()) {
      setError("請輸入姓名");
      return;
    }
    if (!editEmployeeId.trim()) {
      setError("請輸入員工編號");
      return;
    }
    setSavingInlineUserId(targetId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId, name: editName.trim(), email: editEmployeeId.trim(), role: editRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "更新帳號失敗");
      cancelEditInlineUser();
      await loadAdminData();
      setNotice(`帳號「${data.name}」資料已更新。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "更新帳號失敗");
    } finally {
      setSavingInlineUserId(null);
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

  // 欄位顯隱開關
  const toggleColumnVisible = (key: string) => {
    setColumns((cols) =>
      cols.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
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

  const saveCustomerTypeStagesConfig = async () => {
    setSavingTypeStages(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "customer_type_start_stages", value: customerTypeStages }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "儲存各客戶類型起始進度失敗");
      }
      setNotice("各客戶類型預設起始進度已成功儲存至全域設定！");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存各客戶類型起始進度失敗");
    } finally {
      setSavingTypeStages(false);
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
          <p className="mt-1 text-sm text-slate-600">管理帳號密碼、全域案件清單欄位順序與各階段預設天數。</p>
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
            <SectionHelpButton sectionId="admin-columns" />
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
          以主管監控室表格樣式預覽。您可以點擊表頭的 <b>👁️ 圖示</b> 開關欄位顯示，或<b>直接按住並拖曳表頭</b>即時預覽調整欄位左右順序。儲存後工作台與主管監控室將同步套用。
        </p>

        {/* 模擬即時預覽表格 */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {columns.map((col, idx) => {
                  const isBeingDragged = draggedColIdx === idx;
                  const isDragOver = dragOverColIdx === idx && draggedColIdx !== idx;

                  return (
                    <th
                      key={col.key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", idx.toString());
                        e.dataTransfer.effectAllowed = "move";
                        setDraggedColIdx(idx);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverColIdx !== idx) {
                          setDragOverColIdx(idx);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverColIdx === idx) {
                          setDragOverColIdx(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromIdx = draggedColIdx !== null ? draggedColIdx : Number(e.dataTransfer.getData("text/plain"));
                        setDraggedColIdx(null);
                        setDragOverColIdx(null);
                        if (!isNaN(fromIdx) && fromIdx !== idx) {
                          const newCols = [...columns];
                          const [moved] = newCols.splice(fromIdx, 1);
                          newCols.splice(idx, 0, moved);
                          newCols.forEach((c, i) => (c.order = i));
                          setColumns(newCols);
                        }
                      }}
                      onDragEnd={() => {
                        setDraggedColIdx(null);
                        setDragOverColIdx(null);
                      }}
                      className={`p-3 border-r border-slate-200 transition-all duration-150 cursor-grab active:cursor-grabbing select-none ${
                        isDragOver
                          ? "ring-2 ring-blue-500 border-blue-400 bg-blue-50/80 scale-[1.02] shadow-sm relative z-10"
                          : isBeingDragged
                            ? "opacity-40 scale-[0.98] border-dashed border-blue-400 bg-slate-100"
                            : col.visible
                              ? "bg-white text-slate-800"
                              : "bg-slate-100/70 text-slate-400 line-through"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold flex items-center gap-1">
                          ⋮⋮ {col.label}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumnVisible(col.key);
                          }}
                          className="p-1 hover:text-blue-600 rounded transition-colors"
                          title={col.visible ? "點擊隱藏此欄位" : "點擊顯示此欄位"}
                        >
                          {col.visible ? <Eye className="h-3.5 w-3.5 text-blue-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              <tr className="hover:bg-slate-50 text-slate-600">
                {columns.map((col, idx) => {
                  const isBeingDragged = draggedColIdx === idx;
                  const isDragOver = dragOverColIdx === idx && draggedColIdx !== idx;
                  const dragCellClass = isDragOver ? "bg-blue-50/30" : isBeingDragged ? "opacity-40" : "";

                  if (!col.visible) {
                    return (
                      <td key={col.key} className={`p-3 border-r text-center text-slate-300 italic bg-slate-50/50 ${dragCellClass}`}>
                        (已隱藏)
                      </td>
                    );
                  }
                  switch (col.key) {
                    case "trafficLight":
                      return (
                        <td key={col.key} className={`p-3 border-r ${dragCellClass}`}>
                          <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 text-[11px]">
                            ● 剩 5 天
                          </span>
                        </td>
                      );
                    case "projectName":
                      return (
                        <td key={col.key} className={`p-3 border-r font-bold text-slate-900 ${dragCellClass}`}>
                          樣品案場 A
                          <div className="text-[10px] text-slate-400 font-normal">台北市大安區新生南路</div>
                        </td>
                      );
                    case "customer":
                      return (
                        <td key={col.key} className={`p-3 border-r ${dragCellClass}`}>
                          隆美興業 <span className="text-[10px] bg-blue-50 text-blue-700 px-1 rounded font-semibold">8.5折</span>
                        </td>
                      );
                    case "salesRep":
                      return (
                        <td key={col.key} className={`p-3 border-r ${dragCellClass}`}>
                          林宏遠 / 張育菁
                        </td>
                      );
                    case "stageProgress":
                      return (
                        <td key={col.key} className={`p-3 border-r font-bold text-slate-700 ${dragCellClass}`}>
                          設計提案/報價/簽約
                          <div className="mt-1 text-[10px] font-normal text-slate-500">報價單</div>
                        </td>
                      );
                    case "quoteAndUnits":
                    case "amount":
                      return (
                        <td key={col.key} className={`p-3 border-r ${dragCellClass}`}>
                          <div className="font-bold text-slate-900">$38.5 萬</div>
                          <div className="text-[10px] text-slate-400">2 戶</div>
                        </td>
                      );
                    case "unitCount":
                      return null;
                    case "expectedDate":
                      return (
                        <td key={col.key} className={`p-3 border-r ${dragCellClass}`}>
                          2026-11-30
                        </td>
                      );
                    case "actions":
                      return (
                        <td key={col.key} className={`p-3 border-r text-center ${dragCellClass}`}>
                          <span className="px-2 py-1 rounded bg-slate-100 font-bold text-slate-600">操作鈕</span>
                        </td>
                      );
                    default:
                      return <td key={col.key} className={`p-3 border-r ${dragCellClass}`}>-</td>;
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
            <SectionHelpButton sectionId="admin-stage-days" />
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

      {/* 2.5 各客戶類型預設起始進度設定 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FastForward className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold">各客戶類型預設起始進度設定</h2>
          </div>
          <button
            type="button"
            onClick={saveCustomerTypeStagesConfig}
            disabled={savingTypeStages}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingTypeStages ? "儲存中..." : "儲存起始進度"}
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          設定各類型客戶建立新案場時的預設起始里程碑。系統將自動批次略過前置項目並標記完成，直接啟動所選進度，節省業務同仁手動推進步驟。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONFIGURABLE_CUSTOMER_TYPES.map((item) => {
            const currentStage = customerTypeStages[item.key] || "1-1";
            const isCustomStart = currentStage !== "1-1";

            return (
              <div
                key={item.key}
                className={`p-4 rounded-xl border flex flex-col justify-between transition-colors ${
                  isCustomStart
                    ? "border-emerald-300 bg-emerald-50/40 shadow-xs"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-bold text-sm text-slate-800">{item.label}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCustomStart
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">起始進度：</label>
                    {isCustomStart && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        略過前期進度
                      </span>
                    )}
                  </div>
                  <select
                    value={currentStage}
                    onChange={(e) =>
                      setCustomerTypeStages({
                        ...customerTypeStages,
                        [item.key]: e.target.value,
                      })
                    }
                    className={`w-full text-xs font-bold rounded-lg border px-2.5 py-1.5 outline-none transition ${
                      isCustomStart
                        ? "border-emerald-500 bg-white text-emerald-900 shadow-xs"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {STANDARD_MILESTONE_STAGE_CODES.map((code) => (
                      <option key={code} value={code}>
                        [{code}] {MILESTONE_STAGE_LABELS[code]}
                        {code === "1-1" ? "（系統標準起點）" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. 帳號清單與權限設定 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <UserRound className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold">帳號清單與權限設定</h2>
          <SectionHelpButton sectionId="admin-users" />
        </div>

        {/* 最上方只用來新增人員帳號 */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Plus className="h-4 w-4 text-blue-600" />
            新增人員帳號
          </div>
          <form onSubmit={handleCreateAccount} className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label htmlFor="new-account-name" className="mb-1 block text-xs font-semibold text-slate-600">
                姓名
              </label>
              <input
                id="new-account-name"
                required
                placeholder="請輸入姓名"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="new-account-emp-id" className="mb-1 block text-xs font-semibold text-slate-600">
                員工編號（登入帳號）
              </label>
              <input
                id="new-account-emp-id"
                type="text"
                required
                placeholder="英數字串，例：EMP001"
                value={newEmployeeId}
                onChange={(event) => {
                  const sanitized = event.target.value.replace(/[^a-zA-Z0-9]/g, "");
                  setNewEmployeeId(sanitized);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="new-account-role" className="mb-1 block text-xs font-semibold text-slate-600">
                帳號層級
              </label>
              <select
                id="new-account-role"
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as AppRole)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={savingNewAccount}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 shadow-xs"
              >
                <Plus className="h-4 w-4" />
                {savingNewAccount ? "新增中..." : "新增帳號"}
              </button>
            </div>
          </form>
        </div>

        {/* 帳號列表與列內編輯 */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">姓名</th>
                <th className="px-3 py-2 font-semibold">員工編號</th>
                <th className="px-3 py-2 font-semibold">層級</th>
                <th className="px-3 py-2 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const isEditing = editingUserId === user.id;

                if (isEditing) {
                  return (
                    <tr key={user.id} className="bg-blue-50/70 border-y border-blue-200">
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="姓名"
                          className="w-full rounded-md border border-blue-400 bg-white px-2.5 py-1 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveInlineUser(user.id);
                            if (e.key === "Escape") cancelEditInlineUser();
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          required
                          value={editEmployeeId}
                          onChange={(e) => {
                            const sanitized = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
                            setEditEmployeeId(sanitized);
                          }}
                          placeholder="英數字串"
                          className="w-full rounded-md border border-blue-400 bg-white px-2.5 py-1 text-sm font-mono text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveInlineUser(user.id);
                            if (e.key === "Escape") cancelEditInlineUser();
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as AppRole)}
                          className="rounded-md border border-blue-400 bg-white px-2 py-1 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={savingInlineUserId === user.id}
                            onClick={() => void handleSaveInlineUser(user.id)}
                            className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                            title="儲存此列修改"
                          >
                            <Save className="h-3.5 w-3.5" />
                            {savingInlineUserId === user.id ? "儲存中..." : "儲存"}
                          </button>
                          <button
                            type="button"
                            disabled={savingInlineUserId === user.id}
                            onClick={cancelEditInlineUser}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            title="取消編輯"
                          >
                            <X className="h-3.5 w-3.5" />
                            取消
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 font-medium text-slate-800">{user.name}</td>
                    <td className="px-3 py-3 text-slate-600 font-mono text-xs">{user.email}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openLoginRecords(user)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                          title="查看該使用者登入紀錄"
                        >
                          <History className="h-3.5 w-3.5" />登入紀錄
                        </button>
                        <button
                          type="button"
                          onClick={() => setPasswordModal({ open: true, user, newPass: "", confirmPass: "" })}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100"
                        >
                          <KeyRound className="h-3.5 w-3.5" />改密碼
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditInlineUser(user)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />編輯
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. 各層級可瀏覽頁面 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-2 flex items-center gap-2">
          <Check className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-bold">各層級可瀏覽頁面</h2>
          <SectionHelpButton sectionId="admin-permissions" />
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
                在此可為該同仁設定專屬個人密碼（至少 4 碼以上）。
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">新密碼</label>
                <input
                  type="password"
                  required
                  placeholder="請輸入新密碼（至少 4 碼）"
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

      {/* 登入紀錄 Modal */}
      {loginLogsModal.open && loginLogsModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 mb-4 shrink-0">
              <h3 className="font-bold flex items-center gap-2 text-slate-900 text-base">
                <History className="h-5 w-5 text-indigo-600" />
                登入紀錄 — {loginLogsModal.user.name}
                <span className="text-xs font-mono font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  工號：{loginLogsModal.user.email}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setLoginLogsModal({ open: false, user: null, loading: false, logs: [], error: "" })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1">
              {loginLogsModal.loading && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  <span className="text-sm">載入登入紀錄中...</span>
                </div>
              )}

              {loginLogsModal.error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
                  {loginLogsModal.error}
                </div>
              )}

              {!loginLogsModal.loading && !loginLogsModal.error && loginLogsModal.logs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <History className="h-10 w-10 text-slate-300 mb-2 stroke-[1.5]" />
                  <p className="text-sm font-medium">尚無登入紀錄</p>
                  <p className="text-xs text-slate-400 mt-1">該同仁進行系統登入時將自動完整記錄</p>
                </div>
              )}

              {!loginLogsModal.loading && !loginLogsModal.error && loginLogsModal.logs.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-3 py-2.5">登入時間</th>
                        <th className="px-3 py-2.5">結果狀態</th>
                        <th className="px-3 py-2.5">來源 IP</th>
                        <th className="px-3 py-2.5">裝置環境</th>
                        <th className="px-3 py-2.5">說明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loginLogsModal.logs.map((log) => {
                        const isSuccess = log.status === "SUCCESS";
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                              {new Date(log.loginAt).toLocaleString("zh-TW", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                              })}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {isSuccess ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3" />
                                  登入成功
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
                                  <AlertCircle className="h-3 w-3" />
                                  登入失敗
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                              {log.ipAddress || "-"}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 max-w-[160px] truncate" title={log.userAgent}>
                              {parseUserAgent(log.userAgent)}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 text-[11px]">
                              {log.failureReason || (isSuccess ? "正常驗證通過" : "-")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 text-xs text-slate-500">
              <span>共 {loginLogsModal.logs.length} 筆登入歷史紀錄</span>
              <button
                type="button"
                onClick={() => setLoginLogsModal({ open: false, user: null, loading: false, logs: [], error: "" })}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 px-4 py-2 font-medium text-slate-700 transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
