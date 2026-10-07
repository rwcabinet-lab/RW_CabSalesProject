export type CustomerTypeDTO =
  | "LONGMEI_STORE"
  | "CABINET_FACTORY"
  | "DESIGN_COMPANY"
  | "DEALER_COMPANY"
  | "CONSTRUCTION"
  | "LABOR_MATERIAL"
  | "INDIVIDUAL"
  | "DESIGNER"
  | "PR"
  | "CONTRACTOR"
  | "DEALER"
  | "HOMEOWNER";

export type PaymentTermsDTO = "CASH" | "MONTHLY_30" | "DEPOSIT_BALANCE";
export type ProjectStageDTO =
  | "INQUIRY"
  | "MEASUREMENT"
  | "QUOTE"
  | "CONTRACT"
  | "CAD_DRAWING"
  | "HANDOFF"
  | "DONE"
  | "CONTACT"
  | "DESIGN"
  | "PRODUCTION"
  | "CLOSED"
  | "BILLED"
  | "WRAP_UP"
  | "LOST";
export type MilestonePhaseDTO = "CONTACT" | "DESIGN" | "PRODUCTION" | "EXTRA";
export type MilestoneStageCodeDTO =
  | "1-1" | "1-2" | "1-3" | "1-4" | "1-5"
  | "2-1" | "2-2" | "2-3" | "2-4"
  | "3-1" | "3-2" | "3-3" | "3-4" | "3-5"
  | "X-1" | "X-2";
export type MilestoneStatusDTO = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
export type TaskPriorityDTO = "HIGH" | "MEDIUM" | "LOW";
export type TaskTypeDTO = "SITE_VISIT" | "DRAWING" | "QUOTE_FOLLOWUP" | "PAYMENT_REMINDER";
export type QuoteStatusDTO = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";

export type ApiResponse<T> = T & { error?: string };

export interface UserDTO {
  id: string;
  name: string;
  role: string;
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
  trafficLight?: TrafficLightDTO;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  stageName?: string;
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
}

export interface QuoteVersionCreateDTO {
  totalAmount: number;
  externalQuoteNo?: string;
  quoteFileUrl?: string;
  notes?: string;
  status: QuoteStatusDTO;
}

export interface TrafficLightDTO {
  color: "RED" | "YELLOW" | "GREEN" | "GRAY";
  label: string;
  daysDiff: number;
}

export interface CalendarEventDTO {
  id: string;
  type: "MILESTONE" | "TASK";
  project?: ProjectDTO;
  title?: string;
  subject?: string;
  projectName?: string;
  plannedEnd?: string | null;
  dueDatetime?: string;
  status?: MilestoneStatusDTO;
  assignedToName?: string | null;
  notes?: string | null;
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
}

export interface StageBottleneckDTO {
  stage: string;
  stageLabel: string;
  projectCount: number;
  delayedCount: number;
}

export interface ManagerAssignmentTaskDTO {
  id: string;
  assignedToId: string;
  subject: string;
  priority: TaskPriorityDTO;
  dueDatetime: string;
}

export interface ManagerProjectOverviewDTO {
  id: string;
  projectName: string;
  customerName: string;
  customerType: string;
  currentStage: string;
  currentStageLabel: string;
  salesRepName: string;
  salesAssistantName: string | null;
  isDelayed: boolean;
  trafficLight: TrafficLightDTO;
  expectedDate: string;
  unitCount?: number;
  totalAmount: number | null;
  recentlyCompletedMilestoneName: string | null;
  recentlyCompletedMilestoneDate: string | null;
  activeMilestoneName: string | null;
  activeMilestoneId: string | null;
  activeMilestoneAssignedTo: string | null;
  unassignedNextMilestoneName: string | null;
  assignmentTask: ManagerAssignmentTaskDTO | null;
}

export interface AssignableUserDTO {
  id: string;
  name: string;
  role: "SALES_MANAGER" | "SALES" | "ASSISTANT";
}

export type CustomerItem = CustomerDTO;
export type ProjectDetail = ProjectDTO;
export type ProjectMilestoneItem = MilestoneDTO;
export type SalesTaskItem = TaskDTO;
export type MilestonePhase = MilestonePhaseDTO;
export type MilestoneStageCode = MilestoneStageCodeDTO;
