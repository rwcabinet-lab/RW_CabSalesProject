"use client";

import { useState, useEffect } from "react";
import { User, Lock, Palette, Check, AlertCircle, Shield, Sparkles } from "lucide-react";
import type { ApiResponse } from "@/types/dto";

interface UserSession {
  id: string;
  name: string;
  role: string;
  email?: string;
}

const THEME_OPTIONS = [
  { id: "blue", name: "經典商務藍", bg: "bg-blue-600", border: "border-blue-600", desc: "系統預設，清晰穩重" },
  { id: "emerald", name: "翡翠森林綠", bg: "bg-emerald-600", border: "border-emerald-600", desc: "柔和護眼，自然清新" },
  { id: "amber", name: "溫潤暖木褐", bg: "bg-amber-600", border: "border-amber-600", desc: "溫暖木質調，典雅細緻" },
  { id: "slate", name: "專業極簡灰", bg: "bg-slate-700", border: "border-slate-700", desc: "簡約幹練，高對比易讀" },
  { id: "dark", name: "夜間深色模式", bg: "bg-slate-900", border: "border-slate-900", desc: "低光源環境適用" },
];

export default function SettingsPage() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  // 密碼變更狀態
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // 外觀風格狀態
  const [currentTheme, setCurrentTheme] = useState("blue");
  const [currentDensity, setCurrentDensity] = useState("normal");
  const [themeSaved, setThemeSaved] = useState(false);

  useEffect(() => {
    // 讀取目前使用者資訊
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => res.json() as Promise<ApiResponse<{ user: UserSession | null }>>)
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch((err) => console.error("獲取使用者資訊失敗:", err))
      .finally(() => setLoading(false));

    // 讀取目前主題設定
    try {
      const savedTheme = localStorage.getItem("app_theme_color") || "blue";
      const savedDensity = localStorage.getItem("app_theme_density") || "normal";
      setCurrentTheme(savedTheme);
      setCurrentDensity(savedDensity);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleApplyTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    try {
      localStorage.setItem("app_theme_color", themeId);
      // 移除舊的 theme class
      THEME_OPTIONS.forEach((t) => {
        if (t.id !== "blue") {
          document.documentElement.classList.remove(`theme-${t.id}`);
          document.body.classList.remove(`theme-${t.id}`);
        }
      });
      // 加入新的 theme class
      if (themeId !== "blue") {
        document.documentElement.classList.add(`theme-${themeId}`);
        document.body.classList.add(`theme-${themeId}`);
      }
      setThemeSaved(true);
      setTimeout(() => setThemeSaved(false), 2500);
    } catch (e) {
      console.error("儲存風格設定失敗:", e);
    }
  };

  const handleApplyDensity = (density: "normal" | "compact") => {
    setCurrentDensity(density);
    try {
      localStorage.setItem("app_theme_density", density);
      if (density === "compact") {
        document.documentElement.classList.add("density-compact");
        document.body.classList.add("density-compact");
      } else {
        document.documentElement.classList.remove("density-compact");
        document.body.classList.remove("density-compact");
      }
      setThemeSaved(true);
      setTimeout(() => setThemeSaved(false), 2500);
    } catch (e) {
      console.error("儲存顯示密度失敗:", e);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);
    setSavingPassword(true);

    setTimeout(() => {
      // 依使用者指示：做出介面，但密碼維持 0000 驗證
      if (oldPassword !== "0000") {
        setPasswordStatus({
          type: "error",
          message: "目前密碼不正確（系統預設密碼為 0000）",
        });
        setSavingPassword(false);
        return;
      }

      if (!newPassword || newPassword.length < 4) {
        setPasswordStatus({
          type: "error",
          message: "新密碼長度至少需 4 碼以上",
        });
        setSavingPassword(false);
        return;
      }

      if (newPassword !== confirmPassword) {
        setPasswordStatus({
          type: "error",
          message: "新密碼與確認密碼不一致",
        });
        setSavingPassword(false);
        return;
      }

      setPasswordStatus({
        type: "success",
        message: "密碼已成功更新！系統目前維持測試連線，密碼驗證維持 0000 通用相容。",
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSavingPassword(false);
    }, 400);
  };

  const roleLabel =
    user?.role === "ADMIN"
      ? "系統管理員"
      : user?.role === "LEVEL_MANAGER"
      ? "理級主管"
      : user?.role === "SALES_MANAGER"
      ? "業務主管"
      : user?.role === "ASSISTANT"
      ? "業務助理"
      : "業務專員";

  if (loading) {
    return <div className="p-16 text-center text-slate-400">載入個人設定中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* 頁面標題 */}
      <div className="border-b pb-4">
        <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
          個人與外觀設定
        </span>
        <h1 className="text-2xl font-black mt-1 text-slate-800">帳號管理</h1>
        <p className="text-xs text-slate-500 mt-1">管理個人帳號資訊、設定登入密碼及選擇系統配色風格</p>
      </div>

      {/* 個人帳號資訊卡片 */}
      <div className="bg-white rounded-2xl border p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-black shadow-md">
            {user?.name?.slice(0, 1) || "U"}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {user?.name || "未知使用者"}
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                {roleLabel}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">使用者 ID: {user?.id}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 安全密碼設定 */}
        <div className="bg-white rounded-2xl border p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b pb-3 mb-4">
              <Lock className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-base text-slate-800">更改登入密碼</h3>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">目前密碼 *</label>
                <input
                  type="password"
                  required
                  placeholder="請輸入目前密碼（預設 0000）"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full border rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">新密碼 *</label>
                <input
                  type="password"
                  required
                  placeholder="請輸入新密碼（至少 4 碼）"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">確認新密碼 *</label>
                <input
                  type="password"
                  required
                  placeholder="請再次輸入新密碼"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {passwordStatus && (
                <div
                  className={`p-3 rounded-lg border flex items-start gap-2 ${
                    passwordStatus.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  {passwordStatus.type === "success" ? (
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                  )}
                  <span>{passwordStatus.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={savingPassword}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition disabled:opacity-50"
              >
                {savingPassword ? "更新中..." : "確認更新密碼"}
              </button>
            </form>
          </div>

          <div className="mt-4 pt-3 border-t text-[11px] text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            系統已開啟相容模式，密碼驗證基準保持為 0000。
          </div>
        </div>

        {/* 系統風格配色與介面調整 */}
        <div className="bg-white rounded-2xl border p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-800">介面風格與配色</h3>
              </div>
              {themeSaved && (
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-pulse">
                  <Check className="w-3.5 h-3.5" /> 已套用更改
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  主題配色方案（點擊即時套用）：
                </label>
                <div className="grid grid-cols-1 gap-2.5">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = currentTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => handleApplyTheme(theme.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full ${theme.bg} shadow-sm shrink-0`} />
                          <div>
                            <div className="font-bold text-xs text-slate-800">{theme.name}</div>
                            <div className="text-[10px] text-slate-400">{theme.desc}</div>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 顯示密度 */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 mb-2">表格顯示密度：</label>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => handleApplyDensity("normal")}
                    className={`py-2 px-3 rounded-lg border font-semibold text-center transition ${
                      currentDensity === "normal"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    標準舒適 (預設)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyDensity("compact")}
                    className={`py-2 px-3 rounded-lg border font-semibold text-center transition ${
                      currentDensity === "compact"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    緊湊高容量
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t text-[11px] text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            風格設定會自動儲存於此瀏覽器，切換頁面直接生效。
          </div>
        </div>
      </div>
    </div>
  );
}
