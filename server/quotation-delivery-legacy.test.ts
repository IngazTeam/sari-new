import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), send: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./quotation-delivery", async original => ({
  ...(await original<typeof import("./quotation-delivery")>()),
  sendReviewedQuotation: m.send,
}));
import { sariBrainRouter } from "./routers-sari-brain";
const caller = () =>
  sariBrainRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
});
describe("retired unreviewed quotation send contract", () => {
  it("rejects the former quote-and-phone payload before any send", async () => {
    await expect(
      caller().sendQuotationToCustomer({
        quotationId: 1,
        customerPhone: "+966500000000",
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("keeps the compatibility route only as an alias of the reviewed receipt contract", async () => {
    const input = {
      requestId: randomUUID(),
      reviewId: 2,
      snapshotHash: "a".repeat(64),
      confirmed: true as const,
    };
    m.send.mockResolvedValue({ transport: "unknown", id: 3 });
    expect(await caller().sendQuotationToCustomer(input)).toEqual({
      transport: "unknown",
      id: 3,
    });
    expect(m.send).toHaveBeenCalledWith(20, 7, input);
  });
  it("denies viewer effects before even validating the reviewed payload", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(
      caller().sendQuotationToCustomer({} as any)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.send).not.toHaveBeenCalled();
  });
});
