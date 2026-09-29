import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  matchQuickResponse,
  quickResponseKeywords,
  quickResponseDraftSchema,
} from "../shared/quick-response";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./quick-response-workspace", async original => ({
  ...(await original<typeof import("./quick-response-workspace")>()),
  readQuickResponseWorkspace: m.read,
  writeQuickResponse: m.write,
}));
import { quickResponsesRouter } from "./routers-quick-responses";
import {
  QuickResponseError,
  quickResponseRevision,
} from "./quick-response-workspace";
const caller = () =>
  quickResponsesRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
const revision = "a".repeat(64),
  draft = {
    trigger: "مرحبا",
    response: "أهلًا! كيف أساعدك؟",
    keywords: "",
    priority: 0,
    isActive: true,
  };
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue({
    merchantId: 20,
    rows: [],
    total: 0,
    active: 0,
    inactive: 0,
    revision,
  });
  m.write.mockResolvedValue({ id: 3, ...draft, revision });
});
describe("selected-tenant quick response contracts", () => {
  it("binds reads and writes to the selected authorized tenant, including members", async () => {
    m.access.mockResolvedValue({
      merchantId: 20,
      role: "manager",
      memberId: 4,
    });
    expect(await caller().workspace()).toMatchObject({
      merchantId: 20,
      canManage: true,
    });
    expect(m.access).toHaveBeenCalledWith(7, 20);
    expect(m.read).toHaveBeenCalledWith(20);
    await caller().create({ ...draft, expectedRevision: revision });
    expect(m.write).toHaveBeenLastCalledWith(20, {
      kind: "create",
      expectedRevision: revision,
      draft,
    });
    await caller().update({
      id: 3,
      expectedRevision: revision,
      isActive: false,
    });
    expect(m.write).toHaveBeenLastCalledWith(20, {
      kind: "update",
      id: 3,
      expectedRevision: revision,
      patch: { isActive: false },
    });
    await caller().delete({ id: 3, expectedRevision: revision });
    expect(m.write).toHaveBeenLastCalledWith(20, {
      kind: "delete",
      id: 3,
      expectedRevision: revision,
    });
  });
  it.each(["viewer", "sales_supervisor"])(
    "lets %s read but not write",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      expect(await caller().workspace()).toMatchObject({ canManage: false });
      for (const work of [
        () => caller().create({ ...draft, expectedRevision: revision }),
        () =>
          caller().update({
            id: 3,
            expectedRevision: revision,
            isActive: false,
          }),
        () => caller().delete({ id: 3, expectedRevision: revision }),
      ])
        await expect(work()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(m.write).not.toHaveBeenCalled();
    }
  );
  it.each([
    { merchantId: 30 },
    { useCount: 999 },
    { category: "ignored" },
    { priority: 0.5 },
    { priority: 11 },
    { trigger: " " },
    { expectedRevision: "" },
  ])("rejects invalid/forged fields %j", async attack => {
    await expect(
      caller().create({
        ...draft,
        expectedRevision: revision,
        ...attack,
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.write).not.toHaveBeenCalled();
  });
  it("requires versions on all mutations and does not expose internal read/write errors", async () => {
    await expect(caller().create(draft as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      caller().update({ id: 3, isActive: true } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().delete({ id: 3 } as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    m.read.mockRejectedValueOnce(Error("SQL password secret"));
    await expect(caller().workspace()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quick responses unavailable",
    });
    m.write.mockRejectedValueOnce(
      new QuickResponseError(
        "CONFLICT",
        "Quick response changed; refresh and review"
      )
    );
    await expect(
      caller().update({ id: 3, expectedRevision: revision, isActive: false })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    m.access.mockResolvedValue(null);
    await expect(caller().workspace()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
describe("deterministic quick response matching", () => {
  const row = (id: number, extra: Record<string, any> = {}) => ({
    id,
    merchantId: 20,
    ...draft,
    keywords: null,
    useCount: 0,
    ...extra,
  });
  it("ignores empty/non-string JSON keywords and supports commas, Arabic commas and numeric text", () => {
    expect(
      quickResponseKeywords('["", "   ", null, 8, " سعر ", "سعر"]')
    ).toEqual(["سعر"]);
    expect(quickResponseKeywords("سعر، شحن\nسعر,منتج")).toEqual([
      "سعر",
      "شحن",
      "منتج",
    ]);
    expect(quickResponseKeywords("50")).toEqual(["50"]);
    expect(
      matchQuickResponse([row(1, { keywords: '[" ", ""]' })], "أي سؤال")
    ).toBeNull();
    expect(
      matchQuickResponse([row(1, { keywords: "null" })], "null")
    ).toBeNull();
  });
  it("gives exact trigger matches priority, then orders matching keywords by priority/use/id", () => {
    const exact = row(3, { trigger: " HELLO ", priority: 0 }),
      broad = row(1, { trigger: "other", keywords: "hello", priority: 10 });
    expect(matchQuickResponse([broad, exact], "hello")?.id).toBe(3);
    expect(
      matchQuickResponse(
        [row(2, { keywords: "hi" }), row(1, { keywords: "hi" })],
        "say hi"
      )?.id
    ).toBe(1);
    expect(
      matchQuickResponse(
        [row(1, { keywords: "hi" }), row(2, { keywords: "hi", useCount: 2 })],
        "say hi"
      )?.id
    ).toBe(2);
    expect(
      matchQuickResponse([row(1, { keywords: "hi", isActive: false })], "hi")
    ).toBeNull();
    expect(matchQuickResponse([row(1)], " ")).toBeNull();
  });
  it("keeps zero priority and ignores usage-only changes in edit revisions", () => {
    expect(quickResponseDraftSchema.parse(draft).priority).toBe(0);
    expect(quickResponseRevision(row(1) as any)).toBe(
      quickResponseRevision(
        row(1, { useCount: 99, lastUsedAt: "later" }) as any
      )
    );
    expect(quickResponseRevision(row(1) as any)).not.toBe(
      quickResponseRevision(row(1, { merchantId: 21 }) as any)
    );
  });
});
