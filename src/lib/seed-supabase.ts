import { PrismaClient, CustomerType, MilestoneStatus, PaymentTerms, ProjectStage, QuoteStatus, TaskPriority, TaskType } from "@prisma/client";
import { 
  INITIAL_CUSTOMERS, INITIAL_PROJECTS, INITIAL_QUOTES, INITIAL_TASKS, INITIAL_MILESTONES 
} from "./mock-data";

const prisma = new PrismaClient();

async function seedData() {
  console.log("Seeding fresh data from mock-data...");

  // Seed user roles
  await prisma.user.createMany({
    data: [
      { id: "u1", name: "張志豪", email: "admin@cabsales.tw", role: "ADMIN" },
      { id: "u2", name: "王志明", email: "manager@cabsales.tw", role: "SALES_MANAGER" },
      { id: "u3", name: "林宏遠", email: "sales.lin@cabsales.tw", role: "SALES" },
      { id: "u4", name: "陳廷瑋", email: "sales.chen@cabsales.tw", role: "SALES" },
      { id: "u5", name: "張育菁", email: "assistant.chang@cabsales.tw", role: "ASSISTANT" },
    ],
    skipDuplicates: true,
  });
  console.log("Users created.");

  for (const c of INITIAL_CUSTOMERS) {
    await prisma.customer.create({
      data: {
        id: c.id,
        name: c.name,
        customerType: c.customerType === "PR" ? "CONTRACTOR" : c.customerType as CustomerType,
        taxId: c.taxId,
        phone: c.phone,
        address: c.address,
        defaultDiscount: c.defaultDiscount,
        paymentTerms: c.paymentTerms as PaymentTerms,
        salesRepId: "u3",
      }
    });
  }
  console.log("Customers created.");

  for (const p of INITIAL_PROJECTS) {
    await prisma.project.create({
      data: {
        id: p.id,
        projectName: p.projectName,
        customerId: p.customerId,
        siteAddress: p.siteAddress,
        siteCondition: p.siteCondition,
        salesRepId: p.salesRepId,
        salesAssistantId: p.salesAssistantId,
        currentStage: p.currentStage as ProjectStage,
        isDelayed: p.isDelayed,
        expectedDate: p.expectedDate ? new Date(p.expectedDate) : null,
        estimatedBudget: p.estimatedBudget,
        unitCount: p.unitCount,
        cost: p.cost,
        quoteAmount: p.quoteAmount,
      }
    });
  }
  console.log("Projects created.");

  for (const [projectId, quotes] of Object.entries(INITIAL_QUOTES)) {
    for (const q of quotes) {
      await prisma.quotation.create({
        data: {
          id: q.id,
          projectId: projectId,
          version: q.version,
          externalQuoteNo: q.externalQuoteNo,
          quoteFileUrl: q.quoteFileUrl,
          notes: q.notes,
          totalAmount: q.totalAmount,
          status: q.status as QuoteStatus,
        }
      });
    }
  }
  console.log("Quotes created.");

  for (const [projectId, milestones] of Object.entries(INITIAL_MILESTONES)) {
    let order = 1;
    for (const m of milestones) {
      await prisma.projectMilestone.create({
        data: {
          id: m.id,
          projectId: projectId,
          stageCode: m.stageCode,
          phase: m.phase,
          stageOrder: order++,
          plannedDueDate: m.plannedDueDate ? new Date(m.plannedDueDate) : null,
          actualDueDate: m.actualDueDate ? new Date(m.actualDueDate) : null,
          status: m.status as MilestoneStatus,
          priority: m.priority as TaskPriority,
          assignedToId: m.assignedToId,
          attachments: m.attachments,
          notes: m.notes,
        }
      });
    }
  }
  console.log("Milestones created.");

  for (const t of INITIAL_TASKS) {
    await prisma.salesTask.create({
      data: {
        id: t.id,
        projectId: t.projectId,
          assignedToId: t.assignedToId,
        assignedById: null,
        taskType: t.taskType as TaskType,
        subject: t.subject,
        dueDatetime: new Date(t.dueDatetime),
        priority: t.priority as TaskPriority,
        isCompleted: t.isCompleted,
        resultNotes: t.resultNotes,
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
      }
    });
  }
  console.log("Tasks created.");

  console.log("Data seeding complete.");
}

seedData().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
