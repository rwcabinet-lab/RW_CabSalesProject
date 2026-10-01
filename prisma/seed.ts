import {
  HardwareCategory,
  MilestoneStatus,
  PaymentTerms,
  PrismaClient,
  ProjectStage,
  QuoteStatus,
  Role,
  TaskPriority,
  TaskType,
  CustomerType,
} from "@prisma/client";
import {
  INITIAL_BOARDS,
  INITIAL_CUSTOMERS,
  INITIAL_HARDWARE,
  INITIAL_MILESTONES,
  INITIAL_PROCESSING,
  INITIAL_PROJECTS,
  INITIAL_QUOTES,
  INITIAL_TASKS,
} from "../src/lib/mock-data";

const prisma = new PrismaClient();

async function seed() {
  await prisma.user.createMany({
    data: [
      { id: "u1", name: "張志豪", email: "admin@cabsales.tw", role: Role.ADMIN },
      { id: "u2", name: "王志明", email: "manager@cabsales.tw", role: Role.MANAGER },
      { id: "u3", name: "林宏遠", email: "sales.lin@cabsales.tw", role: Role.SALES },
      { id: "u4", name: "陳廷瑋", email: "sales.chen@cabsales.tw", role: Role.SALES },
      { id: "u5", name: "張育菁", email: "assistant.chang@cabsales.tw", role: Role.ASSISTANT },
    ],
    skipDuplicates: true,
  });

  await prisma.masterBoard.createMany({
    data: INITIAL_BOARDS.map((board) => ({
      id: board.id,
      brand: board.brand,
      colorCode: board.colorCode,
      thicknessMm: board.thicknessMm,
      grade: board.grade,
      unit: board.unit,
      retailPrice: board.retailPrice,
    })),
    skipDuplicates: true,
  });

  await prisma.masterHardware.createMany({
    data: INITIAL_HARDWARE.map((item) => ({
      id: item.id,
      brand: item.brand,
      modelName: item.modelName,
      category: item.category as HardwareCategory,
      retailPrice: item.retailPrice,
    })),
    skipDuplicates: true,
  });

  await prisma.masterProcessing.createMany({
    data: INITIAL_PROCESSING.map((item) => ({
      id: item.id,
      processName: item.processName,
      unit: item.unit,
      retailPrice: item.retailPrice,
    })),
    skipDuplicates: true,
  });

  await prisma.customer.createMany({
    data: INITIAL_CUSTOMERS.map((customer) => ({
      id: customer.id,
      customerType: customer.customerType as CustomerType,
      name: customer.name,
      taxId: customer.taxId,
      phone: customer.phone,
      address: customer.address,
      defaultDiscount: customer.defaultDiscount,
      paymentTerms: customer.paymentTerms as PaymentTerms,
      salesRepId: customer.salesRepId,
    })),
    skipDuplicates: true,
  });

  await prisma.project.createMany({
    data: INITIAL_PROJECTS.map((project) => ({
      id: project.id,
      projectName: project.projectName,
      customerId: project.customerId,
      siteAddress: project.siteAddress,
      siteCondition: project.siteCondition,
      salesRepId: project.salesRepId,
      salesAssistantId: project.salesAssistantId,
      currentStage: project.currentStage as ProjectStage,
      isDelayed: project.isDelayed,
      expectedDate: project.expectedDate ? new Date(project.expectedDate) : null,
      estimatedBudget: project.estimatedBudget,
      unitCount: project.unitCount,
      cost: project.cost,
      quoteAmount: project.quoteAmount,
    })),
    skipDuplicates: true,
  });

  const quotations = Object.entries(INITIAL_QUOTES).flatMap(([projectId, quotes]) =>
    quotes.map((quote) => ({
      id: quote.id,
      projectId,
      version: quote.version,
      externalQuoteNo: quote.externalQuoteNo,
      quoteFileUrl: quote.quoteFileUrl,
      notes: quote.notes,
      totalAmount: quote.totalAmount,
      status: quote.status as QuoteStatus,
    })),
  );
  await prisma.quotation.createMany({ data: quotations, skipDuplicates: true });

  const milestones = Object.values(INITIAL_MILESTONES).flatMap((items) =>
    items.map((milestone) => ({
      id: milestone.id,
      projectId: milestone.projectId,
      stageCode: milestone.stageCode,
      phase: milestone.phase,
      stageOrder: milestone.stageOrder,
      plannedDueDate: milestone.plannedDueDate ? new Date(milestone.plannedDueDate) : null,
      actualDueDate: milestone.actualDueDate ? new Date(milestone.actualDueDate) : null,
      status: milestone.status as MilestoneStatus,
      assignedToId: milestone.assignedToId,
      attachments: milestone.attachments,
      notes: milestone.notes,
    })),
  );
  await prisma.projectMilestone.createMany({ data: milestones, skipDuplicates: true });

  await prisma.salesTask.createMany({
    data: INITIAL_TASKS.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      assignedToId: task.assignedToId,
      taskType: task.taskType as TaskType,
      subject: task.subject,
      dueDatetime: new Date(task.dueDatetime),
      priority: task.priority as TaskPriority,
      isCompleted: task.isCompleted,
      resultNotes: task.resultNotes,
      completedAt: task.completedAt ? new Date(task.completedAt) : null,
    })),
    skipDuplicates: true,
  });

  console.log("Seed data created or already present.");
}

seed()
  .catch((error: unknown) => {
    console.error("Failed to seed database:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });