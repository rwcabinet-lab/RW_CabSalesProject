import { NextRequest, NextResponse } from "next/server";
import { DataService } from "@/lib/data-service";

// GET /api/projects/[id]/quote — 取得所有報價版本 (最新版在最前)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  const project = await DataService.getProjectById(projectId);

  if (!project) {
    return NextResponse.json({ error: "找不到此案件" }, { status: 404 });
  }

  const versions = await DataService.getQuotesByProjectId(projectId);
  const latest = versions[0] ?? null; // 已是倒序，第一筆即最新版

  return NextResponse.json({
    project,
    versions,
    latestVersion: latest,
  });
}

// POST /api/projects/[id]/quote — 新增一筆報價版本
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  const project = await DataService.getProjectById(projectId);

  if (!project) {
    return NextResponse.json({ error: "找不到此案件" }, { status: 404 });
  }

  const body = await req.json();
  const { totalAmount, externalQuoteNo, quoteFileUrl, notes, status } = body;

  if (!totalAmount || typeof totalAmount !== "number" || totalAmount <= 0) {
    return NextResponse.json(
      { error: "請輸入有效的報價金額 (totalAmount > 0)" },
      { status: 400 }
    );
  }

  const newVersion = await DataService.addQuoteVersion(projectId, {
    totalAmount,
    externalQuoteNo: externalQuoteNo || undefined,
    quoteFileUrl: quoteFileUrl || undefined,
    notes: notes || undefined,
    status: status || "DRAFT",
  });

  return NextResponse.json({ version: newVersion }, { status: 201 });
}
