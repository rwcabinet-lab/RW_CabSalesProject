"use client";

import { useState } from "react";
import { X, Edit3 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkbenchStore } from "@/stores/useWorkbenchStore";
import { fromTenThousands } from "@/lib/currency";
import { toast } from "@/stores/useToastStore";
import { QUERY_KEYS } from "@/hooks/useQueries";
import type { CustomerDTO, UserDTO, WorkbenchDashboardDTO } from "@/types/dto";

interface WorkbenchProjectFormsProps {
  customers: CustomerDTO[];
  selectableUsers: UserDTO[];
  onInvalidate: (options?: { includeViews?: boolean }) => Promise<void>;
}

/**
 * 新增案場表單面板（獨立訂閱 newProjectData，防止輸入時導致工作台全表重新渲染）
 */
export function WorkbenchAddProjectPanel({
  customers,
  selectableUsers,
  onInvalidate,
}: WorkbenchProjectFormsProps) {
  const queryClient = useQueryClient();
  const setProjectPanelOpen = useWorkbenchStore((s) => s.setProjectPanelOpen);
  const newProjectData = useWorkbenchStore((s) => s.newProjectData);
  const setNewProjectData = useWorkbenchStore((s) => s.setNewProjectData);

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectData.projectName || !newProjectData.customerId || !newProjectData.siteAddress) return;
    setSaving(true);
    try {
      const payload = {
        ...newProjectData,
        unitCount: newProjectData.unitCount ? Number(newProjectData.unitCount) : undefined,
        cost: newProjectData.cost ? fromTenThousands(Number(newProjectData.cost)) : undefined,
        quoteAmount: newProjectData.quoteAmount ? fromTenThousands(Number(newProjectData.quoteAmount)) : undefined,
        salesRepId: newProjectData.salesRepId || undefined,
      };
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setProjectPanelOpen(false);
        void onInvalidate({ includeViews: true });
        toast.success("已成功新增案場！");
      } else {
        const err = await res.json();
        toast.error(err.error || "新增案場失敗");
      }
    } catch {
      toast.error("新增案場失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-emerald-50 border-b border-emerald-100">
      <div className="flex justify-between font-bold mb-3">
        新增案場{" "}
        <button type="button" onClick={() => setProjectPanelOpen(false)}>
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <label>
          案場名稱 *
          <input
            required
            value={newProjectData.projectName}
            onChange={(e) => setNewProjectData({ projectName: e.target.value })}
            className="w-full border rounded p-1.5 mt-1"
          />
        </label>
        <label>
          客戶 *
          <select
            required
            value={newProjectData.customerId}
            onChange={(e) => {
              const nextCustId = e.target.value;
              const selectedCust = customers.find((c) => c.id === nextCustId);
              setNewProjectData((prev) => {
                const defaultRep =
                  selectedCust?.salesRepId && selectableUsers.some((u) => u.id === selectedCust.salesRepId)
                    ? selectedCust.salesRepId
                    : prev.salesRepId || selectableUsers[0]?.id || "";
                return {
                  ...prev,
                  customerId: nextCustId,
                  salesRepId: defaultRep,
                };
              });
            }}
            className="w-full border rounded p-1.5 mt-1"
          >
            <option value="">選擇客戶</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          主責業務
          <select
            value={newProjectData.salesRepId || ""}
            onChange={(e) => setNewProjectData({ salesRepId: e.target.value })}
            className="w-full border rounded p-1.5 mt-1 bg-white"
          >
            <option value="">未指定</option>
            {selectableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          施工地址 *
          <input
            required
            value={newProjectData.siteAddress}
            onChange={(e) => setNewProjectData({ siteAddress: e.target.value })}
            className="w-full border rounded p-1.5 mt-1"
          />
        </label>
        <label>
          戶數
          <input
            type="number"
            value={newProjectData.unitCount}
            onChange={(e) => setNewProjectData({ unitCount: e.target.value })}
            className="w-full border rounded p-1.5 mt-1"
          />
        </label>
        <label>
          成本金額（萬）
          <input
            type="number"
            step="0.01"
            value={newProjectData.cost}
            onChange={(e) => setNewProjectData({ cost: e.target.value })}
            className="mt-1 w-full border rounded p-1.5 text-right tabular-nums"
          />
        </label>
        <label>
          報價（萬）
          <input
            type="number"
            step="0.01"
            value={newProjectData.quoteAmount}
            onChange={(e) => setNewProjectData({ quoteAmount: e.target.value })}
            className="mt-1 w-full border rounded p-1.5 text-right tabular-nums"
          />
        </label>
        <label>
          預計完工日
          <input
            type="date"
            value={newProjectData.expectedDate}
            onChange={(e) => setNewProjectData({ expectedDate: e.target.value })}
            className="w-full border rounded p-1.5 mt-1"
          />
        </label>
        <div className="col-span-1 sm:col-span-2 md:col-span-4 flex justify-end gap-2 pt-2 border-t border-emerald-200">
          <button
            type="button"
            onClick={() => setProjectPanelOpen(false)}
            className="px-4 py-1.5 border rounded font-semibold text-slate-600 bg-white hover:bg-slate-100"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving || !newProjectData.projectName || !newProjectData.customerId || !newProjectData.siteAddress || !newProjectData.salesRepId}
            className="px-5 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? "儲存中..." : "確認新增"}
          </button>
        </div>
      </div>
    </form>
  );
}

interface WorkbenchEditProjectRowProps extends WorkbenchProjectFormsProps {
  projectId: string;
  projectName: string;
  colSpan: number;
}

/**
 * 編輯案場內嵌表單列（獨立訂閱 newProjectData，打字時不觸發父表格與其他列重繪）
 */
export function WorkbenchEditProjectRow({
  projectId,
  projectName,
  colSpan,
  customers,
  selectableUsers,
  onInvalidate,
}: WorkbenchEditProjectRowProps) {
  const queryClient = useQueryClient();
  const closeEditProject = useWorkbenchStore((s) => s.closeEditProject);
  const newProjectData = useWorkbenchStore((s) => s.newProjectData);
  const setNewProjectData = useWorkbenchStore((s) => s.setNewProjectData);

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectData.projectName || !newProjectData.customerId || !newProjectData.siteAddress) return;
    setSaving(true);
    try {
      const payload = {
        ...newProjectData,
        unitCount: newProjectData.unitCount ? Number(newProjectData.unitCount) : undefined,
        cost: newProjectData.cost ? fromTenThousands(Number(newProjectData.cost)) : undefined,
        quoteAmount: newProjectData.quoteAmount ? fromTenThousands(Number(newProjectData.quoteAmount)) : undefined,
        salesRepId: newProjectData.salesRepId || undefined,
      };
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId, ...payload }),
      });
      if (res.ok) {
        const result = await res.json();
        const savedProject = result?.project;
        if (savedProject) {
          queryClient.setQueryData<WorkbenchDashboardDTO>(QUERY_KEYS.workbench, (old) => {
            if (!old) return old;
            return {
              ...old,
              myProjects: old.myProjects.map((p) =>
                p.id === projectId
                  ? {
                      ...p,
                      projectName: savedProject.projectName,
                      customerId: savedProject.customerId,
                      customerName: savedProject.customerName,
                      customerType: savedProject.customerType,
                      defaultDiscount: savedProject.defaultDiscount,
                      siteAddress: savedProject.siteAddress,
                      siteCondition: savedProject.siteCondition || "",
                      expectedDate: savedProject.expectedDate ? savedProject.expectedDate.slice(0, 10) : "",
                      unitCount: savedProject.unitCount,
                      cost: savedProject.cost,
                      quoteAmount: savedProject.quoteAmount,
                      totalAmount: savedProject.quoteAmount ?? null,
                      salesRepId: savedProject.salesRepId,
                      salesRepName: savedProject.salesRepName,
                      salesAssistantName: savedProject.salesAssistantName || null,
                    }
                  : p
              ),
            };
          });
        }
        closeEditProject();
        void onInvalidate({ includeViews: true });
        toast.success("案場資料已成功更新！");
      } else {
        const err = await res.json();
        toast.error(err.error || "儲存案場失敗");
      }
    } catch {
      toast.error("儲存案場失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-emerald-50/90 border-b-2 border-emerald-500">
      <td colSpan={colSpan} className="p-4 shadow-inner">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex justify-between items-center font-bold text-slate-800">
            <span className="flex items-center gap-1.5 text-emerald-800 text-sm">
              <Edit3 className="w-4 h-4" /> 編輯案場：{projectName}
            </span>
            <button
              type="button"
              onClick={closeEditProject}
              className="text-slate-500 hover:text-slate-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <label className="font-semibold text-slate-700">
              案場名稱 *
              <input
                required
                value={newProjectData.projectName}
                onChange={(e) => setNewProjectData({ projectName: e.target.value })}
                className="w-full border rounded p-1.5 mt-1 bg-white"
              />
            </label>
            <label className="font-semibold text-slate-700">
              客戶 *
              <select
                required
                value={newProjectData.customerId}
                onChange={(e) => {
                  const nextCustId = e.target.value;
                  const selectedCust = customers.find((c) => c.id === nextCustId);
                  setNewProjectData((prev) => {
                    const defaultRep =
                      selectedCust?.salesRepId && selectableUsers.some((u) => u.id === selectedCust.salesRepId)
                        ? selectedCust.salesRepId
                        : prev.salesRepId || selectableUsers[0]?.id || "";
                    return {
                      ...prev,
                      customerId: nextCustId,
                      salesRepId: defaultRep,
                    };
                  });
                }}
                className="w-full border rounded p-1.5 mt-1 bg-white"
              >
                <option value="">選擇客戶</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="font-semibold text-slate-700">
              主責業務
              <select
                value={newProjectData.salesRepId || ""}
                onChange={(e) => setNewProjectData({ salesRepId: e.target.value })}
                className="w-full border rounded p-1.5 mt-1 bg-white"
              >
                <option value="">未指定</option>
                {selectableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="font-semibold text-slate-700">
              施工地址 *
              <input
                required
                value={newProjectData.siteAddress}
                onChange={(e) => setNewProjectData({ siteAddress: e.target.value })}
                className="w-full border rounded p-1.5 mt-1 bg-white"
              />
            </label>
            <label className="font-semibold text-slate-700">
              戶數
              <input
                type="number"
                value={newProjectData.unitCount}
                onChange={(e) => setNewProjectData({ unitCount: e.target.value })}
                className="w-full border rounded p-1.5 mt-1 bg-white"
              />
            </label>
            <label className="font-semibold text-slate-700">
              成本金額（萬）
              <input
                type="number"
                step="0.01"
                value={newProjectData.cost}
                onChange={(e) => setNewProjectData({ cost: e.target.value })}
                className="mt-1 w-full border rounded p-1.5 text-right tabular-nums bg-white"
              />
            </label>
            <label className="font-semibold text-slate-700">
              報價（萬）
              <input
                type="number"
                step="0.01"
                value={newProjectData.quoteAmount}
                onChange={(e) => setNewProjectData({ quoteAmount: e.target.value })}
                className="mt-1 w-full border rounded p-1.5 text-right tabular-nums bg-white"
              />
            </label>
            <label className="font-semibold text-slate-700">
              預計完工日
              <input
                type="date"
                value={newProjectData.expectedDate}
                onChange={(e) => setNewProjectData({ expectedDate: e.target.value })}
                className="w-full border rounded p-1.5 mt-1 bg-white"
              />
            </label>
            <div className="col-span-1 sm:col-span-2 md:col-span-4 flex justify-end gap-2 pt-2 border-t border-emerald-200">
              <button
                type="button"
                onClick={closeEditProject}
                className="px-3 py-1.5 border rounded font-semibold text-slate-600 bg-white hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving || !newProjectData.projectName || !newProjectData.customerId || !newProjectData.siteAddress || !newProjectData.salesRepId}
                className="px-5 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving ? "儲存中..." : "確認儲存"}
              </button>
            </div>
          </div>
        </form>
      </td>
    </tr>
  );
}
