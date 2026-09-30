import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  merchant: vi.fn(),
  preview: vi.fn(),
  live: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: m.merchant,
}));
vi.mock("./ai/sari-preview", () => ({ previewSari: m.preview }));
vi.mock("./ai/sari-personality", () => ({ chatWithSari: m.live }));
vi.mock("./_core/rateLimiter", () => ({ checkRateLimit: m.rate }));
import { sariBrainRouter } from "./routers-sari-brain";
import { brainPreviewInput } from "../shared/brain-preview";
let merchantId = 53000;
const caller = (user: unknown = { id: 7, role: "user" }) =>
  sariBrainRouter.createCaller({
    user,
    merchantId: 999,
    req: { headers: { "x-merchant-id": String(merchantId) } },
    res: {},
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  merchantId++;
  m.access.mockResolvedValue({ merchantId, role: "owner" });
  m.merchant.mockResolvedValue({ id: merchantId });
  m.rate.mockReturnValue({ allowed: true });
  m.preview.mockResolvedValue({
    response: "Preview response",
    source: "model",
    historyMessageCount: 0,
    historyTruncated: false,
  });
});
it("uses the isolated preview and verified identity with no history or live orchestration", async () => {
  expect(await caller().testSari({ question: "  hello  " })).toEqual({
    success: true,
    question: "hello",
    answer: "Preview response",
    source: "model",
  });
  expect(m.preview).toHaveBeenCalledWith({
    merchantId,
    userId: 7,
    message: "hello",
    history: [],
    historyTruncated: false,
  });
  expect(m.live).not.toHaveBeenCalled();
  expect(m.rate).toHaveBeenCalledWith(`test_sari:${merchantId}:7`, 15, 60000);
});
it.each(["viewer", "agent", "sales_supervisor"])(
  "blocks %s before provider work",
  async role => {
    m.access.mockResolvedValue({ merchantId, role });
    await expect(
      caller().testSari({ question: "hello" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.preview).not.toHaveBeenCalled();
  }
);
it("requires authentication", async () => {
  await expect(
    caller(null).testSari({ question: "hello" })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(m.preview).not.toHaveBeenCalled();
});
it.each([
  { question: " " },
  { question: "x".repeat(501) },
  { question: "hello", merchantId: 999 },
  { question: "hello", history: [] },
  { question: "hello", conversationId: 2 },
])("rejects invalid or forged input %#", async input => {
  await expect(caller().testSari(input as any)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(m.preview).not.toHaveBeenCalled();
});
it("retains the 500-character boundary after trimming", () =>
  expect(
    brainPreviewInput.parse({ question: " " + "x".repeat(500) + " " }).question
      .length
  ).toBe(500));
it("returns the explicit protection source", async () => {
  m.preview.mockResolvedValue({
    response: "Protected preview",
    source: "guardrail",
  });
  expect((await caller().testSari({ question: "hello" })).source).toBe(
    "guardrail"
  );
});
it("blocks rapid repeats and shared budget exhaustion", async () => {
  await caller().testSari({ question: "hello" });
  await expect(caller().testSari({ question: "again" })).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  expect(m.preview).toHaveBeenCalledOnce();
  merchantId++;
  m.access.mockResolvedValue({ merchantId, role: "owner" });
  m.merchant.mockResolvedValue({ id: merchantId });
  m.rate.mockReturnValue({ allowed: false });
  await expect(caller().testSari({ question: "hello" })).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  expect(m.preview).toHaveBeenCalledOnce();
});
it("does not return private provider details as an answer or retry", async () => {
  m.preview.mockRejectedValue(Error("private provider detail"));
  await expect(caller().testSari({ question: "hello" })).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Preview result unavailable",
  });
  expect(m.preview).toHaveBeenCalledOnce();
  expect(m.live).not.toHaveBeenCalled();
});
