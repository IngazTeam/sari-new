import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  write: vi.fn(),
  llm: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./_core/llm", () => ({ invokeLLM: m.llm }));
vi.mock("./keyword-review", async importOriginal => ({
  ...(await importOriginal<typeof import("./keyword-review")>()),
  readKeywordRecords: m.list,
  readKeywordRecord: m.get,
  writeKeywordRecord: m.write,
}));
import { keywordsRouter } from "./routers-keywords";
import { keywordRecordRevision, KeywordReviewError } from "./keyword-review";
const revision = "a".repeat(64);
const caller = () =>
  keywordsRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.list.mockResolvedValue([]);
  m.get.mockResolvedValue({ merchantId: 20, id: 1, revision });
  m.write.mockResolvedValue({ success: true });
});
describe("keyword review tenant and permission contracts", () => {
  it.each(["owner", "manager", "sales_supervisor", "viewer"])(
    "binds reads for %s to the selected membership",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await caller().getStats({});
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.list).toHaveBeenCalledWith(20, { limit: 20, page: 1 });
      await caller().getNew({ limit: 3, page: 2 });
      expect(m.list).toHaveBeenCalledWith(20, {
        limit: 3,
        page: 2,
        status: "new",
      });
      expect(await caller().getById({ keywordId: 1 })).toMatchObject({
        canManage: role === "owner" || role === "manager",
      });
      expect(m.get).toHaveBeenCalledWith(20, 1);
    }
  );
  it.each(["owner", "manager"])("allows reviewed writes for %s", async role => {
    m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
    await caller().updateStatus({
      keywordId: 1,
      status: "ignored",
      expectedRevision: revision,
    });
    expect(m.write).toHaveBeenCalledWith(20, {
      kind: "status",
      keywordId: 1,
      status: "ignored",
      expectedRevision: revision,
    });
    await caller().delete({
      keywordId: 1,
      expectedRevision: revision,
      reviewed: true,
    });
    expect(m.write).toHaveBeenLastCalledWith(20, {
      kind: "delete",
      keywordId: 1,
      expectedRevision: revision,
      reviewed: true,
    });
  });
  it.each(["viewer", "sales_supervisor"])(
    "denies writes by %s before accessing data",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await expect(
        caller().updateStatus({
          keywordId: 1,
          status: "reviewed",
          expectedRevision: revision,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller().delete({
          keywordId: 1,
          expectedRevision: revision,
          reviewed: true,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(m.write).not.toHaveBeenCalled();
    }
  );
  it("rejects missing membership for reads and writes", async () => {
    m.access.mockResolvedValue(null);
    await expect(caller().getSuggested()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().delete({
        keywordId: 1,
        expectedRevision: revision,
        reviewed: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each([
    { limit: 0 },
    { limit: -1 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: Infinity },
    { page: 0 },
    { page: 100001 },
    { minFrequency: -1 },
    { minFrequency: 0.5 },
    { merchantId: 21 },
    { category: "sql" },
    { status: "active" },
  ])("rejects invalid filter %j", async input => {
    await expect(caller().getStats(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.list).not.toHaveBeenCalled();
  });
  it.each([
    { keywordId: 0, expectedRevision: revision },
    { keywordId: 1.1, expectedRevision: revision },
    { keywordId: 1 },
    { keywordId: 1, expectedRevision: "wrong" },
    { keywordId: 1, expectedRevision: revision, merchantId: 21 },
  ])("rejects an unreviewed or forged write %j", async input => {
    await expect(
      caller().updateStatus({ ...input, status: "reviewed" } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each([{}, { reviewed: false }])(
    "requires separate deletion review %j",
    async input => {
      await expect(
        caller().delete({
          keywordId: 1,
          expectedRevision: revision,
          ...input,
        } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(m.write).not.toHaveBeenCalled();
    }
  );
  it("returns saved suggestions without provider calls or invented confidence", async () => {
    m.list.mockResolvedValue([
      {
        id: 9,
        keyword: "shipping",
        suggestedResponse: "Saved text",
        category: "shipping",
        revision,
      },
    ]);
    expect(await caller().getSuggested()).toEqual([
      {
        id: 9,
        keyword: "shipping",
        suggestedResponse: "Saved text",
        category: "shipping",
        confidence: null,
        source: "saved_unverified_suggestion",
        revision,
      },
    ]);
    expect(m.list).toHaveBeenCalledWith(
      20,
      { status: "new", minFrequency: 3, limit: 10, page: 1 },
      true
    );
    expect(m.llm).not.toHaveBeenCalled();
  });
  it("preserves safe conflict codes and suppresses raw database failures", async () => {
    m.write.mockRejectedValueOnce(
      new KeywordReviewError("CONFLICT", "Keyword changed; refresh and review")
    );
    await expect(
      caller().updateStatus({
        keywordId: 1,
        status: "reviewed",
        expectedRevision: revision,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    m.list.mockRejectedValue(Error("secret SQL data"));
    await expect(caller().getStats({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Keywords unavailable",
    });
  });
  it("routes the application through the same secured module without a second write implementation", () => {
    const source = readFileSync("server/routers.ts", "utf8");
    expect(source).toContain("keywords: keywordsRouter");
    expect(source).not.toContain("keywords: router({");
  });
});
describe("keyword review content revisions", () => {
  const row = {
    id: 1,
    merchantId: 20,
    keyword: "shipping",
    category: "shipping",
    frequency: 3,
    status: "new",
    sampleMessages: '["question"]',
    suggestedResponse: "Draft",
    firstSeenAt: "2026-09-01 00:00:00",
    lastSeenAt: "2026-09-29 00:00:00",
    reviewedAt: null,
    createdAt: "2026-09-01 00:00:00",
    updatedAt: "2026-09-29 00:00:00",
  } as const;
  it.each([
    "id",
    "merchantId",
    "keyword",
    "category",
    "frequency",
    "status",
    "sampleMessages",
    "suggestedResponse",
    "firstSeenAt",
    "lastSeenAt",
    "reviewedAt",
    "createdAt",
    "updatedAt",
  ])("invalidates a review when %s changes", key => {
    expect(keywordRecordRevision({ ...row, [key]: "changed" } as any)).not.toBe(
      keywordRecordRevision(row)
    );
  });
});
