import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 開始自動轉換現有金額資料由萬轉為元 ===");

  // 1. 檢查並處理市政愛悅廚具 (因填寫 381966 元被誤乘 10,000 成為 3,819,660,000)
  const shizheng = await prisma.project.findFirst({
    where: { projectName: { contains: "市政愛悅" } },
  });

  if (shizheng) {
    const rawQuote = Number(shizheng.quoteAmount);
    const rawBudget = Number(shizheng.estimatedBudget);
    if (rawQuote > 100_000_000 || rawBudget > 100_000_000) {
      console.log(`修正「${shizheng.projectName}」異常金額:`, {
        beforeQuote: rawQuote,
        beforeBudget: rawBudget,
      });
      const newQuote = rawQuote > 100_000_000 ? Math.round(rawQuote / 10000) : rawQuote;
      const newBudget = rawBudget > 100_000_000 ? Math.round(rawBudget / 10000) : rawBudget;

      await prisma.project.update({
        where: { id: shizheng.id },
        data: {
          quoteAmount: newQuote,
          estimatedBudget: newBudget,
        },
      });
      console.log(`已更新「${shizheng.projectName}」金額為:`, { quoteAmount: newQuote, estimatedBudget: newBudget });
    }
  }

  // 2. 檢查是否有任何小於 1000 的微型金額 (代表過去以萬為單位直接寫入資料庫而未乘 10,000 之資料)
  const projects = await prisma.project.findMany();
  let convertedProjectsCount = 0;

  for (const p of projects) {
    let needsUpdate = false;
    let newCost = p.cost;
    let newQuote = p.quoteAmount;
    let newBudget = p.estimatedBudget;

    if (p.cost != null && Number(p.cost) > 0 && Number(p.cost) < 1000) {
      newCost = (Number(p.cost) * 10000) as any;
      needsUpdate = true;
    }
    if (p.quoteAmount != null && Number(p.quoteAmount) > 0 && Number(p.quoteAmount) < 1000) {
      newQuote = (Number(p.quoteAmount) * 10000) as any;
      needsUpdate = true;
    }
    if (p.estimatedBudget != null && Number(p.estimatedBudget) > 0 && Number(p.estimatedBudget) < 1000) {
      newBudget = (Number(p.estimatedBudget) * 10000) as any;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await prisma.project.update({
        where: { id: p.id },
        data: {
          cost: newCost,
          quoteAmount: newQuote,
          estimatedBudget: newBudget,
        },
      });
      console.log(`轉換案場 [${p.projectName}] 金額 (由萬轉為元):`, { cost: newCost, quote: newQuote, budget: newBudget });
      convertedProjectsCount++;
    }
  }

  // 3. 檢查歷次里程碑紀錄 MilestoneRecord
  const records = await prisma.milestoneRecord.findMany({
    where: { amount: { not: null } },
  });
  let convertedRecordsCount = 0;
  for (const r of records) {
    if (r.amount != null && Number(r.amount) > 0 && Number(r.amount) < 1000) {
      const newAmount = Number(r.amount) * 10000;
      await prisma.milestoneRecord.update({
        where: { id: r.id },
        data: { amount: newAmount },
      });
      console.log(`轉換歷次紀錄 [${r.id}] 金額: ${r.amount} -> ${newAmount}`);
      convertedRecordsCount++;
    }
  }

  console.log(`=== 金額轉換完成！修正特殊專案: 1，轉換案件數: ${convertedProjectsCount}，轉換歷次紀錄數: ${convertedRecordsCount} ===`);
}

main()
  .catch((e) => {
    console.error("轉換過程發生錯誤:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
