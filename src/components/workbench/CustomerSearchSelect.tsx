"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { CUSTOMER_TYPE_LABELS } from "@/lib/constants";
import type { CustomerDTO } from "@/types/dto";

export interface CustomerSearchSelectProps {
  customers: CustomerDTO[];
  value: string;
  onChange: (customerId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * 依關鍵字篩選客戶清單（支援客戶名稱、統編、電話、客戶類型中文）
 */
export function filterCustomersByKeyword(customers: CustomerDTO[], keyword: string): CustomerDTO[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return customers;
  return customers.filter((c) => {
    const matchName = c.name?.toLowerCase().includes(q);
    const matchTax = c.taxId?.toLowerCase().includes(q);
    const matchPhone = c.phone?.toLowerCase().includes(q);
    const typeLabel = CUSTOMER_TYPE_LABELS[c.customerType] || c.customerType || "";
    const matchType = typeLabel.toLowerCase().includes(q);
    return Boolean(matchName || matchTax || matchPhone || matchType);
  });
}

/**
 * 客戶關鍵字搜尋下拉選單 (Combobox)
 * 支援輸入關鍵字即時搜尋名稱、統編、電話，並支援鍵盤上下鍵導航與快速選取
 */
export function CustomerSearchSelect({
  customers,
  value,
  onChange,
  placeholder = "搜尋或選擇客戶...",
  disabled = false,
  className = "",
  id,
}: CustomerSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === value),
    [customers, value]
  );

  const filteredCustomers = useMemo(
    () => filterCustomersByKeyword(customers, searchQuery),
    [customers, searchQuery]
  );

  // 點擊外部自動收合
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  // 開啟時自動聚焦搜尋輸入框
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // 當高亮索引變更時，自動將選單項目滾動至可視區域
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll<HTMLButtonElement>("[data-item-index]");
      const currentItem = items[highlightedIndex];
      if (currentItem) {
        currentItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (customerId: string) => {
    onChange(customerId);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredCustomers.length === 0 ? 0 : Math.min(prev + 1, filteredCustomers.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCustomers[highlightedIndex]) {
        handleSelect(filteredCustomers[highlightedIndex].id);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* 觸發下拉按鈕 */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full border rounded p-1.5 mt-1 bg-white text-left text-sm flex items-center justify-between transition-colors ${
          isOpen
            ? "border-emerald-500 ring-1 ring-emerald-500 shadow-xs"
            : "border-slate-300 hover:border-slate-400"
        } ${disabled ? "bg-slate-100 cursor-not-allowed opacity-60" : "cursor-pointer"} ${className}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-1.5 truncate flex-1 min-w-0 mr-1">
          {selectedCustomer ? (
            <>
              <span className="font-semibold text-slate-800 truncate">{selectedCustomer.name}</span>
              <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {CUSTOMER_TYPE_LABELS[selectedCustomer.customerType] || selectedCustomer.customerType}
              </span>
            </>
          ) : (
            <span className="text-slate-400 text-xs">{placeholder}</span>
          )}
        </span>

        <span className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="p-0.5 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
              title="清除選取"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {/* 下拉搜尋浮層 */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 duration-100">
          {/* 關鍵字搜尋框 */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="輸入客戶名稱、統編或電話搜尋..."
                className="w-full text-xs bg-white border border-slate-200 rounded-md pl-8 pr-7 py-1.5 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5"
                  title="清除搜尋文字"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <div className="text-[10px] text-slate-500 mt-1 px-1 flex justify-between">
                <span>搜尋：「{searchQuery}」</span>
                <span>找到 {filteredCustomers.length} 位客戶</span>
              </div>
            )}
          </div>

          {/* 候選客戶清單 */}
          <div ref={listRef} className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {filteredCustomers.length === 0 ? (
              <div className="py-6 px-4 text-center text-xs text-slate-400">
                {searchQuery ? (
                  <>查無符合「<span className="text-slate-600 font-medium">{searchQuery}</span>」的特定名稱客戶</>
                ) : (
                  "尚無客戶可供選擇"
                )}
              </div>
            ) : (
              filteredCustomers.map((cust, idx) => {
                const isSelected = cust.id === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={cust.id}
                    type="button"
                    data-item-index={idx}
                    onClick={() => handleSelect(cust.id)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? "bg-emerald-50 text-emerald-900 font-medium"
                        : isHighlighted
                        ? "bg-slate-50 text-slate-900"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800 truncate">{cust.name}</span>
                        <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {CUSTOMER_TYPE_LABELS[cust.customerType] || cust.customerType}
                        </span>
                      </div>
                      {(cust.taxId || cust.phone) && (
                        <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                          {cust.taxId && <span>統編: {cust.taxId}</span>}
                          {cust.phone && <span>電話: {cust.phone}</span>}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
