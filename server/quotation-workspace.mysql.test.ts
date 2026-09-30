import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getPool } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readQuotationWorkspace,
  readQuotationDetail,
} from "./quotation-workspace";
import type { QuotationSelection } from "../shared/quotation-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "quotation workspace in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const now = new Date("2026-09-30T10:00:00Z");
    const run = async (sql: string, args: any[] = []) => {
      const [r] = await (await getPool())!.execute<any>(sql, args);
      return Number(r.insertId);
    };
    const read = (v: Partial<QuotationSelection> = {}) =>
      readQuotationWorkspace(
        owner.merchantId,
        { status: "all", search: "", page: 1, pageSize: 20, ...v },
        now
      );
    const quote = (
      v: {
        merchant?: number;
        status?: string;
        currency?: string;
        total?: number;
        at?: string;
        name?: string;
        items?: string;
      } = {}
    ) =>
      run(
        "INSERT INTO sales_quotations (merchant_id,quotation_number,customer_name,customer_phone,items,subtotal,tax_amount,total,currency,status,created_at,valid_until) VALUES (?,'LOCAL-Q',?,'+966500000000',?,100,15,?,?,?,?,'2026-09-30')",
        [
          v.merchant ?? owner.merchantId,
          v.name ?? "Local",
          v.items ??
            '[{"name":"Item","quantity":2,"unitPrice":50,"total":100}]',
          v.total ?? 115,
          v.currency ?? "SAR",
          v.status ?? "sent",
          v.at ?? "2026-09-29 12:00:00",
        ]
      );
    const target = (amount: number) =>
      run(
        "INSERT INTO sales_targets (merchant_id,period_type,period_start,period_end,target_amount,achieved_amount,quotations_sent,quotations_won) VALUES (?,'monthly','2026-09-01','2026-09-30',?,9999,800,700)",
        [owner.merchantId, amount]
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("quotation");
      other = await createDisposableMerchant("quote-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("distinguishes empty samples from unknown outcomes", async () => {
      const d = await read();
      expect(d.total).toBe(0);
      expect(d.target).toBeNull();
      expect(d.acceptedShare).toBeNull();
      expect(d.targetBasis.progress).toBeNull();
      expect(Object.values(d.unmeasured).every(v => v === null)).toBe(true);
    });
    it("isolates list, summary and direct details", async () => {
      const mine = await quote(),
        foreign = await quote({
          merchant: other.merchantId,
          status: "accepted",
        });
      const d = await read();
      expect(d.total).toBe(1);
      expect(d.list.items.map(v => v.id)).toEqual([mine]);
      expect(d.values).toEqual([]);
      expect(
        await readQuotationDetail(owner.merchantId, foreign, now)
      ).toBeNull();
      expect(
        await readQuotationDetail(owner.merchantId, mine, now)
      ).toMatchObject({
        merchantId: owner.merchantId,
        number: "LOCAL-Q",
        subtotalMinor: 10000,
        taxMinor: 1500,
        totalMinor: 11500,
        createdAt: "2026-09-29T12:00:00.000Z",
        validityElapsed: false,
        managed: false,
      });
    });
    it("paginates beyond fifty records and keeps literal wildcard search", async () => {
      const ids = [];
      for (let i = 0; i < 53; i++)
        ids.push(await quote({ name: i === 0 ? "100%_item" : "Local" }));
      expect((await read()).list.total).toBe(53);
      expect((await read({ page: 3 })).list.items.map(v => v.id)).toEqual(
        ids.slice().reverse().slice(40)
      );
      expect((await read({ search: "%_" })).list.items.map(v => v.id)).toEqual([
        ids[0],
      ]);
      expect((await read({ search: "' OR 1=1" })).list.total).toBe(0);
      expect((await read({ page: 4 })).list.items).toEqual([]);
    });
    it("separates currencies and excludes invalid amounts without claiming revenue", async () => {
      await quote({ status: "accepted", total: 0.01 });
      await quote({ status: "accepted", currency: "USD", total: 22.5 });
      await quote({ status: "accepted", currency: "sar", total: 77 });
      await quote({ status: "accepted", currency: "XXX", total: -10 });
      await quote({ status: "rejected" });
      const d = await read({ status: "accepted" });
      expect(d.list.total).toBe(4);
      expect(d.total).toBe(5);
      expect(d.acceptedShare).toBe(80);
      expect(d.values).toEqual([
        { currency: "SAR", count: 1, totalMinor: 1, excludedAmounts: 0 },
        { currency: "USD", count: 1, totalMinor: 2250, excludedAmounts: 0 },
        { currency: "XXX", count: 0, totalMinor: 0, excludedAmounts: 1 },
        { currency: "sar", count: 1, totalMinor: 7700, excludedAmounts: 0 },
      ]);
    });
    it("derives target progress from current accepted SAR creation cohort, not inflated counters", async () => {
      await target(200);
      await quote({
        status: "accepted",
        total: 100,
        at: "2026-09-01 00:00:00",
      });
      await quote({
        status: "accepted",
        total: 200,
        at: "2026-09-30 10:00:00",
      });
      await quote({
        status: "accepted",
        total: 500,
        at: "2026-08-31 23:59:59",
      });
      await quote({
        status: "accepted",
        total: 600,
        at: "2026-09-30 10:00:01",
      });
      await quote({ status: "accepted", currency: "USD", total: 30 });
      await quote({ status: "accepted", total: -1 });
      await quote();
      const d = await read();
      expect(d.target).toMatchObject({
        amountMinor: 20000,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      });
      expect(d.targetBasis).toEqual({
        created: 5,
        accepted: 4,
        acceptedSar: 2,
        acceptedSarMinor: 30000,
        excludedSarAmounts: 1,
        progress: 150,
      });
    });
    it("does not divide by a zero target or mutate old counters", async () => {
      const id = await target(0);
      await quote({ status: "accepted" });
      expect((await read()).targetBasis.progress).toBeNull();
      const [r] = await (await getPool())!.execute<any[]>(
        "SELECT achieved_amount,quotations_sent,quotations_won FROM sales_targets WHERE id=?",
        [id]
      );
      expect(r[0]).toEqual({
        achieved_amount: "9999.00",
        quotations_sent: 800,
        quotations_won: 700,
      });
    });
    it("marks governed checkout records and hides foreign related records", async () => {
      const id = await quote();
      const conv = await run(
        "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'local')",
        [other.merchantId]
      );
      await run(
        "UPDATE sales_quotations SET checkout_snapshot=JSON_OBJECT('secret','do not expose'),conversation_id=?,external_provider='zid',external_snapshot=JSON_OBJECT('secret','token') WHERE id=?",
        [conv, id]
      );
      const d = await readQuotationDetail(owner.merchantId, id, now);
      expect(d).toMatchObject({
        managed: true,
        provider: "zid",
        conversationId: null,
      });
      expect(JSON.stringify(d)).not.toContain("secret");
      expect(JSON.stringify(d)).not.toContain("token");
    });
    it("shows elapsed validity separately from stored status and preserves invalid items", async () => {
      const id = await quote({ items: "invalid-json" });
      await run(
        "UPDATE sales_quotations SET valid_until='2026-09-29' WHERE id=?",
        [id]
      );
      const d = await readQuotationDetail(owner.merchantId, id, now);
      expect(d).toMatchObject({
        status: "sent",
        validityElapsed: true,
        items: [],
        rawItems: "invalid-json",
      });
    });
  }
);
