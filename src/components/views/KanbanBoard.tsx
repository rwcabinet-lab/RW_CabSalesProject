"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  Building,
  User,
  ShieldAlert,
  Clock,
  ArrowRight,
  GripVertical,
} from "lucide-react";
import { ProjectDetail } from "@/lib/mock-data";

interface KanbanProps {
  projects: any[];
  onProjectStageChange: (projectId: string, newStage: string) => Promise<void>;
}

const STAGES = [
  { id: "INQUIRY", label: "洽談諮詢", color: "bg-slate-100 text-slate-700" },
  { id: "MEASUREMENT", label: "現場丈量", color: "bg-blue-100 text-blue-800" },
  { id: "QUOTE", label: "初報細報", color: "bg-indigo-100 text-indigo-800" },
  { id: "CONTRACT", label: "複丈簽約", color: "bg-purple-100 text-purple-800" },
  { id: "CAD_DRAWING", label: "圖面定稿拆單", color: "bg-amber-100 text-amber-800" },
  { id: "HANDOFF", label: "下單交廠", color: "bg-cyan-100 text-cyan-800" },
  { id: "DONE", label: "結案完工", color: "bg-emerald-100 text-emerald-800" },
];

export function KanbanBoard({ projects, onProjectStageChange }: KanbanProps) {
  const [items, setItems] = useState(projects);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const newStage = destination.droppableId;

    // 樂觀更新前端狀態
    setItems((prev) =>
      prev.map((p) => (p.id === draggableId ? { ...p, currentStage: newStage } : p))
    );

    // 呼叫後端 API 持久化
    await onProjectStageChange(draggableId, newStage);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
        <span>💡 提示：按住卡片即可自由拖曳至其他階段欄位，系統將即時同步更新案場狀態！</span>
        <span className="font-semibold">共 7 大階段推進漏斗</span>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-6 min-h-[650px] pt-1">
          {STAGES.map((col) => {
            const columnProjects = items.filter((p) => p.currentStage === col.id);

            return (
              <div
                key={col.id}
                className="w-72 shrink-0 flex flex-col bg-slate-100/70 rounded-2xl border border-slate-200/80 p-3"
              >
                {/* 欄位 Header */}
                <div className="flex items-center justify-between px-2 py-1.5 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${col.color}`}>
                      {col.label}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs">
                    {columnProjects.length}
                  </span>
                </div>

                {/* 拖放 Droppable 區域 */}
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 space-y-3 rounded-xl p-1 transition-colors ${
                        snapshot.isDraggingOver ? "bg-blue-100/50" : ""
                      }`}
                    >
                      {columnProjects.map((project, index) => (
                        <Draggable
                          key={project.id}
                          draggableId={project.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-white rounded-xl p-4 border shadow-xs transition hover:shadow-md ${
                                project.isDelayed
                                  ? "border-red-300 ring-1 ring-red-200"
                                  : "border-slate-200"
                              } ${snapshot.isDragging ? "shadow-xl ring-2 ring-blue-500 rotate-1" : ""}`}
                            >
                              {/* 卡片頂部 */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="text-slate-300 hover:text-slate-600 cursor-grab"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                    {project.customerType}
                                  </span>
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                                    {project.defaultDiscount === 1.0
                                      ? "牌價"
                                      : `${(project.defaultDiscount * 10).toFixed(1)}折`}
                                  </span>
                                </div>

                                {project.isDelayed ? (
                                  <span className="text-[10px] font-black text-red-700 bg-red-100 px-1.5 py-0.2 rounded-full animate-pulse flex items-center gap-0.5">
                                    <ShieldAlert className="w-3 h-3" /> 逾期卡關
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full">
                                    🟢 正常
                                  </span>
                                )}
                              </div>

                              {/* 案場品名 */}
                              <h4 className="font-bold text-slate-900 text-xs mt-2 line-clamp-2">
                                {project.projectName}
                              </h4>

                              <p className="text-[11px] text-slate-500 mt-1 truncate">
                                業主: {project.customerName}
                              </p>

                              {project.estimatedBudget && (
                                <div className="mt-2 text-xs font-mono font-bold text-slate-800">
                                  預算: NT$ {project.estimatedBudget.toLocaleString("zh-TW")}
                                </div>
                              )}

                              {/* 卡片底部功能與業務 */}
                              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span className="font-medium text-slate-700">
                                    {project.salesRepName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <Link
                                    href={`/projects/${project.id}/milestones`}
                                    title="時程里程碑"
                                    className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
