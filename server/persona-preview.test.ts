import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  rate: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./_core/rateLimiter", () => ({ checkRateLimit: m.rate }));
vi.mock("./ai/virtual-agent-context", () => ({
  getMerchantVirtualAgent: m.get,
  listMerchantVirtualAgents: m.list,
}));
vi.mock("./ai/sari-preview", () => ({ previewSari: m.preview }));
import { router } from "./_core/trpc";
import { personaPreviewProcedure } from "./routers-persona-preview";
const api = router({ preview: personaPreviewProcedure });
const caller = (user: any = { id: 7, role: "user" }) =>
  api.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const agent = {
  id: 12,
  merchantId: 20,
  name: "نورة",
  role: "دعم",
  department: "الفريق",
  tone: "empathetic",
  personalityPrompt: "تعليمات محفوظة",
  isActive: 1,
  isDefault: 1,
  sortOrder: 0,
  triggerKeywords: "[]",
  shiftStart: null,
  shiftEnd: null,
};
const input = { mode: "manual" as const, agentId: 12, message: " مساعدة " };
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.rate.mockReturnValue({ allowed: true });
  m.get.mockResolvedValue({ ...agent });
  m.list.mockResolvedValue([{ ...agent }]);
  m.preview.mockResolvedValue({
    response: "رد",
    source: "model",
    historyMessageCount: 0,
    historyTruncated: false,
  });
});
describe("saved persona preview boundary", () => {
  it("registers on the real router and resolves the persona within the verified tenant", async () => {
    expect(readFileSync("server/routers-virtual-agents.ts", "utf8")).toContain(
      "preview: personaPreviewProcedure"
    );
    const result = await caller().preview(input);
    expect(m.access).toHaveBeenCalledWith(7, 20);
    expect(m.get).toHaveBeenCalledWith(20, 12);
    expect(m.preview).toHaveBeenCalledWith({
      merchantId: 20,
      userId: 7,
      message: "مساعدة",
      history: [],
      historyTruncated: false,
      persona: {
        id: 12,
        name: "نورة",
        role: "دعم",
        department: "الفريق",
        tone: "empathetic",
        personalityPrompt: "تعليمات محفوظة",
      },
    });
    expect(result.persona).toEqual({
      id: 12,
      name: "نورة",
      role: "دعم",
      isActive: true,
      reason: "manual",
    });
    expect(result.time).toBeNull();
  });
  it("denies unauthenticated access", async () => {
    await expect(caller(null).preview(input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(m.get).not.toHaveBeenCalled();
  });
  it.each(["viewer", "agent", "sales_supervisor"])(
    "requires management permission for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role });
      await expect(caller().preview(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(m.get).not.toHaveBeenCalled();
      expect(m.preview).not.toHaveBeenCalled();
    }
  );
  it.each([
    { ...input, merchantId: 999 },
    { ...input, personalityPrompt: "forged" },
    { ...input, history: [] },
    { ...input, message: " " },
    { ...input, message: "x".repeat(2001) },
    { ...input, agentId: -1 },
    { mode: "automatic", time: "24:00", message: "hello" },
    { mode: "automatic", time: "10:00", message: "hello", agentId: 12 },
  ])(
    "rejects malformed or forged payload %# before reading the persona",
    async payload => {
      await expect(caller().preview(payload as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(m.get).not.toHaveBeenCalled();
      expect(m.list).not.toHaveBeenCalled();
      expect(m.preview).not.toHaveBeenCalled();
    }
  );
  it("does not generate for a foreign or deleted persona", async () => {
    m.get.mockResolvedValue(null);
    await expect(caller().preview(input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("allows a paused manual persona only as an explicitly labelled preview", async () => {
    m.get.mockResolvedValue({
      ...agent,
      isActive: 0,
      shiftStart: "22:00",
      shiftEnd: "06:00",
    });
    expect((await caller().preview(input)).persona).toMatchObject({
      isActive: false,
      reason: "manual",
    });
  });
  it("re-resolves current saved routing, skipping paused and off-shift matches", async () => {
    m.list.mockResolvedValue([
      { ...agent, id: 1, isActive: 0, triggerKeywords: '["help"]' },
      {
        ...agent,
        id: 2,
        shiftStart: "22:00",
        shiftEnd: "06:00",
        triggerKeywords: '["help"]',
      },
      {
        ...agent,
        id: 3,
        isDefault: 0,
        name: "فهد",
        triggerKeywords: '["help"]',
      },
      { ...agent, id: 4 },
    ]);
    const result = await caller().preview({
      mode: "automatic",
      message: "HELP",
      time: "10:00",
    });
    expect(m.list).toHaveBeenCalledWith(20);
    expect(result).toMatchObject({
      persona: { id: 3, name: "فهد", reason: "keyword" },
      time: "10:00",
    });
    expect(m.preview).toHaveBeenCalledWith(
      expect.objectContaining({ persona: expect.objectContaining({ id: 3 }) })
    );
    m.list.mockResolvedValue([{ ...agent, id: 4 }]);
    expect(
      (
        await caller().preview({
          mode: "automatic",
          message: "HELP",
          time: "10:00",
        })
      ).persona
    ).toMatchObject({ id: 4, reason: "default" });
  });
  it("fails clearly when automatic routing has no available persona", async () => {
    m.list.mockResolvedValue([{ ...agent, isActive: 0 }]);
    await expect(
      caller().preview({ mode: "automatic", message: "help", time: "10:00" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("shares the test-workspace budget before persona retrieval", async () => {
    m.rate.mockReturnValue({ allowed: false });
    await expect(caller().preview(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(m.rate).toHaveBeenCalledWith("test_sari:20:7", 15, 60000);
    expect(m.get).not.toHaveBeenCalled();
    expect(m.preview).not.toHaveBeenCalled();
  });
  it.each(["database", "provider"])(
    "hides private %s errors",
    async failing => {
      (failing === "database" ? m.get : m.preview).mockRejectedValueOnce(
        new Error("private credentials")
      );
      await expect(caller().preview(input)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Persona preview unavailable",
      });
    }
  );
});
