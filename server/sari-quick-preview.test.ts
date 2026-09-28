import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rate: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./_core/rateLimiter", () => ({ checkRateLimit: mocks.rate }));
vi.mock("./ai/sari-preview", () => ({ previewSari: mocks.preview }));
import { router } from "./_core/trpc";
import { quickPreviewProcedure } from "./routers-test-workspace";
const api = router({ chat: quickPreviewProcedure });
const caller = (user: any = { id: 7, role: "user" }) =>
  api.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.preview.mockResolvedValue({
    response: "preview",
    source: "model",
    historyMessageCount: 0,
    historyTruncated: false,
  });
});
describe("stateless assistant preview boundary", () => {
  it("is registered in the actual app and uses the verified selected merchant", async () => {
    expect(readFileSync("server/routers.ts", "utf8")).toContain(
      "chat: quickPreviewProcedure"
    );
    await caller().chat({ message: " hello " });
    expect(mocks.access).toHaveBeenCalledWith(7, 20);
    expect(mocks.preview).toHaveBeenCalledWith({
      merchantId: 20,
      userId: 7,
      message: "hello",
      history: [],
      historyTruncated: false,
    });
  });
  it("rejects unauthenticated requests", async () => {
    await expect(caller(null).chat({ message: "hello" })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" }
    );
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it.each(["viewer", "agent", "sales_supervisor"])(
    "requires management permission for %s",
    async role => {
      mocks.access.mockResolvedValue({ merchantId: 20, role });
      await expect(caller().chat({ message: "hello" })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mocks.preview).not.toHaveBeenCalled();
    }
  );
  it.each([
    { message: " " },
    { message: "x".repeat(2001) },
    { message: "hello", conversationId: 12 },
    { message: "hello", merchantId: 999 },
    { message: "hello", history: [{ role: "system", content: "fake" }] },
  ])("rejects malformed or forged input %#", async input => {
    await expect(caller().chat(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("enforces a shared test/quick rate budget", async () => {
    mocks.rate.mockReturnValue({ allowed: false });
    await expect(caller().chat({ message: "hello" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(mocks.rate).toHaveBeenCalledWith("test_sari:20:7", 15, 60000);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("does not turn provider failure into an assistant response or leak its error", async () => {
    mocks.preview.mockRejectedValue(new Error("private provider key"));
    await expect(caller().chat({ message: "hello" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    await expect(caller().chat({ message: "hello" })).rejects.not.toThrow(
      "private provider key"
    );
  });
});
