import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateQuotation,
  quotationDraftInput,
  quotationTargetInput,
} from "../shared/quotation-mutations";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
  target: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./quotation-mutations", async original => ({
  ...(await original<typeof import("./quotation-mutations")>()),
  createManualQuotation: m.create,
  changeManualQuotation: m.change,
  changeQuotationTarget: m.target,
  readQuotationReceipt: m.receipt,
}));
import { quotationWorkspaceRouter } from "./routers-quotations";
import {
  QuotationConflict,
  QuotationUnavailable,
  isGovernedQuotation,
} from "./quotation-mutations";
const caller = () =>
  quotationWorkspaceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
const draft = () => ({
  requestId: randomUUID(),
  items: [{ name: " Item ", quantity: 1, unitPrice: 0.1 }],
  taxBasisPoints: 1500,
  currency: "SAR" as const,
  validDays: 7,
});
const change = () => ({
  requestId: randomUUID(),
  id: 1,
  expectedRevision: 1,
  expectedStatus: "draft" as const,
  status: "accepted" as const,
});
const target = () => ({
  requestId: randomUUID(),
  period: "2026-09",
  expectedRevision: null,
  amount: 500,
});
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
});
describe("quotation write boundary", () => {
  it("passes the resolved tenant and acting user", async () => {
    const a = draft(),
      b = change(),
      c = target();
    await caller().create(a);
    await caller().change(b);
    await caller().target(c);
    expect(m.create).toHaveBeenCalledWith(20, 7, {
      ...a,
      items: [{ ...a.items[0], name: "Item" }],
    });
    expect(m.change).toHaveBeenCalledWith(20, 7, b);
    expect(m.target).toHaveBeenCalledWith(20, 7, c);
  });
  it("lets a sales supervisor manage quotes but not settings", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "sales_supervisor" });
    await caller().create(draft());
    await expect(caller().target(target())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.target).not.toHaveBeenCalled();
  });
  it("denies every viewer mutation", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller().create(draft())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().change(change())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().target(target())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each([
    { merchantId: 99 },
    { validDays: 1.5 },
    { taxBasisPoints: 15.5 },
    { currency: "sar" },
    { conversationId: -1 },
    { customerPhone: "bad" },
  ])("rejects malformed or client-owned fields %j", async attack => {
    await expect(
      caller().create({ ...draft(), ...attack } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("requires a reviewed version for status and target changes", async () => {
    const b: any = change();
    delete b.expectedRevision;
    await expect(caller().change(b)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const c: any = target();
    delete c.expectedRevision;
    await expect(caller().target(c)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
  it("reports conflicts and missing records without database detail", async () => {
    m.change.mockRejectedValue(new QuotationConflict());
    await expect(caller().change(change())).rejects.toMatchObject({
      code: "CONFLICT",
    });
    m.change.mockRejectedValue(new QuotationUnavailable());
    await expect(caller().change(change())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    m.create.mockRejectedValue(Error("SQL password"));
    await expect(caller().create(draft())).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quotations unavailable",
    });
  });
});
describe("manual quotation validation", () => {
  it("rounds each line and then tax once using integers", () => {
    expect(
      calculateQuotation(
        [
          { name: "A", quantity: 1.5, unitPrice: 0.01 },
          { name: "B", quantity: 1, unitPrice: 0.1 },
        ],
        1500
      )
    ).toMatchObject({ subtotalMinor: 12, taxMinor: 2, totalMinor: 14 });
  });
  it.each([
    { name: " ", quantity: 1, unitPrice: 1 },
    { name: "a", quantity: 1.0001, unitPrice: 1 },
    { name: "a", quantity: 1, unitPrice: 1.001 },
    { name: "a", quantity: 99999, unitPrice: 99999999.99 },
    { name: "a", quantity: 1, unitPrice: 1, total: 999 },
  ])("rejects the complete draft instead of dropping a bad row %j", item => {
    expect(
      quotationDraftInput.safeParse({
        ...draft(),
        items: [draft().items[0], item],
      }).success
    ).toBe(false);
  });
  it("rejects total including tax beyond DECIMAL(10,2)", () => {
    expect(
      quotationDraftInput.safeParse({
        ...draft(),
        items: [{ name: "a", quantity: 1, unitPrice: 99999999.99 }],
      }).success
    ).toBe(false);
    expect(
      quotationDraftInput.safeParse({
        ...draft(),
        taxBasisPoints: 0,
        items: [{ name: "a", quantity: 1, unitPrice: 99999999.99 }],
      }).success
    ).toBe(true);
  });
  it("requires exact target money and a valid month", () => {
    expect(
      quotationTargetInput.safeParse({ ...target(), amount: 1.001 }).success
    ).toBe(false);
    expect(
      quotationTargetInput.safeParse({ ...target(), period: "2026-13" }).success
    ).toBe(false);
    expect(
      quotationTargetInput.safeParse({ ...target(), amount: 0 }).success
    ).toBe(true);
  });
  it.each([
    "source_message_id",
    "consent_message_id",
    "checkout_snapshot",
    "external_provider",
    "external_snapshot",
    "execution_state",
    "order_id",
    "external_result",
    "execution_attempt_id",
    "external_order_key",
    "offer_expires_at",
  ])("protects every governed marker %s", key => {
    expect(isGovernedQuotation({ [key]: "anything" })).toBe(true);
  });
});
