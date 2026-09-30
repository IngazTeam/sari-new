import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  prepare: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./quotation-review", async original => ({
  ...(await original<typeof import("./quotation-review")>()),
  prepareQuotationReview: mocks.prepare,
  readQuotationReview: mocks.read,
}));
import { quotationWorkspaceRouter } from "./routers-quotations";
import { quotationReviewInput } from "../shared/quotation-review";
import {
  quotationDigest,
  publicQuotationReview,
  readQuotationReviewRecord,
} from "./quotation-review";
import { QuotationConflict } from "./quotation-mutations";
const input = () => ({
  requestId: randomUUID(),
  quotationId: 1,
  expectedRevision: 1,
  instanceRecordId: 2,
  templateId: null,
});
const caller = () =>
  quotationWorkspaceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
const record = () => {
  const s = {
    version: "quotation-review.v1",
    merchantId: 20,
    actorId: 7,
    input: input(),
    status: "draft",
    provider: "mock",
    accountLabel: "Test account",
    basisDigest: "a".repeat(64),
    htmlDigest: "b".repeat(64),
    prepared: {
      data: {
        quotationNumber: "Q-1",
        merchantName: "Store",
        items: [{ name: "Item", quantity: 1, unitPrice: 10, total: 10 }],
        subtotal: 10,
        taxAmount: 0,
        total: 10,
        currency: "SAR",
        createdAt: "2026-09-30",
      },
      logoDataUrl: null,
      logoOmitted: false,
    },
    caption: "Quote",
    createdAt: "2026-09-30T10:00:00.000Z",
    expiresAt: "2026-09-30T10:15:00.000Z",
  };
  return {
    id: 2,
    merchant_id: 20,
    actor_id: 7,
    quotation_id: 1,
    request_id: s.input.requestId,
    snapshot: s,
    snapshot_hash: quotationDigest(s),
  };
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: "owner" });
});
describe("quotation review API", () => {
  it("binds preparation and restoration to the resolved tenant and user", async () => {
    const v = input();
    await caller().prepareReview(v);
    await caller().review({ requestId: v.requestId });
    expect(mocks.prepare).toHaveBeenCalledWith(20, 7, v);
    expect(mocks.read).toHaveBeenCalledWith(20, 7, { requestId: v.requestId });
  });
  it("denies a viewer both review creation and private restoration", async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller().prepareReview(input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().review({ requestId: randomUUID() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([
    { merchantId: 99 },
    { customerPhone: "+966500000000" },
    { caption: "replace" },
    { expectedRevision: 0 },
    { instanceRecordId: 0 },
    { templateId: -1 },
  ])(
    "rejects caller-controlled material or invalid review selection %j",
    async change => {
      await expect(
        caller().prepareReview({ ...input(), ...change } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.prepare).not.toHaveBeenCalled();
    }
  );
  it("selects no historical template by default", () => {
    const { templateId, ...v } = input();
    expect(quotationReviewInput.parse(v).templateId).toBeNull();
  });
  it("sanitizes failures and preserves conflict semantics", async () => {
    mocks.prepare
      .mockRejectedValueOnce(new QuotationConflict())
      .mockRejectedValueOnce(Error("token secret"));
    await expect(caller().prepareReview(input())).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(caller().prepareReview(input())).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quotations unavailable",
    });
  });
});
describe("durable review integrity", () => {
  it("hashes object order canonically without changing array order", () => {
    expect(quotationDigest({ a: 1, b: [1, 2] })).toBe(
      quotationDigest({ b: [1, 2], a: 1 })
    );
    expect(quotationDigest({ a: 1, b: [1, 2] })).not.toBe(
      quotationDigest({ b: [2, 1], a: 1 })
    );
  });
  it("restores the review and omits internal basis hashes from the public projection", () => {
    const r = record(),
      read = readQuotationReviewRecord({
        ...r,
        snapshot: JSON.stringify(r.snapshot),
      });
    const publicValue = publicQuotationReview(read, "2026-09-30T10:01:00.000Z");
    expect(publicValue).toMatchObject({
      merchantId: 20,
      sent: false,
      expired: false,
      document: { logoDataUrl: null },
    });
    expect(publicValue).not.toHaveProperty("basisDigest");
    expect(publicValue).not.toHaveProperty("htmlDigest");
    expect(
      publicQuotationReview(read, "2026-09-30T10:15:00.000Z").expired
    ).toBe(true);
    expect(
      publicQuotationReview(read, "2026-09-30T09:59:59.999Z").expired
    ).toBe(true);
  });
  it.each(["merchant_id", "actor_id", "quotation_id"])(
    "rejects cross-record identity %s",
    key => {
      expect(() =>
        readQuotationReviewRecord({ ...record(), [key]: 999 })
      ).toThrow(QuotationConflict);
    }
  );
  it("rejects changed material, invalid logos, raw URLs and changed review durations", () => {
    const r = record();
    r.snapshot.caption = "Changed";
    expect(() => readQuotationReviewRecord(r)).toThrow(QuotationConflict);
    for (const patch of [
      {
        prepared: {
          ...r.snapshot.prepared,
          logoDataUrl: "https://localhost/private",
        },
      },
      {
        prepared: {
          ...r.snapshot.prepared,
          data: {
            ...r.snapshot.prepared.data,
            merchantLogo: "https://cdn.example/signed",
          },
        },
      },
      { expiresAt: "2026-10-01T10:15:00.000Z" },
    ]) {
      const s = { ...record().snapshot, ...patch },
        row = record();
      row.snapshot = s as any;
      row.request_id = s.input.requestId;
      row.snapshot_hash = quotationDigest(s);
      expect(() => readQuotationReviewRecord(row)).toThrow(QuotationConflict);
    }
  });
});
