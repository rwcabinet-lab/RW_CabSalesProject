"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sparkles,
  X,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  Tag,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useChangelogQuery, QUERY_KEYS } from "@/hooks/useQueries";
import { useToastStore } from "@/stores/useToastStore";
import {
  ChangelogEntry,
  CHANGELOG_CATEGORY_CONFIG,
  DEFAULT_CHANGELOG,
} from "@/lib/changelog";

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

interface FormState {
  id?: string;
  version: string;
  date: string;
  title: string;
  category: "FEAT" | "RULE" | "OPTIMIZE" | "FIX";
  detailsText: string;
}

const INITIAL_FORM: FormState = {
  version: "",
  date: new Date().toISOString().slice(0, 10),
  title: "",
  category: "FEAT",
  detailsText: "",
};

export function ChangelogModal({
  isOpen,
  onClose,
  isAdmin = false,
}: ChangelogModalProps) {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { data, isLoading } = useChangelogQuery();

  const [searchQuery, setSearchQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const changelogs: ChangelogEntry[] = data?.changelogs || DEFAULT_CHANGELOG;
  const latestVersion = data?.latestVersion || changelogs[0]?.version || "v1.0.0";

  // ESC 鍵關閉
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    },
    [isEditing, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  // 篩選搜尋
  const filteredChangelogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return changelogs;
    return changelogs.filter((item) => {
      return (
        item.version.toLowerCase().includes(q) ||
        item.date.includes(q) ||
        item.title.toLowerCase().includes(q) ||
        CHANGELOG_CATEGORY_CONFIG[item.category]?.label.toLowerCase().includes(q) ||
        item.details.some((d) => d.toLowerCase().includes(q))
      );
    });
  }, [changelogs, searchQuery]);

  // 開啟新增表單
  const handleStartAdd = () => {
    setFormData({
      ...INITIAL_FORM,
      version: `v${(Number(latestVersion.replace(/[^0-9.]/g, "").split(".").pop() || 0) + 1).toString().padStart(1, "0")}`,
      date: new Date().toISOString().slice(0, 10),
    });
    setIsEditing(true);
  };

  // 開啟編輯表單
  const handleStartEdit = (entry: ChangelogEntry) => {
    setFormData({
      id: entry.id,
      version: entry.version,
      date: entry.date,
      title: entry.title,
      category: entry.category,
      detailsText: entry.details.join("\n"),
    });
    setIsEditing(true);
  };

  // 提交儲存（新增或更新）
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.version.trim() || !formData.date.trim() || !formData.title.trim()) {
      addToast("版本編號、日期與改版標題不可為空", "error");
      return;
    }

    const details = formData.detailsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (details.length === 0) {
      addToast("請至少填寫一項改版明細說明", "error");
      return;
    }

    setIsSaving(true);
    try {
      const isUpdating = Boolean(formData.id);
      const url = "/api/changelog";
      const method = isUpdating ? "PUT" : "POST";
      const payload = {
        id: formData.id,
        version: formData.version.trim(),
        date: formData.date.trim(),
        title: formData.title.trim(),
        category: formData.category,
        details,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "儲存失敗");
      }

      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changelog });
      addToast(isUpdating ? "改版紀錄更新成功" : "改版紀錄新增成功", "success");
      setIsEditing(false);
      setFormData(INITIAL_FORM);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "儲存失敗，請重試", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // 刪除改版紀錄
  const handleDelete = async (id: string, version: string) => {
    if (!window.confirm(`確定要刪除版本【${version}】的改版紀錄嗎？此操作無法還原。`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/changelog?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "刪除失敗");
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changelog });
      addToast(`已成功刪除版本【${version}】紀錄`, "success");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "刪除失敗", "error");
    } finally {
      setDeletingId(null);
    }
  };

  // 重置回原廠出廠預設紀錄
  const handleResetDefaults = async () => {
    if (
      !window.confirm(
        "確定要將改版資訊重設還原為系統初始出廠紀錄嗎？所有自訂修改將被覆蓋。"
      )
    ) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "重設失敗");
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changelog });
      addToast("已成功還原為系統初始改版紀錄", "success");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "重設失敗", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-modal-title"
    >
      <div
        className="relative flex flex-col max-h-[92vh] w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 表頭 Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-50/90 via-slate-50/80 to-white px-5 py-4 sm:px-6 sm:py-4.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Sparkles className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="changelog-modal-title"
                  className="text-base sm:text-lg font-bold text-slate-900 tracking-tight"
                >
                  系統改版資訊與更新歷程
                </h2>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                  {latestVersion}
                </span>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    <ShieldCheck className="h-3 w-3" />
                    管理者在線編輯
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                完整記錄正道工業系統櫃事業部之各階段業務功能更新與時程防呆升級歷程
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && !isEditing && (
              <button
                type="button"
                onClick={handleStartAdd}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
                title="新增一筆改版資訊"
              >
                <Plus className="h-3.5 w-3.5" />
                新增改版紀錄
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              aria-label="關閉"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 搜尋列與狀態摘要 (僅在非編輯表單時呈現) */}
        {!isEditing && (
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 sm:px-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋版本號、日期、標題或改版內容..."
                className="w-full rounded-md border border-slate-200 bg-white py-1 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="text-xs text-slate-500">
              共{" "}
              <span className="font-semibold text-slate-800">
                {filteredChangelogs.length}
              </span>{" "}
              次改版歷程
            </div>
          </div>
        )}

        {/* 彈窗主體區塊 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* 管理者新增/編輯表單模式 */}
          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    {formData.id ? (
                      <>
                        <Edit2 className="w-4 h-4 text-blue-600" />
                        編輯改版紀錄【{formData.version}】
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 text-blue-600" />
                        新增改版紀錄
                      </>
                    )}
                  </h3>
                  <span className="text-xs text-slate-500">
                    * 必填欄位請確實填寫
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      版本編號 *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.version}
                      onChange={(e) =>
                        setFormData({ ...formData, version: e.target.value })
                      }
                      placeholder="例：v1.3.2"
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      改版日期 *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) =>
                        setFormData({ ...formData, date: e.target.value })
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      改版類別 *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          category: e.target.value as FormState["category"],
                        })
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="FEAT">功能新增 (FEAT)</option>
                      <option value="RULE">業務規則 (RULE)</option>
                      <option value="OPTIMIZE">體驗優化 (OPTIMIZE)</option>
                      <option value="FIX">系統修復 (FIX)</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    改版主題標題 *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="例：新增頂部導覽列改版資訊彈窗與管理在線編輯功能"
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    改版明細項目清單 *（每行代表一項，換行自動條列）
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={formData.detailsText}
                    onChange={(e) =>
                      setFormData({ ...formData, detailsText: e.target.value })
                    }
                    placeholder="請輸入條列式改版內容，每行一項：&#10;• 頂部導覽列新增改版資訊入口按鈕&#10;• 全體同仁皆可即時檢視歷次改版日期與主題&#10;• 系統管理者具備直接線上新增與編輯權限"
                    className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed font-mono"
                  />
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setFormData(INITIAL_FORM);
                    }}
                    disabled={isSaving}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    儲存改版紀錄
                  </button>
                </div>
              </div>
            </form>
          ) : null}

          {/* 改版歷程清單 (Timeline List) */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              <p className="text-xs">正在載入系統改版紀錄...</p>
            </div>
          ) : filteredChangelogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-slate-400">
              <AlertTriangle className="w-8 h-8 mx-auto text-amber-400 mb-2" />
              <p className="text-sm font-medium text-slate-600">
                找不到相符的改版資訊
              </p>
              <p className="text-xs text-slate-400 mt-1">
                請嘗試更換關鍵字或點擊下方清空搜尋
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-3 text-xs text-blue-600 hover:underline"
                >
                  清除搜尋條件
                </button>
              )}
            </div>
          ) : (
            <div className="relative border-l-2 border-blue-200 ml-4 pl-5 sm:pl-6 space-y-6">
              {filteredChangelogs.map((item, index) => {
                const isLatest = index === 0 && !searchQuery;
                const categoryConfig =
                  CHANGELOG_CATEGORY_CONFIG[item.category] ||
                  CHANGELOG_CATEGORY_CONFIG.FEAT;

                return (
                  <div
                    key={item.id}
                    className={`relative rounded-xl border transition-all ${
                      isLatest
                        ? "border-blue-300 bg-gradient-to-br from-blue-50/40 via-white to-white shadow-xs"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    } p-4 sm:p-5`}
                  >
                    {/* 時間軸節點圓圈 */}
                    <div
                      className={`absolute -left-[31px] sm:-left-[35px] top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${
                        isLatest
                          ? "bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-300"
                          : "bg-slate-300 text-white"
                      }`}
                    >
                      <Sparkles className="h-3 w-3" />
                    </div>

                    {/* 卡片頂部資訊列 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                          {item.version}
                        </span>
                        {isLatest && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                            最新版本
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${categoryConfig.badgeClass}`}
                        >
                          {categoryConfig.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 ml-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {item.date}
                        </span>
                      </div>

                      {/* 管理者操作按鈕 */}
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-blue-600 transition"
                            title="編輯此改版紀錄"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.version)}
                            disabled={deletingId === item.id}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-50"
                            title="刪除此改版紀錄"
                          >
                            {deletingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            刪除
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 改版主題標題 */}
                    <h4 className="mt-2.5 text-sm sm:text-base font-bold text-slate-800">
                      {item.title}
                    </h4>

                    {/* 條列式明細清單 */}
                    <ul className="mt-2.5 space-y-1.5 text-xs text-slate-600">
                      {item.details.map((detail, dIdx) => (
                        <li
                          key={dIdx}
                          className="flex items-start gap-2 leading-relaxed"
                        >
                          <ChevronRight className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>

                    {/* 更新人員註記 */}
                    {item.updatedBy && (
                      <div className="mt-3 pt-2 border-t border-slate-50 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>維護人員: {item.updatedBy}</span>
                        {item.updatedAt && (
                          <span>
                            更新於{" "}
                            {new Date(item.updatedAt).toLocaleDateString(
                              "zh-TW"
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 表尾 Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            {isAdmin && !isEditing && (
              <button
                type="button"
                onClick={handleResetDefaults}
                disabled={isSaving}
                className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-slate-500 hover:text-rose-600 transition"
                title="將改版資訊重設為原廠出廠預設紀錄"
              >
                <RotateCcw className="w-3 h-3" />
                回復初始紀錄
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-900 transition"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
