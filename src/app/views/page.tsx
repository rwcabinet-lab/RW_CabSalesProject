"use client";

import { useState, useEffect } from "react";
import { Kanban, BarChart3, Calendar, RefreshCw, Sparkles, Layers, ShieldAlert } from "lucide-react";
import { KanbanBoard } from "@/components/views/KanbanBoard";
import { GanttChart } from "@/components/views/GanttChart";
import { CalendarView } from "@/components/views/CalendarView";

export default function VisualViewsPage() {
  const [activeTab, setActiveTab] = useState<"kanban" | "gantt" | "calendar">("kanban");
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/views/data");
      const json = await res.json();
      if (Array.isArray(json.projects)) setProjects(json.projects);
      if (Array.isArray(json.tasks)) setTasks(json.tasks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (projectId: string, newStage: string) => {
    try {
      const res = await fetch("/api/projects/stage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, stage: newStage }),
      });
      if (res.ok) {
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, currentStage: newStage } : p))
        );
      }
    } catch (err) {
      console.error("Failed to update project stage:", err);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center space-y-3">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
        <p className="text-slate-500 font-medium text-sm">正在載入多元可視化視圖數據...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* 頁面標題與模式切換 Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              模組 D：多元可視化視圖
            </span>
            <span className="text-xs text-slate-500 font-medium">看板拖拉、甘特圖時程軸、行事曆排程</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
            全廠專案時程多維可視化檢視
          </h1>
        </div>

        {/* Tab 標籤切換組件 */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab("kanban")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "kanban"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>看板拖拉 (Kanban)</span>
          </button>

          <button
            onClick={() => setActiveTab("gantt")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "gantt"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>甘特圖 (Gantt)</span>
          </button>

          <button
            onClick={() => setActiveTab("calendar")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "calendar"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>行事曆 (Calendar)</span>
          </button>
        </div>
      </div>

      {/* 視圖內容 */}
      {activeTab === "kanban" && (
        <KanbanBoard
          projects={projects}
          onProjectStageChange={handleStageChange}
        />
      )}

      {activeTab === "gantt" && <GanttChart projects={projects} />}

      {activeTab === "calendar" && (
        <CalendarView projects={projects} tasks={tasks} />
      )}
    </div>
  );
}
