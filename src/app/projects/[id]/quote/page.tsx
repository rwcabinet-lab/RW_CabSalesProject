"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  Paperclip,
  Printer,
  Save,
} from "lucide-react";
import { ProjectDetail, QuotationData } from "@/lib/mock-data";

type QuoteStatus = QuotationData["status"];

const statusLabels: Record<QuoteStatus, string> = {
  DRAFT: "草稿",
  SENT: "已送客戶",
  ACCEPTED: "客戶已確認",
  REJECTED: "已作廢",
};

const emptyForm = {
  totalAmount: "",
  externalQuoteNo: "",
  quoteFileUrl: "",
  notes: "",
  status: "DRAFT" as QuoteStatus,
};

export default function QuotationEditorPage() {
  const params = useParams();
  const projectId = (params?.id as string) || "p2";
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [latestQuote, setLatestQuote] = useState<QuotationData | null>(null);
  const [versions, setVersions] = useState<QuotationData[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadQuote() {
      try {
        const response = await fetch(`/api/projects/${projectId}/quote`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "載入報價資料失敗");

        setProject(data.project);
        setLatestQuote(data.latestVersion);
        setVersions(data.versions || []);
        if (data.latestVersion) {
          setForm({
            totalAmount: String(data.latestVersion.totalAmount),
            externalQuoteNo: data.latestVersion.externalQuoteNo || "",
            quoteFileUrl: data.latestVersion.quoteFileUrl || "",
            notes: data.latestVersion.notes || "",
            status: data.latestVersion.status,
          });
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "載入報價資料失敗");
      } finally {
        setLoading(false);
      }
    }

    loadQuote();
  }, [projectId]);

  const updateForm = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaveSuccess(false);

    const totalAmount = Number(form.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setError("請輸入大於 0 的含稅報價總額。");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, totalAmount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "儲存報價資料失敗");

      const savedQuote = data.version as QuotationData;
      setLatestQuote(savedQuote);
      setVersions((current) => [savedQuote, ...current]);
      setForm({
        totalAmount: String(savedQuote.totalAmount),
        externalQuoteNo: savedQuote.externalQuoteNo || "",
        quoteFileUrl: savedQuote.quoteFileUrl || "",
        notes: savedQuote.notes || "",
        status: savedQuote.status,
      });
      setSaveSuccess(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存報價資料失敗");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-16 text-center text-sm text-slate-500">正在載入報價登記資料...</div>;
  }

  if (error && !project) {
    return <div className="p-8 text-center text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-700">
            <FileSpreadsheet className="h-4 w-4" /> 模組 C・簡易報價登記
          </div>
          <h1 className="text-2xl font-black text-slate-900">{project?.projectName || "專案報價"}</h1>
          <p className="mt-1 text-sm text-slate-500">客戶：{project?.customerName}　•　{project?.siteAddress}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:self-auto"
        >
          <Printer className="h-4 w-4" /> 列印
        </button>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-bold text-slate-900">登記外部報價結果</h2>
          <p className="mt-1 text-sm text-slate-500">報價金額與計算內容已由外部系統完成，本頁只保存結果與附件。</p>
        </div>

        <div className="grid gap-5 p-6 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">外部報價單號</span>
            <input
              value={form.externalQuoteNo}
              onChange={(event) => updateForm("externalQuoteNo", event.target.value)}
              placeholder="例如 EXT-2026-0921-002"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">含稅報價總額（NT$）<em className="ml-1 text-red-500">*</em></span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.totalAmount}
              onChange={(event) => updateForm("totalAmount", event.target.value)}
              placeholder="輸入外部系統的最終金額"
              className="w-full rounded-lg border border-blue-300 px-3 py-2.5 text-lg font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">報價狀態</span>
            <select
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Paperclip className="h-4 w-4" />報價附件連結或檔名</span>
            <input
              value={form.quoteFileUrl}
              onChange={(event) => updateForm("quoteFileUrl", event.target.value)}
              placeholder="貼上 PDF 連結或輸入檔案名稱"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">備註</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              placeholder="記錄報價版本變更、客戶條件或後續追蹤事項"
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        {error && <p className="px-6 pb-3 text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          {saveSuccess && <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check className="h-4 w-4" /> 已建立 {latestQuote?.version}</span>}
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "儲存中..." : "儲存並建立新版本"}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-bold text-slate-900">報價版本與附件</h2>
          <p className="mt-1 text-sm text-slate-500">共 {versions.length} 個版本，最新版本會同步更新案件預估金額。</p>
        </div>
        <div className="divide-y divide-slate-100">
          {versions.length === 0 && <p className="px-6 py-8 text-center text-sm text-slate-500">尚未登記報價版本。</p>}
          {versions.map((version) => (
            <article key={version.id} className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900">{version.version}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{statusLabels[version.status]}</span>
                  {version.externalQuoteNo && <span className="text-xs text-slate-500">{version.externalQuoteNo}</span>}
                </div>
                <p className="mt-1 text-sm text-slate-500">{version.notes || "無備註"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <strong className="text-lg text-slate-900">NT$ {version.totalAmount.toLocaleString("zh-TW")}</strong>
                {version.quoteFileUrl ? (
                  /^https?:\/\//.test(version.quoteFileUrl) ? (
                    <a href={version.quoteFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800">
                      <ExternalLink className="h-4 w-4" /> 查看附件
                    </a>
                  ) : <span className="inline-flex items-center gap-1 text-sm text-slate-500"><Paperclip className="h-4 w-4" />{version.quoteFileUrl}</span>
                ) : <span className="text-sm text-slate-400">無附件</span>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
