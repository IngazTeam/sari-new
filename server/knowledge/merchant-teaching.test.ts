import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  previous: vi.fn(),
  save: vi.fn(),
  understand: vi.fn(),
}));
vi.mock("./whatsapp-teaching-source", () => ({
  readTeachingSource: mocks.source,
}));
vi.mock("./whatsapp-teaching", () => ({
  findTeachingReceipt: mocks.previous,
  saveContextualMerchantTeaching: mocks.save,
  TeachingLimitError: class extends Error {},
}));
vi.mock("../ai/merchant-teaching-understanding", () => ({
  understandMerchantTeaching: mocks.understand,
}));
import { handleMerchantTeaching } from "../ai/merchant-teaching-handler";
import { TeachingLimitError } from "./whatsapp-teaching";
import {
  withInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";
const text = "اعتمد للعملاء أن الضمان سنتان مع استثناء الكسر.";
const context = (): InboundExecution => ({
  id: 1,
  merchantId: 8101,
  instanceId: 3,
  token: "synthetic-lease",
  eventKey: "a".repeat(64),
  partitionKey: "b".repeat(64),
  sendOrdinal: 0,
  assertOwned: vi.fn(),
});
const run = (input = text) =>
  withInboundExecution(context(), () => handleMerchantTeaching(8101, input));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.source.mockResolvedValue({ merchantId: 8101, text, digest: "source" });
  mocks.previous.mockResolvedValue(null);
  mocks.understand.mockResolvedValue({
    intent: "teach",
    title: "الضمان",
    confidence: 0.99,
    ambiguous: false,
  });
  mocks.save.mockResolvedValue({
    sectionId: 9,
    approved: true,
    replayed: false,
    usedToday: 1,
  });
});
it("persists the verified source and AI interpretation before acknowledging success", async () => {
  const result = await run();
  expect(result.response).toContain("تم حفظ المعلومة كاملة");
  expect(mocks.save).toHaveBeenCalledWith(
    { merchantId: 8101, text, digest: "source" },
    expect.objectContaining({ intent: "teach" })
  );
  expect(mocks.source.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.understand.mock.invocationCallOrder[0]
  );
  expect(mocks.understand.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.save.mock.invocationCallOrder[0]
  );
});
it("never acknowledges success or falls through after a storage failure", async () => {
  mocks.save.mockRejectedValueOnce(Error("storage unavailable"));
  expect(await run()).toMatchObject({
    handled: true,
    response: expect.stringContaining("لم يتم تأكيد"),
  });
});
it("never falls back to keyword publication when AI is unavailable", async () => {
  mocks.understand.mockRejectedValueOnce(Error("provider unavailable"));
  expect((await run("#علم_ساري الضمان سنتان")).handled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("analyzes natural language without a command prefix", async () => {
  await run();
  expect(mocks.understand).toHaveBeenCalledWith(8101, text);
});
it.each([
  { intent: "clarify", confidence: 1, ambiguous: true },
  { intent: "not_teaching", confidence: 0.89, ambiguous: false },
  { intent: "not_teaching", confidence: 1, ambiguous: true },
])(
  "does not let uncertainty flow into another mutating handler: %j",
  async decision => {
    mocks.understand.mockResolvedValueOnce(decision);
    expect((await run()).handled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  }
);
it("lets confident unrelated messages continue without a knowledge write", async () => {
  mocks.understand.mockResolvedValueOnce({
    intent: "not_teaching",
    confidence: 0.99,
    ambiguous: false,
  });
  expect(await run("كم طلب اليوم؟")).toEqual({ handled: false });
  expect(mocks.save).not.toHaveBeenCalled();
});
it("does not truncate long knowledge before saving", async () => {
  expect((await run("ق".repeat(2001))).response).toContain("لم أختصرها");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("reuses the decision within one inbound execution without sharing tenant state", async () => {
  await withInboundExecution(context(), async () => {
    const [a, b] = await Promise.all([
      handleMerchantTeaching(8101, text),
      handleMerchantTeaching(8101, text),
    ]);
    expect(a).toEqual(b);
  });
  expect(mocks.understand).toHaveBeenCalledOnce();
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(
    (
      await withInboundExecution(context(), () =>
        handleMerchantTeaching(8102, text)
      )
    ).response
  ).toContain("لم يتم تأكيد");
  expect(mocks.save).toHaveBeenCalledOnce();
});
it("blocks calls without a durable authenticated inbound execution", async () => {
  expect((await handleMerchantTeaching(8101, text)).handled).toBe(true);
  expect(mocks.source).not.toHaveBeenCalled();
});
it.each([true, false])(
  "retries use the durable receipt and respect later publication state (%s)",
  async approved => {
    mocks.previous.mockResolvedValueOnce({
      sectionId: approved ? 9 : null,
      approved,
      replayed: true,
      usedToday: 1,
    });
    expect((await run()).response).toContain(
      approved ? "مسجلة بالفعل" : "لم أُعد اعتمادها"
    );
    expect(mocks.understand).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  }
);
it("reports the durable quota accurately", async () => {
  mocks.save.mockRejectedValueOnce(new TeachingLimitError());
  expect((await run()).response).toContain("آخر 24 ساعة");
});
it("does not expose private errors in logs or replies", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.save.mockRejectedValueOnce(
    Error("secret provider key and customer phone")
  );
  expect(JSON.stringify(await run())).not.toContain("secret");
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  log.mockRestore();
});
