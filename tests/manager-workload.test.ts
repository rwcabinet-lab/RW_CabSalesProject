import { describe, it, expect } from "vitest";
import { computeSalesWorkload, type WorkloadProjectInput } from "@/lib/manager-workload";

describe("人員案場負載統計 (computeSalesWorkload)", () => {
  const users = [
    { id: "sales-1", name: "陳柔穎", role: "SALES_MANAGER" },
    { id: "sales-2", name: "林邑珮", role: "SALES" },
    { id: "asst-1", name: "業助A", role: "ASSISTANT" },
    { id: "admin-1", name: "系統管理員", role: "ADMIN" },
  ];

  it("多期案件應排除母案彙總容器，避免母案與分期重複計數", () => {
    const projects: WorkloadProjectInput[] = [
      // 一般單期案場
      {
        id: "proj-single",
        parentId: null,
        currentStage: "PROPOSAL",
        salesRepId: "sales-1",
        salesRepName: "陳柔穎",
      },
      // 多期案場：母案容器 + 第 1 期
      {
        id: "proj-parent-1",
        parentId: null,
        currentStage: "CLOSURE",
        salesRepId: "sales-1",
        salesRepName: "陳柔穎",
      },
      {
        id: "proj-phase-1",
        parentId: "proj-parent-1",
        currentStage: "CLOSURE",
        salesRepId: "sales-1",
        salesRepName: "陳柔穎",
      },
    ];

    const result = computeSalesWorkload({
      projects,
      milestonesByProject: {
        "proj-single": [{ status: "IN_PROGRESS", assignedToId: "sales-1" }],
        "proj-parent-1": [],
        "proj-phase-1": [{ status: "OVERDUE", assignedToId: "sales-1" }],
      },
      allTasks: [],
      allUsers: users,
      isProjectDelayed: (p) => p.id === "proj-phase-1" || p.id === "proj-parent-1",
    });

    const chen = result.find((r) => r.salesRepName === "陳柔穎");
    expect(chen).toBeDefined();
    // 應僅計入 proj-single 與 proj-phase-1（共 2 案），不計入母案容器 proj-parent-1
    expect(chen?.totalProjects).toBe(2);
    expect(chen?.delayedProjects).toBe(1);
  });

  it("多期案件若含第 1 期與第 2 期，應各自計算分期負載而不計母案容器", () => {
    const projects: WorkloadProjectInput[] = [
      {
        id: "master-2",
        parentId: null,
        currentStage: "INSTALL",
        salesRepId: "sales-1",
        salesRepName: "陳柔穎",
      },
      {
        id: "master-2-p1",
        parentId: "master-2",
        currentStage: "INSTALL",
        salesRepId: "sales-1",
        salesRepName: "陳柔穎",
      },
      {
        id: "master-2-p2",
        parentId: "master-2",
        currentStage: "PROPOSAL",
        salesRepId: "sales-2",
        salesRepName: "林邑珮",
      },
    ];

    const result = computeSalesWorkload({
      projects,
      milestonesByProject: {},
      allTasks: [],
      allUsers: users,
      isProjectDelayed: () => false,
    });

    expect(result.find((r) => r.salesRepName === "陳柔穎")?.totalProjects).toBe(1);
    expect(result.find((r) => r.salesRepName === "林邑珮")?.totalProjects).toBe(1);
  });

  it("同一案場同時身兼主責業務、進度負責人與待辦負責人時不重複計算，協辦同仁則計入涉入案數", () => {
    const projects: WorkloadProjectInput[] = [
      {
        id: "proj-collab",
        parentId: null,
        currentStage: "PROPOSAL",
        salesRepId: "sales-2",
        salesRepName: "林邑珮",
        salesAssistantId: "asst-1",
      },
    ];

    const result = computeSalesWorkload({
      projects,
      milestonesByProject: {
        "proj-collab": [{ status: "IN_PROGRESS", assignedToId: "sales-1" }],
      },
      allTasks: [
        { projectId: "proj-collab", isCompleted: false, assignedToId: "sales-1" },
        { projectId: "proj-collab", isCompleted: false, assignedToId: "sales-2" },
      ],
      allUsers: users,
      isProjectDelayed: () => false,
    });

    expect(result.find((r) => r.salesRepName === "林邑珮")?.totalProjects).toBe(1);
    expect(result.find((r) => r.salesRepName === "陳柔穎")?.totalProjects).toBe(1);
    expect(result.find((r) => r.salesRepName === "業助A")?.totalProjects).toBe(1);
    // ADMIN 未涉入案場且非可指派角色，不應出現在負載名單
    expect(result.find((r) => r.salesRepName === "系統管理員")).toBeUndefined();
  });

  it("流標案件不依進行中里程碑計入其他人員負載，且不計為延誤案場", () => {
    const projects: WorkloadProjectInput[] = [
      {
        id: "proj-lost",
        parentId: null,
        currentStage: "LOST",
        salesRepId: "sales-2",
        salesRepName: "林邑珮",
      },
    ];

    const result = computeSalesWorkload({
      projects,
      milestonesByProject: {
        "proj-lost": [{ status: "OVERDUE", assignedToId: "sales-1" }],
      },
      allTasks: [],
      allUsers: users,
      isProjectDelayed: () => false,
    });

    expect(result.find((r) => r.salesRepName === "林邑珮")?.totalProjects).toBe(1);
    expect(result.find((r) => r.salesRepName === "林邑珮")?.delayedProjects).toBe(0);
    expect(result.find((r) => r.salesRepName === "陳柔穎")?.totalProjects).toBe(0);
  });
});
