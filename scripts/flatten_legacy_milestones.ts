import { PrismaClient, MilestoneStatus, ProjectStage } from "@prisma/client";
import { ScheduleEngine, STAGE_CODE_TO_PROJECT_STAGE } from "../src/lib/schedule-engine";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 開始執行歷史里程碑工序批次平整化維護作業 ===");

  const projects = await prisma.project.findMany({
    include: {
      milestones: {
        orderBy: { stageOrder: "asc" },
        include: { salesTask: true },
      },
    },
  });

  console.log(`總專案數: ${projects.length}`);
  let modifiedProjectsCount = 0;

  for (const p of projects) {
    const ms = p.milestones;
    const m43 = ms.find((m) => m.stageCode === "4-3");
    if (!m43 || m43.status === MilestoneStatus.COMPLETED) {
      continue;
    }

    // 檢查 4-4 或後續常規進度是否已有完成者
    const laterCompleted = ms.filter(
      (m) =>
        m.stageOrder > m43.stageOrder &&
        m.status === MilestoneStatus.COMPLETED &&
        !["X-1", "X-2"].includes(m.stageCode)
    );

    if (laterCompleted.length === 0) {
      continue;
    }

    const m44 = ms.find((m) => m.stageCode === "4-4");
    const m42 = ms.find((m) => m.stageCode === "4-2");
    const alignDate =
      m44?.actualDueDate ||
      m44?.plannedDueDate ||
      laterCompleted[0]?.actualDueDate ||
      laterCompleted[0]?.plannedDueDate ||
      m42?.actualDueDate ||
      new Date();

    const noteTag = "【工序升級校正：對齊 4-4 施工圖完工日】";
    const newNotes = m43.notes ? `${m43.notes} ${noteTag}` : noteTag;

    console.log(`\n進行平整化處理案場:「${p.projectName}」(ID: ${p.id})`);
    console.log(`  原 4-3 狀態: ${m43.status} | 後續已完成進度: ${laterCompleted.map((x) => x.stageCode).join(", ")}`);
    console.log(`  對齊完工日期: ${alignDate.toISOString().slice(0, 10)}`);

    await prisma.$transaction(async (tx) => {
      // 1. 更新 4-3 里程碑為 COMPLETED
      await tx.projectMilestone.update({
        where: { id: m43.id },
        data: {
          status: MilestoneStatus.COMPLETED,
          actualDueDate: alignDate,
          notes: newNotes,
        },
      });

      // 2. 若存在關聯待辦任務，同步標記完成
      if (m43.salesTask) {
        await tx.salesTask.update({
          where: { id: m43.salesTask.id },
          data: {
            isCompleted: true,
            completedAt: alignDate,
            resultNotes: noteTag,
          },
        });
      }

      // 3. 重新計算案場 stage 與 isDelayed
      if (p.currentStage !== "LOST") {
        const updatedMilestones = ms.map((m) =>
          m.id === m43.id
            ? {
                ...m,
                status: MilestoneStatus.COMPLETED,
                actualDueDate: alignDate,
                notes: newNotes,
              }
            : m
        );

        const firstIncomplete = updatedMilestones.find(
          (m) => m.status !== MilestoneStatus.COMPLETED && !["X-1", "X-2"].includes(m.stageCode)
        );

        let newStage: ProjectStage = p.currentStage;
        if (firstIncomplete) {
          newStage = (STAGE_CODE_TO_PROJECT_STAGE[firstIncomplete.stageCode as keyof typeof STAGE_CODE_TO_PROJECT_STAGE] || p.currentStage) as ProjectStage;
        }

        const evaluated = ScheduleEngine.evaluateMilestones(
          updatedMilestones.map((m) => ({
            id: m.id,
            projectId: m.projectId,
            stageCode: m.stageCode as any,
            phase: m.phase as any,
            stageOrder: m.stageOrder,
            plannedDueDate: m.plannedDueDate ? m.plannedDueDate.toISOString().slice(0, 10) : null,
            actualDueDate: m.actualDueDate ? m.actualDueDate.toISOString().slice(0, 10) : null,
            status: m.status,
            priority: m.priority,
            assignedToId: m.assignedToId,
            assignedToName: m.assignedToId || null,
            attachments: m.attachments,
            notes: m.notes,
          }))
        );

        await tx.project.update({
          where: { id: p.id },
          data: {
            currentStage: newStage,
            isDelayed: evaluated.isDelayed,
          },
        });

        console.log(`  更新專案階段: ${p.currentStage} -> ${newStage} | isDelayed: ${evaluated.isDelayed}`);
      }
    });

    modifiedProjectsCount++;
  }

  console.log(`\n=== 歷史里程碑平整化完成，共處理 ${modifiedProjectsCount} 個案場 ===`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("執行失敗:", e);
  process.exit(1);
});
