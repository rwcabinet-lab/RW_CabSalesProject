import type {
  CustomerType,
  PaymentTerms,
  ProjectStage,
  MilestoneStatus,
  TaskPriority,
  TaskType,
  Role,
} from "@prisma/client";

export type CustomerTypeDTO = CustomerType | "PR";
export type PaymentTermsDTO = PaymentTerms;
export type ProjectStageDTO = ProjectStage;
export type MilestoneStatusDTO = MilestoneStatus;
export type TaskPriorityDTO = TaskPriority;
export type TaskTypeDTO = TaskType;

export type MilestonePhaseDTO =
  | "DEVELOP"
  | "REQUIREMENT"
  | "PROPOSAL"
  | "PRE_PROD"
  | "PROD_SHIP"
  | "INSTALL"
  | "CLOSURE"
  | "EXTRA"
  | "CONTACT"
  | "DESIGN"
  | "PRODUCTION";

export type MilestoneStageCodeDTO =
  | "1-1" | "1-2"
  | "2-1" | "2-2" | "2-3" | "2-4" | "2-5"
  | "3-1" | "3-2" | "3-3" | "3-4" | "3-5"
  | "4-1" | "4-2" | "4-3" | "4-4"
  | "5-1" | "5-2" | "5-3"
  | "6-1" | "6-2" | "6-3" | "6-4" | "6-5"
  | "7-1" | "7-2" | "7-3" | "7-4"
  | "X-1" | "X-2";

export interface MilestoneRecordDTO {
  id: string;
  milestoneId: string;
  recordOrder: number;
  plannedDueDate?: string | null;
  actualDueDate?: string | null;
  amount?: number | null;
  notes?: string | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  createdAt?: string;
}

export type ApiResponse<T> = T & { error?: string };

export interface UserDTO {
  id: string;
  name: string;
  role: Role | string;
  email?: string;
}

export interface CustomerStatItemDTO {
  id: string;
  name: string;
  customerType: string;
  customerTypeLabel: string;
  taxId: string;
  phone: string;
  address: string;
  defaultDiscount: number;
  paymentTerms: string;
  salesRepId: string;
  salesRepName: string;
  totalProjects: number;
  activeProjects: number;
  closedProjects: number;
  lostProjects: number;
  totalQuoteAmount: number;
  totalSignedAmount: number;
  latestProjectName: string;
  latestProjectStage: string;
}

export interface CustomerStatsDashboardDTO {
  kpi: {
    totalCustomers: number;
    activeCustomerCount: number;
    totalQuoteSum: number;
    totalSignedSum: number;
  };
  customerTypeDistribution: Array<{
    type: string;
    label: string;
    count: number;
    totalAmount: number;
  }>;
  customers: CustomerStatItemDTO[];
}

export interface CustomerDTO {
  id: string;
  customerType: CustomerTypeDTO;
  name: string;
  taxId?: string;
  phone: string;
  address?: string;
  defaultDiscount: number;
  paymentTerms: PaymentTermsDTO;
  salesRepId: string;
  salesRepName?: string;
}

export interface CustomerCreateDTO {
  name: string;
  customerType: CustomerTypeDTO;
  taxId?: string;
  phone: string;
  address?: string;
  defaultDiscount: number;
  paymentTerms?: PaymentTermsDTO;
  salesRepId: string;
}

export interface CustomerUpdateDTO extends CustomerCreateDTO {
  paymentTerms: PaymentTermsDTO;
}

export interface ProjectDTO {
  id: string;
  projectName: string;
  customerId: string;
  customerName: string;
  customerType: string;
  defaultDiscount: number;
  siteAddress: string;
  siteCondition?: string;
  salesRepId: string;
  salesRepName: string;
  customerSalesRepId?: string;
  customerSalesRepName?: string;
  salesAssistantId?: string;
  salesAssistantName?: string;
  currentStage: string;
  isDelayed: boolean;
  expectedDate?: string;
  estimatedBudget?: number;
  unitCount?: number;
  cost?: number;
  quoteAmount?: number;
  totalAmount?: number | null;
}

export interface WorkbenchProjectDTO {
  id: string;
  projectName: string;
  customerId: string;
  customerName: string;
  customerType: string;
  defaultDiscount: number;
  siteCondition: string;
  expectedDate: string;
  currentStage: string;
  siteAddress: string;
  isDelayed: boolean;
  isClosed?: boolean;
  salesRepId?: string;
  salesRepName?: string;
  salesAssistantName?: string | null;
  totalAmount: number | null;
  unitCount?: number;
  cost?: number;
  quoteAmount?: number;
  activeMilestone: {
    id: string;
    stageCode: MilestoneStageCodeDTO;
    phase: MilestonePhaseDTO;
    stageName: string;
    plannedDueDate: string;
    status: MilestoneStatusDTO;
  } | null;
  trafficLight: TrafficLightDTO;
}

export interface MilestoneDTO {
  id: string;
  projectId: string;
  stageCode: MilestoneStageCodeDTO;
  phase: MilestonePhaseDTO;
  stageOrder: number;
  plannedDueDate?: string | null;
  actualDueDate?: string | null;
  status: MilestoneStatusDTO;
  priority?: TaskPriorityDTO;
  assignedToId?: string | null;
  assignedToName?: string | null;
  attachments?: string | null;
  notes?: string | null;
  auditSubmitted?: boolean;
  trafficLight?: TrafficLightDTO;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  stageName?: string;
  records?: MilestoneRecordDTO[];
}

export interface ColumnItemDTO {
  key: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface ColumnConfigDTO {
  columns: ColumnItemDTO[];
}

export interface ProjectWithMilestonesDTO extends ProjectDTO {
  milestones: MilestoneDTO[];
}

export interface MilestoneDetailsDTO {
  project: ProjectDTO;
  milestones: (MilestoneDTO & { trafficLight: TrafficLightDTO })[];
}

export interface TaskDTO {
  id: string;
  projectId: string;
  projectName?: string;
  assignedToId: string;
  assignedToName?: string;
  assignedById?: string | null;
  assignedByName?: string | null;
  milestoneId?: string | null;
  taskType: TaskTypeDTO;
  subject: string;
  dueDatetime: string;
  priority: TaskPriorityDTO;
  isCompleted: boolean;
  resultNotes?: string | null;
  completedAt?: string | null;
}

export interface WorkbenchDashboardDTO {
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
  myProjects: WorkbenchProjectDTO[];
  tasks: TaskDTO[];
}

export interface ViewsDataDTO {
  projects: ProjectWithMilestonesDTO[];
  tasks: TaskDTO[];
  staff: CalendarStaffDTO[];
}

export interface CalendarStaffDTO {
  id: string;
  name: string;
  role: "SALES_MANAGER" | "SALES" | "ASSISTANT" | "SITE_ENGINEER" | string;
}

export interface TrafficLightDTO {
  color: "RED" | "YELLOW" | "GREEN" | "GRAY";
  label: string;
  daysDiff: number;
}

export interface ManagerDashboardDTO {
  kpi: {
    totalProjects: number;
    signedTotal: number;
    conversionRate: number;
    delayedCount: number;
  };
  alertList: ManagerAlertDTO[];
  salesWorkload: SalesWorkloadDTO[];
  stageBottlenecks: StageBottleneckDTO[];
  allProjectsOverview: ManagerProjectOverviewDTO[];
  assignedTasks: TaskDTO[];
}

export interface ManagerAlertDTO {
  id: string;
  projectName: string;
  customerName: string;
  customerType: string;
  currentStage: string;
  salesRepName: string;
  salesAssistantName?: string;
  stalledMilestone: string;
  plannedDueDate: string;
  overdueLabel: string;
  notes: string;
}

export interface SalesWorkloadDTO {
  salesRepName: string;
  totalProjects: number;
  delayedProjects: number;
  role?: string;
  roleLabel?: string;
}

export interface StageBottleneckDTO {
  stage: string;
  stageLabel: string;
  projectCount: number;
  delayedCount: number;
}

export interface ManagerProjectOverviewDTO {
  id: string;
  projectName: string;
  siteAddress?: string;
  customerName: string;
  customerType: string;
  defaultDiscount?: number;
  currentStage: string;
  currentStageLabel: string;
  salesRepName: string;
  salesAssistantName: string | null;
  isDelayed: boolean;
  isClosed?: boolean;
  trafficLight: TrafficLightDTO;
  expectedDate: string;
  unitCount?: number;
  cost?: number;
  quoteAmount?: number;
  totalAmount: number | null;
  lastCompletedMilestoneName: string | null;
  activeMilestoneName: string | null;
  activeMilestoneId: string | null;
  activeMilestoneAssignedTo: string | null;
  unassignedNextMilestoneName: string | null;
}

export interface AssignableUserDTO {
  id: string;
  name: string;
  role: "SALES_MANAGER" | "SALES" | "ASSISTANT" | "SITE_ENGINEER" | string;
}

export type CustomerItem = CustomerDTO;
export type ProjectDetail = ProjectDTO;
export type ProjectMilestoneItem = MilestoneDTO;
export type MilestonePhase = MilestonePhaseDTO;
export type SalesTaskItem = TaskDTO;

export interface ManagedUserDTO {
  id: string;
  name: string;
  email: string;
  role: any;
}

export interface RolePermissionDTO {
  role: any;
  label: string;
  pages: any[];
}
export type MilestoneStageCode = MilestoneStageCodeDTO;

// ----------------------------------------------------------------
// 案件現況統計 (經營會議報告) 專用 DTO
// ----------------------------------------------------------------
export interface ProjectStatusItemDTO {
  id: string;
  customerName: string;
  projectName: string;
  region: string;
  unitCount: number;
  amount: number | null;
  progressNotes?: string;
  expectedDate?: string | null;
  year: string;
  currentStage?: string;
  overrideSection?: "SIGNED" | "ESTIMATING" | "QUOTED" | null;
  salesRepName?: string;
}

export interface ProjectStatusYearGroupDTO {
  year: string;
  subtotalAmount: number;
  subtotalLabel: string;
  totalUnits: number;
  projects: ProjectStatusItemDTO[];
}

export interface ProjectStatusSectionDTO {
  title: string;
  key: "SIGNED" | "ESTIMATING" | "QUOTED";
  totalAmount: number;
  totalAmountLabel: string;
  totalProjects: number;
  totalUnits: number;
  yearlyGroups: ProjectStatusYearGroupDTO[];
}

export interface TargetPeriodSummaryDTO {
  periodKey: string; // e.g. "2026/Q1", "2026/10月"
  periodLabel: string;
  targetAmount: number;
  actualAmount: number;
  achievementRate: number;
  cumulativeActual: number;
  isCurrent?: boolean;
}

export interface ExecutiveReportTargetSummaryDTO {
  annualYear: number;
  annualTarget: number;
  cumulativeActual: number;
  achievementRate: number;
  periods: TargetPeriodSummaryDTO[];
}

export interface ManagerProjectStatusReportDTO {
  reportTitle: string;
  year: number;
  month: number;
  targetSummary: ExecutiveReportTargetSummaryDTO;
  signedSection: ProjectStatusSectionDTO;
  estimatingSection: ProjectStatusSectionDTO;
  quotedSection: ProjectStatusSectionDTO;
}

