"use client";

import React from "react";
import { useSectionHelpStore } from "@/stores/useSectionHelpStore";

interface SectionHelpButtonProps {
  sectionId: string;
  label?: string;
  title?: string;
  className?: string;
  size?: "sm" | "md" | "icon";
}

/**
 * 專屬區塊說明按鈕 [?]
 * 點擊即彈出該區塊專用說明文件 Modal
 */
export function SectionHelpButton({
  sectionId,
  label = "[?]",
  title = "點擊查看本區專用說明文件",
  className = "",
  size = "md",
}: SectionHelpButtonProps) {
  const openHelp = useSectionHelpStore((s) => s.openHelp);

  const sizeClasses =
    size === "sm"
      ? "text-[11px] px-1 py-0.2"
      : size === "icon"
      ? "w-5 h-5 text-xs p-0 flex items-center justify-center rounded-full"
      : "text-xs px-1.5 py-0.5";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openHelp(sectionId);
      }}
      className={`inline-flex items-center justify-center font-mono font-bold rounded text-blue-600 hover:text-blue-800 bg-blue-50/90 hover:bg-blue-100 border border-blue-200 transition-colors shadow-2xs cursor-pointer select-none ${sizeClasses} ${className}`}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  );
}
