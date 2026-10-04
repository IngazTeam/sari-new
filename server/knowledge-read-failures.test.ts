import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  merchant: vi.fn(),
  sections: vi.fn(),
  pending: vi.fn(),
  history: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: m.merchant,
}));
vi.mock("./db/knowledge", () => ({
  getSectionsByMerchantId: m.sections,
  getPendingReviewSections: m.pending,
  getChangelog: m.history,
}));
import { sariBrainRouter } from "./routers-sari-brain";
const caller = () =>
  sariBrainRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const cases = [
  [
    "sections",
    () => caller().getKnowledgeSections(),
    "Knowledge sections unavailable",
  ],
  [
    "pending",
    () => caller().getPendingReviews(),
    "Knowledge proposals unavailable",
  ],
  ["history", () => caller().getChangelog({}), "Knowledge history unavailable"],
] as const;
let output: unknown[][];
beforeEach(() => {
  vi.resetAllMocks();
  output = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    output.push(args);
  });
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
  m.merchant.mockResolvedValue({ id: 20 });
  for (const key of ["sections", "pending", "history"] as const)
    m[key].mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());
it.each(cases)(
  "reports unavailable instead of empty and redacts %s read failures",
  async (key, read, message) => {
    m[key].mockRejectedValue(new Error("PRIVATE_SQL_AND_SOURCE_TEXT"));
    await expect(read()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message,
    });
    expect(JSON.stringify(output)).not.toContain("PRIVATE_SQL_AND_SOURCE_TEXT");
  }
);
it.each(cases)(
  "redacts %s merchant lookup failure",
  async (_key, read, message) => {
    m.merchant.mockRejectedValue(new Error("PRIVATE_IDENTITY_DATABASE"));
    await expect(read()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message,
    });
  }
);
it.each(cases)(
  "preserves confirmed empty %s and uses the authenticated tenant",
  async (key, read) => {
    expect(await read()).toEqual([]);
    expect(m.access).toHaveBeenCalledWith(7, 20);
    expect(m.merchant).toHaveBeenCalledWith(20);
    expect(m[key].mock.calls[0][0]).toBe(20);
  }
);
it.each(cases)(
  "retains missing merchant semantics for %s",
  async (key, read) => {
    m.merchant.mockResolvedValue(null);
    await expect(read()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(m[key]).not.toHaveBeenCalled();
  }
);
it.each(cases)("denies revoked access before reading %s", async (key, read) => {
  m.access.mockResolvedValue(null);
  await expect(read()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(m.merchant).not.toHaveBeenCalled();
  expect(m[key]).not.toHaveBeenCalled();
});
it.each([1.1, 0, 201, NaN, Infinity])(
  "rejects invalid history limit %s before data access",
  async limit => {
    await expect(caller().getChangelog({ limit })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.merchant).not.toHaveBeenCalled();
    expect(m.history).not.toHaveBeenCalled();
  }
);
it("keeps raw embeddings and unknown columns out of successful section reads", async () => {
  m.sections.mockResolvedValue([
    {
      id: 11,
      merchant_id: 20,
      title: "Local",
      content: "Source",
      embedding: "PRIVATE_VECTOR",
      privateExtra: "PRIVATE_COLUMN",
    },
  ]);
  const result = await caller().getKnowledgeSections();
  expect(result[0]).toMatchObject({ id: 11, merchantId: 20, title: "Local" });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_");
});
