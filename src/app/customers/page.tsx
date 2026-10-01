"use client";

import { useState, useEffect } from "react";
import { Users, Plus, Phone, MapPin, Receipt, Percent, AlertCircle, Pencil } from "lucide-react";
import { CustomerItem } from "@/lib/mock-data";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [salesReps, setSalesReps] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  // 新增表單狀態
  const [formData, setFormData] = useState({
    name: "",
    customerType: "LONGMEI_STORE",
    taxId: "",
    phone: "",
    address: "",
    defaultDiscount: "0.85",
    paymentTerms: "MONTHLY_30",
    salesRepId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    fetchCustomers();
    fetchSalesReps();
  }, []);

  const fetchSalesReps = async () => {
    try {
      const res = await fetch("/api/auth/users");
      const data = await res.json();
      if (res.ok) setSalesReps(data.filter((user: { role: string }) => user.role === "SALES"));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/customers");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error || "無法取得客戶資料");
      setCustomers(data);
      setLoadError("");
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "無法取得客戶資料");
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (type: string) => {
    const discount = type === "INDIVIDUAL" ? "1.00" : "0.85";
    const terms = type === "INDIVIDUAL" ? "DEPOSIT_BALANCE" : "MONTHLY_30";
    setFormData({ ...formData, customerType: type, defaultDiscount: discount, paymentTerms: terms });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/customers", {
        method: editingCustomerId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingCustomerId ? { id: editingCustomerId, ...formData } : formData),
      });
      const result = await res.json();
      if (res.ok) {
        setShowModal(false);
        setFormData({
          name: "",
          customerType: "LONGMEI_STORE",
          taxId: "",
          phone: "",
          address: "",
          defaultDiscount: "0.85",
          paymentTerms: "MONTHLY_30",
          salesRepId: salesReps[0]?.id || "",
        });
        setEditingCustomerId(null);
        fetchCustomers();
      } else {
        setSubmitError(result.error || "新增客戶失敗，請確認資料後重試。");
      }
    } catch (err) {
      console.error(err);
      setSubmitError("無法連線至伺服器，請稍後重試。");
    } finally {
      setSubmitting(false);
    }
  };

  const openAddModal = () => {
    setEditingCustomerId(null);
    setFormData({ name: "", customerType: "LONGMEI_STORE", taxId: "", phone: "", address: "", defaultDiscount: "0.85", paymentTerms: "MONTHLY_30", salesRepId: salesReps[0]?.id || "" });
    setSubmitError("");
    setShowModal(true);
  };

  const openEditModal = (customer: CustomerItem) => {
    setEditingCustomerId(customer.id);
    setFormData({
      name: customer.name, customerType: customer.customerType, taxId: customer.taxId || "", phone: customer.phone,
      address: customer.address || "", defaultDiscount: customer.defaultDiscount.toString(), paymentTerms: customer.paymentTerms,
      salesRepId: customer.salesRepId,
    });
    setSubmitError("");
    setShowModal(true);
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "LONGMEI_STORE":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">隆美店面</span>;
      case "CABINET_FACTORY":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-800">櫥櫃工廠</span>;
      case "DESIGN_COMPANY":
      case "DESIGNER":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">設計公司</span>;
      case "DEALER_COMPANY":
      case "DEALER":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-cyan-100 text-cyan-800">經銷公司</span>;
      case "PR":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">公關客戶</span>;
      case "CONSTRUCTION":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">營造建設</span>;
      case "LABOR_MATERIAL":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">連工帶料</span>;
      case "INDIVIDUAL":
      case "HOMEOWNER":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">個人客戶</span>;
      default:
        return null;
    }
  };

  const getTermsLabel = (terms: string) => {
    switch (terms) {
      case "MONTHLY_30":
        return "月結 30 天";
      case "DEPOSIT_BALANCE":
        return "訂金 40% / 進場 30% / 尾款 30%";
      case "CASH":
        return "現金完工結算";
      default:
        return terms;
    }
  };

  return (
    <div className="space-y-6">
      {/* 頁面標題區 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-7 h-7 text-blue-600" /> 客戶主檔管理 (Customer Management)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            支援 B2B (設計師、公關、經銷) 與 B2C (一般業主)，設定預設折率與付款帳期，報價單將自動連動套用。
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow transition"
        >
          <Plus className="w-4 h-4" /> 新增客戶主檔
        </button>
      </div>

      {/* 客戶列表 Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">載入客戶資料中...</div>
        ) : (
          <div className="overflow-x-auto">
            {loadError && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">客戶名稱 / 統編</th>
                  <th className="py-3.5 px-4">客群類型</th>
                  <th className="py-3.5 px-4">聯絡電話 / 地址</th>
                  <th className="py-3.5 px-4 text-center">預設折率 (Discount)</th>
                  <th className="py-3.5 px-4">付款條件</th>
                  <th className="py-3.5 px-4">負責業務</th>
                  <th className="py-3.5 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-900">{c.name}</div>
                      {c.taxId ? (
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Receipt className="w-3 h-3 text-slate-400" /> 統編: {c.taxId}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">無統編 (個人業主)</span>
                      )}
                    </td>
                    <td className="py-4 px-4">{getTypeBadge(c.customerType)}</td>
                    <td className="py-4 px-4 text-slate-600 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Phone className="w-3.5 h-3.5 text-slate-400" /> {c.phone}
                      </div>
                      {c.address && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate max-w-xs">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {c.address}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${
                        c.defaultDiscount < 1.0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                      }`}>
                        <Percent className="w-3 h-3" />
                        {c.defaultDiscount < 1.0 ? `${(c.defaultDiscount * 10).toFixed(1)} 折 (${c.defaultDiscount})` : "牌價無折 (1.00)"}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-700">
                      {getTermsLabel(c.paymentTerms)}
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-xs px-2 py-1 rounded bg-slate-100 font-medium text-slate-800">
                        {c.salesRepName || "林宏遠"}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button type="button" onClick={() => openEditModal(c)} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                        <Pencil className="h-3.5 w-3.5" /> 編輯
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 新增客戶 Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" /> {editingCustomerId ? "編輯客戶主檔" : "新增客戶主檔"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">客戶類型</label>
                <select
                  required
                  value={formData.customerType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="LONGMEI_STORE">隆美店面</option>
                  <option value="CABINET_FACTORY">櫥櫃工廠</option>
                  <option value="DESIGN_COMPANY">設計公司</option>
                  <option value="DEALER_COMPANY">經銷公司</option>
                  <option value="CONSTRUCTION">營造建設</option>
                  <option value="LABOR_MATERIAL">連工帶料</option>
                  <option value="INDIVIDUAL">個人客戶</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">公司名稱 / 業主姓名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：品辰室內設計工程 / 李公館"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">統一編號 (B2B可填)</label>
                  <input
                    type="text"
                    placeholder="8碼統編"
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">聯絡電話 *</label>
                  <input
                    type="text"
                    required
                    placeholder="市話或手機"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">聯絡地址</label>
                <input
                  type="text"
                  placeholder="公司地址或案場地址"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">負責業務 *</label>
                <select
                  required
                  value={formData.salesRepId}
                  onChange={(e) => setFormData({ ...formData, salesRepId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="">請選擇負責業務</option>
                  {salesReps.map((salesRep) => <option key={salesRep.id} value={salesRep.id}>{salesRep.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">預設折率 (如 0.85 代表 85折)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="1.5"
                    value={formData.defaultDiscount}
                    onChange={(e) => setFormData({ ...formData, defaultDiscount: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">付款條件</label>
                  <select
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="MONTHLY_30">月結 30 天</option>
                    <option value="DEPOSIT_BALANCE">訂金 40% / 進場 30% / 尾款 30%</option>
                    <option value="CASH">現金完工結算</option>
                  </select>
                </div>
              </div>

              {submitError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow transition disabled:opacity-50"
                >
                  {submitting ? "儲存中..." : editingCustomerId ? "確認更新" : "確認建立"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
