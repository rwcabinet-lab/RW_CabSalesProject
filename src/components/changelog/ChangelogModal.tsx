"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sparkles,
  X,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  Search,
  AlertTriangle,
  RotateCcw,
  Loader2,
  ShieldCheck,
  ChevronRight,
  Check,
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

interface FormFields {
  date: string;
  title: string;
  category: "FEAT" | "RULE" | "OPTIMIZE" | "FIX";
  detailsText: string;
}

const INITIAL_FORM: FormFields = {
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormFields>(INITIAL_FORM);
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<FormFields>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const changelogs: ChangelogEntry[] = data?.changelogs || DEFAULT_CHANGELOG;

  // ESC 鍵關閉或取消編輯
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingId) {
          setEditingId(null);
        } else if (isAdding) {
          setIsAdding(false);
        } else {
          onClose();
        }
      }
    },
    [editingId, isAdding, onClose]
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

  // 篩選搜尋（無版本號，搜尋日期、類別、標題或內容）
  const filteredChangelogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return changelogs;
    return changelogs.filter((item) => {
      return (
        item.date.includes(q) ||
        item.title.toLowerCase().includes(q) ||
        CHANGELOG_CATEGORY_CONFIG[item.category]?.label.toLowerCase().includes(q) ||
        item.details.some((d) => d.toLowerCase().includes(q))
      );
    });
  }, [changelogs, searchQuery]);

  // 開啟新增模式
  const handleStartAdd = () => {
    setEditingId(null);
    setAddForm({
      date: new Date().toISOString().slice(0, 10),
      title: "",
      category: "FEAT",
      detailsText: "",
    });
    setIsAdding(true);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setAddForm(INITIAL_FORM);
  };

  // 開啟該筆卡片的行內編輯模式
  const handleStartEdit = (entry: ChangelogEntry) => {
    setIsAdding(false);
    setEditingId(entry.id);
    setEditForm({
      date: entry.date,
      title: entry.title,
      category: entry.category,
      detailsText: entry.details.join("\n"),
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(INITIAL_FORM);
  };

  // 儲存行內編輯內容
  const handleSaveEdit = async (id: string) => {
    if (!editForm.date.trim() || !editForm.title.trim()) {
      addToast("改版日期與改版標題不可為空", "error");
      return;
    }

    const details = editForm.detailsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (details.length === 0) {
      addToast("請至少填寫一項改版明細說明", "error");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        id,
        date: editForm.date.trim(),
        title: editForm.title.trim(),
        category: editForm.category,
        details,
      };

      const res = await fetch("/api/changelog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "儲存更新失敗");
      }

      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changelog });
      addToast("改版紀錄更新成功", "success");
      setEditingId(null);
      setEditForm(INITIAL_FORM);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "儲存失敗，請重試", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // 儲存新增紀錄
  const handleSaveAdd = async () => {
    if (!addForm.date.trim() || !addForm.title.trim()) {
      addToast("改版日期與改版標題不可為空", "error");
      return;
    }

    const details = addForm.detailsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (details.length === 0) {
      addToast("請至少填寫一項改版明細說明", "error");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        date: addForm.date.trim(),
        title: addForm.title.trim(),
        category: addForm.category,
        details,
      };

      const res = await fetch("/api/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "新增失敗");
      }

      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changelog });
      addToast("改版紀錄新增成功", "success");
      setIsAdding(false);
      setAddForm(INITIAL_FORM);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "新增失敗，請重試", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // 刪除改版紀錄
  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`確定要刪除改版紀錄【${title}】嗎？此操作無法還原。`)) {
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
      addToast("已成功刪除改版紀錄", "success");
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
        {/* 表頭 Header（已移除版本號資訊） */}
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
            {isAdmin && !isAdding && (
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

        {/* 搜尋列與狀態摘要 */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 sm:px-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋日期、類別、標題或改版內容..."
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

        {/* 彈窗主體區塊 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              <p className="text-xs">正在載入系統改版紀錄...</p>
            </div>
          ) : filteredChangelogs.length === 0 && !isAdding ? (
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
            <div className="relative border-l-2 border-blue-200 ml-4 pl-5 sm:pl-6 space-y-5">
              {/* 新增卡片（在時間軸頂部直接展開） */}
              {isAdding && (
                <div className="relative rounded-xl border-2 border-blue-500 bg-blue-50/40 p-4 sm:p-5 shadow-sm animate-in fade-in duration-150">
                  <div className="absolute -left-[31px] sm:-left-[35px] top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-md">
                    <Plus className="h-3.5 w-3.5" />
                  </div>

                  <div className="flex items-center justify-between border-b border-blue-200 pb-2.5 mb-3">
                    <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-blue-600" />
                      新增改版紀錄
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelAdd}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          改版日期 *
                        </label>
                        <input
                          type="date"
                          required
                          value={addForm.date}
                          onChange={(e) =>
                            setAddForm({ ...addForm, date: e.target.value })
                          }
                          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          改版類別 *
                        </label>
                        <select
                          value={addForm.category}
                          onChange={(e) =>
                            setAddForm({
                              ...addForm,
                              category: e.target.value as FormFields["category"],
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

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        改版主題標題 *
                      </label>
                      <input
                        type="text"
                        required
                        value={addForm.title}
                        onChange={(e) =>
                          setAddForm({ ...addForm, title: e.target.value })
                        }
                        placeholder="請輸入改版主題標題..."
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        改版內容清單 *（每行一項，換行自動條列）
                      </label>
                      <textarea
                        rows={5}
                        required
                        value={addForm.detailsText}
                        onChange={(e) =>
                          setAddForm({ ...addForm, detailsText: e.target.value })
                        }
                        placeholder="請輸入條列式改版內容，每行一項：&#10;• 第一項更新說明&#10;• 第二項更新說明"
                        className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed font-mono"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCancelAdd}
                        disabled={isSaving}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAdd}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        確認新增
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 歷次改版項目清單 */}
              {filteredChangelogs.map((item, index) => {
                const isLatest = index === 0 && !searchQuery && !isAdding;
                const isCurrentEditing = editingId === item.id;
                const categoryConfig =
                  CHANGELOG_CATEGORY_CONFIG[item.category] ||
                  CHANGELOG_CATEGORY_CONFIG.FEAT;

                if (isCurrentEditing) {
                  {/* 行內編輯模式（該張卡片直接變為輸入表單） */}
                  return (
                    <div
                      key={item.id}
                      className="relative rounded-xl border-2 border-blue-500 bg-blue-50/40 p-4 sm:p-5 shadow-sm animate-in fade-in duration-150"
                    >
                      <div className="absolute -left-[31px] sm:-left-[35px] top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-md">
                        <Edit2 className="h-3 w-3" />
                      </div>

                      <div className="flex items-center justify-between border-b border-blue-200 pb-2.5 mb-3">
                        <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                          <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                          編輯改版紀錄
                        </span>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              改版日期 *
                            </label>
                            <input
                              type="date"
                              required
                              value={editForm.date}
                              onChange={(e) =>
                                setEditForm({ ...editForm, date: e.target.value })
                              }
                              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              改版類別 *
                            </label>
                            <select
                              value={editForm.category}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  category: e.target.value as FormFields["category"],
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

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            改版主題標題 *
                          </label>
                          <input
                            type="text"
                            required
                            value={editForm.title}
                            onChange={(e) =>
                              setEditForm({ ...editForm, title: e.target.value })
                            }
                            placeholder="請輸入改版主題標題..."
                            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            改版內容清單 *（每行一項，換行自動條列）
                          </label>
                          <textarea
                            rows={6}
                            required
                            value={editForm.detailsText}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                detailsText: e.target.value,
                              })
                            }
                            placeholder="請輸入條列式改版內容，每行一項：&#10;• 第一項更新說明&#10;• 第二項更新說明"
                            className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed font-mono"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
                          >
                            {isSaving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            儲存更新
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* 常規檢視模式（移除版本號資訊） */}
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

                    {/* 卡片頂部資訊列（無版本號） */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {isLatest && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                            最新發布
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
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition"
                            title="編輯此改版紀錄"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.title)}
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
            {isAdmin && (
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
