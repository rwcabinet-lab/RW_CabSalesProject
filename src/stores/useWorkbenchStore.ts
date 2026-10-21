import { create } from "zustand";
import type { TaskDTO, WorkbenchProjectDTO } from "@/types/dto";
import { toTenThousands } from "@/lib/currency";

export interface ProjectFormData {
  projectName: string;
  customerId: string;
  siteAddress: string;
  siteCondition: string;
  expectedDate: string;
  unitCount: string;
  cost: string;
  quoteAmount: string;
}

export interface TaskFormData {
  projectId: string;
  subject: string;
  taskType: string;
  dueDatetime: string;
  priority: string;
}

interface WorkbenchState {
  // 篩選與排序
  startMonth: string;
  endMonth: string;
  statusFilter: string;
  stageFilter: string;
  dateSort: "NONE" | "ASC" | "DESC";
  statusSort: "NONE" | "URGENT_FIRST" | "NORMAL_FIRST";

  // 專案面板
  isProjectPanelOpen: boolean;
  editingProjectId: string | null;
  newProjectData: ProjectFormData;

  // 待辦 Modal
  showTaskModal: boolean;
  newTaskData: TaskFormData;
  taskToComplete: TaskDTO | null;
  completionNotes: string;
  completionDate: string;

  // Actions
  setStartMonth: (val: string) => void;
  setEndMonth: (val: string) => void;
  setStatusFilter: (val: string) => void;
  setStageFilter: (val: string) => void;
  setDateSort: (val: "NONE" | "ASC" | "DESC") => void;
  setStatusSort: (val: "NONE" | "URGENT_FIRST" | "NORMAL_FIRST") => void;
  toggleDateSort: () => void;
  toggleStatusSort: () => void;
  resetFilters: () => void;

  setProjectPanelOpen: (open: boolean) => void;
  setEditingProjectId: (id: string | null) => void;
  setNewProjectData: (data: Partial<ProjectFormData> | ((prev: ProjectFormData) => ProjectFormData)) => void;
  openAddProject: (defaultCustomerId?: string) => void;
  openEditProject: (project: WorkbenchProjectDTO) => void;
  closeEditProject: () => void;

  setShowTaskModal: (show: boolean) => void;
  setNewTaskData: (data: Partial<TaskFormData> | ((prev: TaskFormData) => TaskFormData)) => void;
  setTaskToComplete: (task: TaskDTO | null) => void;
  setCompletionNotes: (notes: string) => void;
  setCompletionDate: (date: string) => void;
  resetTaskModal: () => void;
}

const getDefaultTaskDueDatetime = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const getTodayDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const initialProjectForm: ProjectFormData = {
  projectName: "",
  customerId: "",
  siteAddress: "",
  siteCondition: "",
  expectedDate: "",
  unitCount: "",
  cost: "",
  quoteAmount: "",
};

const initialTaskForm: TaskFormData = {
  projectId: "",
  subject: "",
  taskType: "SITE_VISIT",
  dueDatetime: getDefaultTaskDueDatetime(),
  priority: "HIGH",
};

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  startMonth: "",
  endMonth: "",
  statusFilter: "",
  stageFilter: "ACTIVE",
  dateSort: "NONE",
  statusSort: "NONE",

  isProjectPanelOpen: false,
  editingProjectId: null,
  newProjectData: initialProjectForm,

  showTaskModal: false,
  newTaskData: initialTaskForm,
  taskToComplete: null,
  completionNotes: "",
  completionDate: getTodayDate(),

  setStartMonth: (val) => set({ startMonth: val }),
  setEndMonth: (val) => set({ endMonth: val }),
  setStatusFilter: (val) => set({ statusFilter: val }),
  setStageFilter: (val) => set({ stageFilter: val }),
  setDateSort: (val) => set({ dateSort: val }),
  setStatusSort: (val) => set({ statusSort: val }),
  toggleDateSort: () =>
    set((state) => ({
      dateSort: state.dateSort === "NONE" ? "ASC" : state.dateSort === "ASC" ? "DESC" : "NONE",
    })),
  toggleStatusSort: () =>
    set((state) => ({
      statusSort:
        state.statusSort === "NONE"
          ? "URGENT_FIRST"
          : state.statusSort === "URGENT_FIRST"
          ? "NORMAL_FIRST"
          : "NONE",
    })),
  resetFilters: () =>
    set({
      startMonth: "",
      endMonth: "",
      statusFilter: "",
      stageFilter: "ACTIVE",
      dateSort: "NONE",
      statusSort: "NONE",
    }),

  setProjectPanelOpen: (open) => set({ isProjectPanelOpen: open }),
  setEditingProjectId: (id) => set({ editingProjectId: id }),
  setNewProjectData: (data) =>
    set((state) => ({
      newProjectData: typeof data === "function" ? data(state.newProjectData) : { ...state.newProjectData, ...data },
    })),
  openAddProject: (defaultCustomerId = "") =>
    set({
      editingProjectId: null,
      newProjectData: { ...initialProjectForm, customerId: defaultCustomerId },
      isProjectPanelOpen: true,
    }),
  openEditProject: (p) =>
    set((state) => {
      if (state.editingProjectId === p.id) {
        return { editingProjectId: null };
      }
      return {
        editingProjectId: p.id,
        newProjectData: {
          projectName: p.projectName,
          customerId: p.customerId,
          siteAddress: p.siteAddress,
          siteCondition: p.siteCondition,
          expectedDate: p.expectedDate ? p.expectedDate.slice(0, 10) : "",
          unitCount: p.unitCount?.toString() || "",
          cost: p.cost != null ? toTenThousands(p.cost).toFixed(1) : "",
          quoteAmount: p.quoteAmount != null ? toTenThousands(p.quoteAmount).toFixed(1) : "",
        },
      };
    }),
  closeEditProject: () => set({ editingProjectId: null }),

  setShowTaskModal: (show) => set({ showTaskModal: show }),
  setNewTaskData: (data) =>
    set((state) => ({
      newTaskData: typeof data === "function" ? data(state.newTaskData) : { ...state.newTaskData, ...data },
    })),
  setTaskToComplete: (task) =>
    set({
      taskToComplete: task,
      completionNotes: "",
      completionDate: getTodayDate(),
    }),
  setCompletionNotes: (notes) => set({ completionNotes: notes }),
  setCompletionDate: (date) => set({ completionDate: date }),
  resetTaskModal: () =>
    set({
      showTaskModal: false,
      newTaskData: { ...initialTaskForm, dueDatetime: getDefaultTaskDueDatetime() },
    }),
}));
