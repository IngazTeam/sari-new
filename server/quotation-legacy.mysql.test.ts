import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, afterAll, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  createQuotation,
  getQuotationById,
  getQuotations,
  getQuotationStats,
  getCurrentTarget,
  getTargetHistory,
  setMonthlyTarget,
  updateQuotationStatus,
  formatQuotationMessage,
  getTemplates,
} from "./db/sales-quotations";
describe.skipIf(!process.env.DATABASE_URL)(
  "quotation compatibility in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const input = () => ({
      merchantId: owner.merchantId,
      actorId: owner.userId,
      requestId: randomUUID(),
      customerName: "Local",
      customerPhone: "+966500000000",
      items: [{ name: "Item", quantity: 2, unitPrice: 10.1, total: 999999 }],
      taxRate: 0.05,
      validDays: 7,
    });
    const accept = (q: Awaited<ReturnType<typeof createQuotation>>) =>
      updateQuotationStatus(q.id, owner.merchantId, "accepted", {
        actorId: owner.userId,
        expectedRevision: q.offerVersion,
        expectedStatus: q.status,
        requestId: randomUUID(),
      });
    beforeEach(async () => {
      owner = await createDisposableMerchant("quote-compat");
      other = await createDisposableMerchant("quote-foreign");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("normalizes saved columns and decimal money without trusting caller totals", async () => {
      const q = await createQuotation(input());
      expect(q).toMatchObject({
        merchantId: owner.merchantId,
        customerName: "Local",
        customerPhone: "+966500000000",
        subtotal: 20.2,
        taxAmount: 1.01,
        total: 21.21,
        taxRate: 0.05,
        status: "draft",
        offerVersion: 1,
      });
      const saved = await getQuotationById(q.id, owner.merchantId);
      expect(saved).toMatchObject({
        quotationNumber: q.quotationNumber,
        total: 21.21,
        items: [{ name: "Item", quantity: 2, unitPrice: 10.1, total: 20.2 }],
      });
      expect(saved?.createdAt).toBeInstanceOf(Date);
      const text = formatQuotationMessage(saved!, "Local");
      expect(text).toContain("الضريبة (5%): 1.01 SAR");
      expect(text).not.toContain("15%");
    });
    it("reuses a caller request id and isolates direct compatibility reads", async () => {
      const v = input(),
        a = await createQuotation(v),
        b = await createQuotation(v);
      expect(a.id).toBe(b.id);
      expect(await getQuotationById(a.id, other.merchantId)).toBeNull();
      expect(await getQuotations(other.merchantId)).toEqual([]);
      expect(await getQuotations(owner.merchantId)).toHaveLength(1);
      await expect(getQuotations(owner.merchantId, 1.5)).rejects.toThrow();
    });
    it("does not repeat additive target updates and exposes unmeasured legacy claims as null", async () => {
      const q = await createQuotation(input());
      await accept(q);
      const current = (await getQuotationById(q.id, owner.merchantId))!;
      await updateQuotationStatus(q.id, owner.merchantId, "accepted", {
        actorId: owner.userId,
        expectedRevision: current.offerVersion,
        expectedStatus: current.status,
      });
      const target = await setMonthlyTarget(owner.merchantId, 100, {
        actorId: owner.userId,
        requestId: randomUUID(),
        expectedRevision: null,
        period: new Date().toISOString().slice(0, 7),
      });
      expect(target).toMatchObject({
        achievedAmount: 21.21,
        quotationsCreated: 1,
        quotationsWon: 1,
        quotationsSent: null,
      });
      await query(
        "UPDATE sales_targets SET achieved_amount=9999,quotations_won=999,quotations_sent=999 WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await getCurrentTarget(owner.merchantId)).toMatchObject({
        achievedAmount: 21.21,
        quotationsWon: 1,
        quotationsSent: null,
      });
      expect((await getTargetHistory(owner.merchantId))[0]).toMatchObject({
        achievedAmount: 21.21,
        quotationsWon: 1,
        quotationsSent: null,
      });
      expect(await getQuotationStats(owner.merchantId)).toMatchObject({
        total: 1,
        accepted: 1,
        acceptedShare: 100,
        conversionRate: null,
        totalRevenue: null,
        acceptedAmounts: [{ currency: "SAR", totalMinor: 2121, count: 1 }],
      });
    });
    it("does not permit legacy writes or formatting to bypass checkout authority", async () => {
      const q = await createQuotation(input());
      await query(
        "UPDATE sales_quotations SET checkout_snapshot=JSON_OBJECT('private','hidden'),external_snapshot=JSON_OBJECT('secret','never expose') WHERE id=?",
        [q.id]
      );
      await expect(accept(q)).rejects.toThrow();
      const rows = await getQuotations(owner.merchantId);
      expect(rows[0].managed).toBe(true);
      expect(JSON.stringify(rows)).not.toContain("hidden");
      expect(JSON.stringify(rows)).not.toContain("secret");
      expect(() => formatQuotationMessage(rows[0], "Local")).toThrow();
    });
    it("preserves unrecognized item text without claiming valid formatted prices", async () => {
      const q = await createQuotation(input());
      await query("UPDATE sales_quotations SET items=? WHERE id=?", [
        '[{"name":"Legacy","quantity":1,"price":1000}]',
        q.id,
      ]);
      const saved = (await getQuotationById(q.id, owner.merchantId))!;
      expect(saved.items[0].unitPrice).toBeNull();
      expect(saved.rawItems).toContain('"price":1000');
      expect(() => formatQuotationMessage(saved, "Local")).toThrow();
    });
    it("maps the stored default template and its footer/terms without snake-case loss", async () => {
      await query(
        "INSERT INTO quotation_templates (merchant_id,name,is_default,footer_text,terms_text) VALUES (?,'Saved',1,'Footer','Terms')",
        [owner.merchantId]
      );
      const [t] = await getTemplates(owner.merchantId);
      expect(t).toMatchObject({
        merchantId: owner.merchantId,
        name: "Saved",
        isDefault: true,
        footerText: "Footer",
        termsText: "Terms",
      });
      const q = await createQuotation(input()),
        text = formatQuotationMessage(q, "Local", t);
      expect(text).toContain("Footer");
      expect(text).toContain("Terms");
    });
  }
);
