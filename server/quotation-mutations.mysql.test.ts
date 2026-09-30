import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, afterAll, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  createManualQuotation,
  changeManualQuotation,
  changeQuotationTarget,
  readQuotationReceipt,
  QuotationConflict,
  QuotationUnavailable,
} from "./quotation-mutations";
import { readQuotationWorkspace } from "./quotation-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "manual quotation transactions in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const now = new Date("2026-09-30T10:00:00Z");
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const draft = () => ({
      requestId: randomUUID(),
      customerName: " Local ",
      customerPhone: "+966500000000",
      items: [
        { name: "Item", quantity: 1.5, unitPrice: 0.01 },
        { name: "Item 2", quantity: 1, unitPrice: 0.1 },
      ],
      validDays: 7,
      taxBasisPoints: 1500,
      currency: "SAR",
    });
    const create = (v = draft()) =>
      createManualQuotation(owner.merchantId, owner.userId, v, now);
    const change = (
      id: number,
      revision = 1,
      expectedStatus = "draft",
      status = "accepted",
      requestId = randomUUID()
    ) =>
      changeManualQuotation(
        owner.merchantId,
        owner.userId,
        { requestId, id, expectedRevision: revision, expectedStatus, status },
        now
      );
    const target = (
      amount: number,
      expectedRevision: number | null = null,
      requestId = randomUUID()
    ) =>
      changeQuotationTarget(
        owner.merchantId,
        owner.userId,
        { requestId, period: "2026-09", expectedRevision, amount },
        now
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("quote-writes");
      other = await createDisposableMerchant("quote-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("creates an exact draft with an atomic receipt and no sent counters", async () => {
      await target(100);
      const v = draft(),
        receipt = await create(v);
      const [q] = await query("SELECT * FROM sales_quotations WHERE id=?", [
        receipt.recordId,
      ]);
      expect(q).toMatchObject({
        merchant_id: owner.merchantId,
        customer_name: "Local",
        status: "draft",
        subtotal: "0.12",
        tax_amount: "0.02",
        total: "0.14",
        tax_basis_points: 1500,
        offer_version: 1,
      });
      expect(JSON.parse(q.items).map((v: any) => v.total)).toEqual([0.02, 0.1]);
      expect(
        await readQuotationReceipt(owner.merchantId, { requestId: v.requestId })
      ).toEqual(receipt);
      const [t] = await query(
        "SELECT quotations_sent,quotations_won,achieved_amount FROM sales_targets WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(t).toEqual({
        quotations_sent: 0,
        quotations_won: 0,
        achieved_amount: "0.00",
      });
      const logs = await query(
        "SELECT id FROM sari_activity_log WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(logs).toHaveLength(2);
    });
    it("serializes concurrent retries into one quote and refuses changed request contents", async () => {
      const v = draft(),
        [a, b] = await Promise.all([create(v), create(v)]);
      expect(b).toEqual(a);
      expect(
        await query("SELECT id FROM sales_quotations WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      await expect(create({ ...v, validDays: 14 })).rejects.toBeInstanceOf(
        QuotationConflict
      );
      expect(
        await query(
          "SELECT id FROM quotation_action_receipts WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("keeps request identities and their receipts scoped to the merchant", async () => {
      const v = draft(),
        a = await create(v);
      expect(
        await readQuotationReceipt(other.merchantId, { requestId: v.requestId })
      ).toBeNull();
      const b = await createManualQuotation(
        other.merchantId,
        other.userId,
        v,
        now
      );
      expect(b.recordId).not.toBe(a.recordId);
      expect(b.merchantId).toBe(other.merchantId);
      await expect(
        changeManualQuotation(
          other.merchantId,
          other.userId,
          {
            requestId: randomUUID(),
            id: a.recordId,
            expectedRevision: 1,
            expectedStatus: "draft",
            status: "accepted",
          },
          now
        )
      ).rejects.toBeInstanceOf(QuotationUnavailable);
    });
    it("rejects cross-tenant conversations and rolls back receipts/quotes", async () => {
      const c = await query(
        "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'+966500000000')",
        [other.merchantId]
      );
      const v = { ...draft(), conversationId: c.insertId };
      await expect(
        createManualQuotation(owner.merchantId, owner.userId, v, now)
      ).rejects.toBeInstanceOf(QuotationUnavailable);
      expect(
        await query("SELECT id FROM sales_quotations WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
      expect(
        await readQuotationReceipt(owner.merchantId, { requestId: v.requestId })
      ).toBeNull();
    });
    it("does not accept a different phone on an owned conversation", async () => {
      const c = await query(
        "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'different')",
        [owner.merchantId]
      );
      await expect(
        createManualQuotation(
          owner.merchantId,
          owner.userId,
          { ...draft(), conversationId: c.insertId },
          now
        )
      ).rejects.toBeInstanceOf(QuotationUnavailable);
    });
    it("prevents stale and concurrent status updates, with stable retry acknowledgements", async () => {
      const q = await create(),
        requestId = randomUUID();
      const attempts = await Promise.allSettled([
        change(q.recordId, 1, "draft", "accepted", requestId),
        change(q.recordId, 1, "draft", "rejected"),
      ]);
      expect(attempts.filter(v => v.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter(v => v.status === "rejected")).toHaveLength(1);
      const [current] = await query(
        "SELECT status,offer_version FROM sales_quotations WHERE id=?",
        [q.recordId]
      );
      expect(current.offer_version).toBe(2);
      if (attempts[0].status === "fulfilled")
        expect(
          await change(q.recordId, 1, "draft", "accepted", requestId)
        ).toEqual(attempts[0].value);
      await expect(
        change(q.recordId, 1, "draft", "accepted")
      ).rejects.toBeInstanceOf(QuotationConflict);
      expect(
        await change(q.recordId, 2, current.status, current.status)
      ).toMatchObject({ revision: 2, changed: false });
    });
    it("recomputes progress after acceptance and reversal, including targets set later", async () => {
      const q = await create();
      await query(
        "UPDATE sales_quotations SET created_at='2026-09-29 12:00:00' WHERE id=?",
        [q.recordId]
      );
      await change(q.recordId);
      await target(1);
      const read = () =>
        readQuotationWorkspace(
          owner.merchantId,
          { search: "", status: "all", page: 1, pageSize: 20 },
          now
        );
    const accepted = (await read()).targetBasis;
    expect(accepted.acceptedSarMinor).toBe(14);
    expect(accepted.progress).toBeCloseTo(14);
      await change(q.recordId, 2, "accepted", "rejected");
      expect((await read()).targetBasis).toMatchObject({
        acceptedSarMinor: 0,
        progress: 0,
      });
    });
    it("blocks checkout agreements and elapsed or explicitly expired acceptance", async () => {
      const q = await create();
      await query(
        "UPDATE sales_quotations SET checkout_snapshot=JSON_OBJECT('protected',true) WHERE id=?",
        [q.recordId]
      );
      await expect(change(q.recordId)).rejects.toBeInstanceOf(
        QuotationConflict
      );
      const expired = await create();
      await query(
        "UPDATE sales_quotations SET valid_until='2026-09-29' WHERE id=?",
        [expired.recordId]
      );
      await expect(change(expired.recordId)).rejects.toBeInstanceOf(
        QuotationConflict
      );
      const explicit = await create();
      await change(explicit.recordId, 1, "draft", "expired");
      await expect(
        change(explicit.recordId, 2, "expired", "accepted")
      ).rejects.toBeInstanceOf(QuotationConflict);
    });
    it("compares target revisions and rejects stale month changes", async () => {
      const key = randomUUID(),
        first = await target(100, null, key);
      expect(await target(100, null, key)).toEqual(first);
      await expect(target(200)).rejects.toBeInstanceOf(QuotationConflict);
      const next = await target(200, 1);
      expect(next.revision).toBe(2);
      await expect(target(100, 1)).rejects.toBeInstanceOf(QuotationConflict);
      expect(await target(200, 2)).toMatchObject({
        changed: false,
        revision: 2,
      });
      await expect(
        changeQuotationTarget(
          owner.merchantId,
          owner.userId,
          {
            requestId: randomUUID(),
            period: "2026-08",
            expectedRevision: null,
            amount: 100,
          },
          now
        )
      ).rejects.toBeInstanceOf(QuotationConflict);
    });
    it("rejects reuse of an action identity for a different operation", async () => {
      const v = draft();
      await create(v);
      await expect(target(100, null, v.requestId)).rejects.toBeInstanceOf(
        QuotationConflict
      );
    });
  }
);
