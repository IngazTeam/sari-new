import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  decide: vi.fn(),
  analyze: vi.fn(),
}));
vi.mock("./knowledge/teaching-policy-review", () => ({
  analyzeTeachingPolicy: mocks.analyze,
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./knowledge/conflict-workspace", () => ({
  listConflictWorkspace: mocks.list,
  readConflictReview: mocks.read,
  decideKnowledgeConflict: mocks.decide,
}));
import { sariBrainRouter } from "./routers-sari-brain";
vi.mock("./knowledge/conflict-indexing", () => ({
  indexApprovedConflict: vi.fn(async () => "unconfirmed"),
}));
const caller = () =>
  sariBrainRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 });
});
it("reports a committed decision when post-commit indexing is unconfirmed", async () => {
  mocks.decide.mockResolvedValue({
    success: true,
    action: "approve",
    replacedSectionId: 3,
    indexing: "not_requested",
  });
  expect(
    await caller().approveSection({
      sectionId: 5,
      action: "approve",
      acknowledged: true,
      expectedRevision: "a".repeat(64),
    })
  ).toMatchObject({ success: true, indexing: "unconfirmed" });
});
it.each(["owner", "manager", "viewer", "sales_supervisor"])(
  "scopes %s reads to the selected membership",
  async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    expect((await caller().conflictWorkspace()).canManage).toBe(
      ["owner", "manager"].includes(role)
    );
    await caller().conflictReview({ sectionId: 5 });
    expect(mocks.list).toHaveBeenCalledWith(20, 1);
    expect(mocks.read).toHaveBeenCalledWith(20, 5);
  }
);
it.each(["viewer", "sales_supervisor"])(
  "blocks %s decisions before storage",
  async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    await expect(caller().approveSection({} as any)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.decide).not.toHaveBeenCalled();
  }
);
it("rejects old blind decisions instead of enabling unseen knowledge", async () => {
  await expect(
    caller().approveSection({ sectionId: 1, action: "approve" } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mocks.decide).not.toHaveBeenCalled();
});
it("scopes semantic comparison to the selected authorized merchant", async () => {
  mocks.analyze.mockResolvedValue({ saved: true });
  await caller().analyzeTeachingPolicy({
    sectionId: 5,
    expectedBasisHash: "a".repeat(64),
  });
  expect(mocks.analyze).toHaveBeenCalledWith(20, 5, "a".repeat(64));
});
it.each(["viewer", "sales_supervisor"])(
  "blocks %s policy comparison before AI",
  async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    await expect(
      caller().analyzeTeachingPolicy({
        sectionId: 5,
        expectedBasisHash: "a".repeat(64),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.analyze).not.toHaveBeenCalled();
  }
);
it("does not leak database details in reads or mutations", async () => {
  mocks.list.mockRejectedValue(Error("Database secret"));
  mocks.read.mockRejectedValue(Error("Database secret"));
  mocks.decide.mockRejectedValue(Error("Database secret"));
  await expect(caller().conflictWorkspace()).rejects.toMatchObject({
    message: "Knowledge proposals unavailable",
  });
  await expect(caller().conflictReview({ sectionId: 5 })).rejects.toMatchObject(
    { message: "Knowledge proposal review unavailable" }
  );
  await expect(
    caller().approveSection({
      sectionId: 5,
      action: "reject",
      acknowledged: true,
      expectedRevision: "a".repeat(64),
    })
  ).rejects.toMatchObject({ message: "Knowledge decision result unconfirmed" });
});
