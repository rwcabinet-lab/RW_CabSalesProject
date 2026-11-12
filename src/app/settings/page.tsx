"use client";

import { useState, useEffect } from "react";
import { User, Lock, Palette, Check, AlertCircle, Shield, Sparkles, RefreshCw, Coins } from "lucide-react";
import type { UserDTO } from "@/types/dto";
import { useSessionQuery } from "@/hooks/useQueries";
import { SectionHelpButton } from "@/components/common/SectionHelpButton";
import { useCurrencyStore } from "@/stores/useCurrencyStore";
import type { CurrencyUnit } from "@/lib/currency";

type UserSession = UserDTO;

const THEME_OPTIONS = [
  {
    id: "classic",
    name: "經典清爽",
    sub: "Classic",
    bg: "bg-[#1A6357]",
    border: "border-[#1A6357]",
    desc: "沉穩松石墨綠，典雅清爽（系統預設）",
  },
  {
    id: "paper",
    name: "Notion 紙感",
    sub: "Paper",
    bg: "bg-[#685338]",
    border: "border-[#685338]",
    desc: "溫潤胡桃木與米白紙感，人文護眼",
  },
  {
    id: "dark",
    name: "Spotify 深色",
    sub: "Dark",
    bg: "bg-[#22C55E]",
    border: "border-[#22C55E]",
    desc: "沉浸曜石黑與螢光綠，夜間專用",
  },
  {
    id: "green",
    name: "LINE 綠意",
    sub: "Green",
    bg: "bg-[#06C755]",
    border: "border-[#06C755]",
    desc: "明亮翡翠草本綠，清新親和",
  },
  {
    id: "sunset",
    name: "Instagram 夕陽",
    sub: "Gradient",
    bg: "bg-[#BC3C68]",
    border: "border-[#BC3C68]",
    desc: "暮光玫瑰與薄暮紫藍，當代設計感",
  },
  {
    id: "blue",
    name: "Messenger 藍海",
    sub: "Blue",
    bg: "bg-[#0084FF]",
    border: "border-[#0084FF]",
    desc: "現代旗艦皇家藍，通透清晰",
  },
];

export default function SettingsPage() {
  const { data: user, isLoading: sessionLoading } = useSessionQuery();
  const loading = sessionLoading && !user;

  // 密碼變更狀態
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // 外觀風格狀態 (預設: 經典清爽)
  const [currentTheme, setCurrentTheme] = useState("classic");
  const [currentDensity, setCurrentDensity] = useState("normal");
  const [themeSaved, setThemeSaved] = useState(false);

  // 金額顯示單位模式 (元 / 萬)
  const currencyUnit = useCurrencyStore((s) => s.currencyUnit);
  const setCurrencyUnit = useCurrencyStore((s) => s.setCurrencyUnit);

  const handleApplyCurrencyUnit = (unit: CurrencyUnit) => {
    setCurrencyUnit(unit);
    setThemeSaved(true);
    setTimeout(() => setThemeSaved(false), 2500);
  };

  useEffect(() => {
    // 讀取目前主題設定
    try {
      const savedTheme = localStorage.getItem("app_theme_color");
      const savedDensity = localStorage.getItem("app_theme_density") || "normal";
      const validIds = THEME_OPTIONS.map((t) => t.id);
      let resolvedTheme = "classic";
      if (savedTheme && validIds.includes(savedTheme)) {
        resolvedTheme = savedTheme;
      } else if (savedTheme === "emerald" || savedTheme === "slate") {
        resolvedTheme = "classic";
      } else if (savedTheme === "amber") {
        resolvedTheme = "paper";
      }
      setCurrentTheme(resolvedTheme);
      setCurrentDensity(savedDensity);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleApplyTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    try {
      localStorage.setItem("app_theme_color", themeId);
      // 移除所有舊與新的 theme class
      const allKnownThemes = ["classic", "paper", "dark", "green", "sunset", "blue", "emerald", "amber", "slate"];
      allKnownThemes.forEach((id) => {
        document.documentElement.classList.remove(`theme-${id}`);
        document.body.classList.remove(`theme-${id}`);
      });
      // 加入新的 theme class
      document.documentElement.classList.add(`theme-${themeId}`);
      document.body.classList.add(`theme-${themeId}`);
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (!newPassword || newPassword.length < 4) {
      setPasswordStatus({
        type: "error",
        message: "新密碼長度至少需 4 碼以上",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        type: "error",
        message: "新密碼與確認密碼不一致",
      });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id, oldPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "密碼更新失敗");
      }

      setPasswordStatus({
        type: "success",
        message: data.message || "密碼已成功更新！下次登入即生效。",
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordStatus({
        type: "error",
        message: err instanceof Error ? err.message : "密碼更新失敗",
      });
    } finally {
      setSavingPassword(false);
    }
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
      : user?.role === "SITE_ENGINEER"
      ? "工務人員"
      : "業務專員";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-16">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <p className="text-sm text-slate-500 font-medium">載入個人設定中...</p>
      </div>
    );
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
              <span>{user?.name || "未知使用者"}</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                {roleLabel}
              </span>
              <SectionHelpButton sectionId="settings-account" />
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
              <SectionHelpButton sectionId="settings-password" />
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">目前密碼 *</label>
                <input
                  type="password"
                  required
                  placeholder="請輸入目前密碼"
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
            <Shield className="w-3.5 h-3.5 text-blue-500" />
            密碼功能已正式啟用，更改後下次登入即生效。新密碼請妥善保管。
          </div>
        </div>

        {/* 系統風格配色與介面調整 */}
        <div className="bg-white rounded-2xl border p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-800">介面風格與配色</h3>
                <SectionHelpButton sectionId="settings-appearance" />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = currentTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => handleApplyTheme(theme.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 shadow-sm"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full ${theme.bg} shadow-sm shrink-0`} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-800">{theme.name}</span>
                              <span className="text-[10px] font-mono font-semibold text-slate-400">{theme.sub}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{theme.desc}</div>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
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

              {/* 金額顯示單位模式 (元 / 萬) */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-500" />
                    <span>金額顯示單位模式：</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-normal">
                    即時範例：{currencyUnit === "wan" ? "$35 萬" : "$350,000"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => handleApplyCurrencyUnit("yuan")}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition ${
                      currencyUnit === "yuan"
                        ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 font-bold text-blue-800 shadow-xs"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                        元
                      </span>
                      <div className="text-left">
                        <div className="font-bold text-slate-800">元 (NT$)</div>
                        <div className="text-[10px] text-slate-400">標準千分位（如 $350,000）</div>
                      </div>
                    </div>
                    {currencyUnit === "yuan" && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyCurrencyUnit("wan")}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition ${
                      currencyUnit === "wan"
                        ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 font-bold text-blue-800 shadow-xs"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                        萬
                      </span>
                      <div className="text-left">
                        <div className="font-bold text-slate-800">萬 (萬元)</div>
                        <div className="text-[10px] text-slate-400">萬元縮寫（如 $35 萬）</div>
                      </div>
                    </div>
                    {currencyUnit === "wan" && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t text-[11px] text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            風格與金額顯示單位設定會自動儲存於此瀏覽器，切換頁面直接生效。
          </div>
        </div>
      </div>
    </div>
  );
}
