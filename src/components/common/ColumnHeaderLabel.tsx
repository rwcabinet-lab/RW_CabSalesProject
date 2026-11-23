import { PROJECT_COLUMN_HEADER_LINES } from "@/lib/constants";

/**
 * 案件表格表頭標籤元件：複合欄位取消「/」分隔，改為上下主次顯示。
 */
export function ColumnHeaderLabel({
  colKey,
  fallbackLabel,
}: {
  colKey: string;
  fallbackLabel: string;
}) {
  const parts = PROJECT_COLUMN_HEADER_LINES[colKey];
  if (!parts) {
    return <span>{fallbackLabel}</span>;
  }
  if (!parts.secondary) {
    return <span>{parts.primary}</span>;
  }
  return (
    <span className="inline-flex flex-col leading-tight text-left">
      <span className="font-bold">{parts.primary}</span>
      <span className="text-[10px] font-medium text-slate-400">{parts.secondary}</span>
    </span>
  );
}
