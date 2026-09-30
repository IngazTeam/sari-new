import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  QuotationPreviewModel,
  previewIdentity,
  previewModes,
} from "../prototypes/tenant-dashboard/src/quotation-model";
let m: QuotationPreviewModel;
const id = (v: number) =>
  `00000000-0000-4000-8000-${String(v).padStart(12, "0")}`;
const draft = (requestId = id(1)) => ({
  requestId,
  customerName: "Local sample",
  items: [{ name: "Item", quantity: 3, unitPrice: 10.01 }],
  validDays: 7,
});
const review = (requestId = id(2)) =>
  m.prepare({
    requestId,
    quotationId: 1,
    expectedRevision: 1,
    instanceRecordId: 1,
    templateId: null,
  });
beforeEach(() => {
  m = new QuotationPreviewModel();
});
describe("interactive quotation simulation", () => {
  it("pages every fixture and retains states, currency groups and literal search", () => {
    const one = m.workspace({ page: 1 }),
      two = m.workspace({ page: 2 });
    expect(one.list.items).toHaveLength(20);
    expect(two.list.items).toHaveLength(6);
    expect(
      new Set([...one.list.items, ...two.list.items].map(q => q.id)).size
    ).toBe(26);
    expect(one.statuses).toHaveLength(7);
    expect(one.unmeasured.salesProficiency).toBeNull();
    expect(m.workspace({ search: "%_" }).list.total).toBe(0);
    expect(
      m
        .workspace({ status: "unknown" })
        .list.items.every(q => q.status === "unknown")
    ).toBe(true);
  });
  it.each(["viewer", "supervisor"] as const)(
    "enforces the advertised %s controls",
    mode => {
      m.setMode(mode);
      const data = m.workspace({});
      expect(data.canSetTarget).toBe(false);
      expect(data.canManage).toBe(mode === "supervisor");
      expect(() =>
        m.mutate("target", {
          requestId: id(3),
          period: "2026-09",
          expectedRevision: 1,
          amount: 0,
        })
      ).toThrow();
      if (mode === "viewer")
        expect(() => m.mutate("create", draft())).toThrow();
    }
  );
  it.each(["error", "forbidden"] as const)(
    "does not fabricate empty results for %s",
    mode => {
      m.setMode(mode);
      expect(() => m.workspace({})).toThrow();
      expect(() => m.detail(1)).toThrow();
    }
  );
  it("represents an empty result and zero target without invented percentages", () => {
    m.setMode("empty");
    const d = m.workspace({});
    expect(d.total).toBe(0);
    expect(d.acceptedShare).toBeNull();
    m.setMode("normal");
    m.mutate("target", {
      requestId: id(3),
      period: "2026-09",
      expectedRevision: 1,
      amount: 0,
    });
    expect(m.workspace({}).targetBasis.progress).toBeNull();
  });
  it("creates once and preserves exact calculated amounts", () => {
    const first = m.mutate("create", draft());
    expect(m.mutate("create", draft())).toEqual(first);
    expect(m.rows).toHaveLength(27);
    expect(m.detail(first.recordId)).toMatchObject({
      subtotalMinor: 3003,
      taxMinor: 450,
      totalMinor: 3453,
      revision: 1,
    });
    expect(() =>
      m.mutate("create", { ...draft(), customerName: "Changed" })
    ).toThrow();
  });
  it("shows a newly created quotation in the empty-store scenario", () => {
    m.setMode("empty");
    m.mutate("create", draft());
    expect(m.workspace({}).total).toBe(1);
  });
  it("retains the receipt after a simulated response loss", () => {
    m.setMode("lostSave");
    expect(() => m.mutate("create", draft())).toThrow();
    const receipt = m.receipt(id(1));
    expect(receipt).toMatchObject({
      merchantId: previewIdentity,
      kind: "create",
    });
    expect(m.mutate("create", draft())).toEqual(receipt);
    expect(m.rows).toHaveLength(27);
  });
  it("changes the reviewed revision on conflict but does not apply the desired status", () => {
    m.setMode("conflict");
    const input = {
      requestId: id(3),
      id: 1,
      expectedRevision: 1,
      expectedStatus: "draft",
      status: "accepted",
    };
    expect(() => m.mutate("status", input)).toThrow();
    expect(m.detail(1)).toMatchObject({ revision: 2, status: "draft" });
    expect(m.receipt(id(3))).toBeNull();
    m.mutate("status", { ...input, requestId: id(4), expectedRevision: 2 });
    expect(m.detail(1).status).toBe("accepted");
  });
  it("does not silently add a template and requires an explicit matching review", () => {
    const r = review();
    expect(r.document.data.termsText).toBeNull();
    expect(
      m.prepare({
        requestId: id(5),
        quotationId: 1,
        expectedRevision: 1,
        instanceRecordId: 1,
        templateId: 1,
      }).document.data.termsText
    ).toContain("شروط توضيحية");
    expect(() =>
      m.send({
        requestId: id(6),
        reviewId: r.id,
        snapshotHash: r.snapshotHash,
        confirmed: false,
      })
    ).toThrow();
    expect(m.deliveries.size).toBe(0);
  });
  it.each(["normal", "unknownSend", "rejectedSend", "deliveredSend"] as const)(
    "shows %s delivery and prevents a second send from another request",
    mode => {
      m.setMode(mode);
      const r = review(),
        input = {
          requestId: id(6),
          reviewId: r.id,
          snapshotHash: r.snapshotHash,
          confirmed: true,
        };
      const receipt = m.send(input);
      expect(receipt.transport).toBe(
        {
          normal: "accepted",
          unknownSend: "unknown",
          rejectedSend: "rejected",
          deliveredSend: "delivered",
        }[mode]
      );
      expect(m.send(input)).toEqual(receipt);
      expect(() => m.send({ ...input, requestId: id(7) })).toThrow();
      expect(m.deliveries.size).toBe(1);
    }
  );
  it("prevents sending expired review and shows preparation failure", () => {
    m.setMode("expiredReview");
    const r = review();
    expect(() =>
      m.send({
        requestId: id(6),
        reviewId: r.id,
        snapshotHash: r.snapshotHash,
        confirmed: true,
      })
    ).toThrow();
    m.setMode("prepareFailed");
    expect(() => review(id(4))).toThrow();
  });
  it("blocks managed and closed quotation review", () => {
    expect(m.sendWorkspace(8).reason).toBe("managed");
    expect(() =>
      m.prepare({
        requestId: id(8),
        quotationId: 8,
        expectedRevision: 1,
        instanceRecordId: 1,
        templateId: null,
      })
    ).toThrow();
    expect(m.sendWorkspace(4).reason).toBe("closed");
  });
  it("imports actual components and isolates network through build-only aliases", () => {
    const entry = readFileSync(
        "prototypes/tenant-dashboard/src/quotation-preview.tsx",
        "utf8"
      ),
      adapter = readFileSync(
        "prototypes/tenant-dashboard/src/quotation-preview-api.ts",
        "utf8"
      ),
      build = readFileSync(
        "prototypes/tenant-dashboard/build-quotation.mjs",
        "utf8"
      );
    expect(entry).toContain(
      "client/src/components/merchant/QuotationWorkspace"
    );
    expect(build).toContain('"@/lib/trpc"');
    expect(adapter).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|https?:/);
    expect(Object.keys(previewModes)).toHaveLength(14);
  });
});
