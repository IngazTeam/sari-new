import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("./security/download-media", () => ({
  downloadPublicMedia: mocks.download,
}));
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  createManualQuotation,
  QuotationConflict,
  QuotationUnavailable,
} from "./quotation-mutations";
import {
  prepareQuotationReview,
  readQuotationReview,
} from "./quotation-review";
describe.skipIf(!process.env.DATABASE_URL)(
  "quotation review snapshots in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      qid: number,
      account: number;
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const input = () => ({
      requestId: randomUUID(),
      quotationId: qid,
      expectedRevision: 1,
      instanceRecordId: account,
      templateId: null,
    });
    const prepare = (v = input()) =>
      prepareQuotationReview(owner.merchantId, owner.userId, v);
    beforeEach(async () => {
      vi.resetAllMocks();
      mocks.download.mockRejectedValue(Error("fixture image unavailable"));
      owner = await createDisposableMerchant("quote-review");
      other = await createDisposableMerchant("quote-foreign");
      const q = await createManualQuotation(owner.merchantId, owner.userId, {
        requestId: randomUUID(),
        customerName: "Local",
        customerPhone: "+966500000000",
        items: [{ name: "Product", quantity: 3, unitPrice: 10.01 }],
        validDays: 7,
        taxBasisPoints: 1500,
        currency: "SAR",
      });
      qid = q.recordId;
      const a = await query(
        "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary,phone_number) VALUES (?,?,'fixture-secret','mock','active',1,'+966511111111')",
        [owner.merchantId, `review-${randomUUID()}`]
      );
      account = Number(a.insertId);
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("stores exactly reviewed material without seeding terms, changing the quote or sending", async () => {
      const v = input(),
        r = await prepare(v);
      expect(r).toMatchObject({
        quotationId: qid,
        revision: 1,
        sent: false,
        expired: false,
        templateId: null,
        document: {
          data: {
            total: 34.53,
            termsText: null,
            customerPhone: "+966500000000",
          },
          logoDataUrl: null,
        },
      });
      expect(
        await readQuotationReview(owner.merchantId, owner.userId, {
          requestId: v.requestId,
        })
      ).toEqual(r);
      const [q] = await query(
        "SELECT status,offer_version FROM sales_quotations WHERE id=?",
        [qid]
      );
      expect(q).toEqual({ status: "draft", offer_version: 1 });
      expect(
        await query("SELECT id FROM quotation_templates WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
      expect(
        await query(
          "SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(0);
      const [row] = await query(
        "SELECT snapshot FROM quotation_delivery_reviews WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(JSON.stringify(row)).not.toContain("fixture-secret");
    });
    it("serializes concurrent identical requests into a single durable review", async () => {
      const v = input(),
        [a, b] = await Promise.all([prepare(v), prepare(v)]);
      expect(a).toEqual(b);
      expect(
        await query(
          "SELECT id FROM quotation_delivery_reviews WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("restores the first material after its template changes but rejects reusing its UUID for a different selection", async () => {
      const t = await query(
        "INSERT INTO quotation_templates (merchant_id,name,terms_text) VALUES (?,'Review terms','Original terms')",
        [owner.merchantId]
      );
      const v = { ...input(), templateId: Number(t.insertId) },
        a = await prepare(v);
      await query(
        "UPDATE quotation_templates SET terms_text='Changed terms' WHERE id=?",
        [t.insertId]
      );
      expect(await prepare(v)).toEqual(a);
      await expect(prepare({ ...v, templateId: null })).rejects.toThrow(
        QuotationConflict
      );
      const b = await prepare({ ...v, requestId: randomUUID() });
      expect(b.document.data.termsText).toBe("Changed terms");
      expect(b.snapshotHash).not.toBe(a.snapshotHash);
    });
    it("isolates quotation, account, template and receipt by tenant", async () => {
      const v = input();
      await prepare(v);
      expect(
        await readQuotationReview(other.merchantId, other.userId, {
          requestId: v.requestId,
        })
      ).toBeNull();
      await expect(
        prepareQuotationReview(other.merchantId, other.userId, input())
      ).rejects.toThrow(QuotationUnavailable);
      await query("UPDATE whatsapp_instances SET merchant_id=? WHERE id=?", [
        other.merchantId,
        account,
      ]);
      await expect(prepare()).rejects.toThrow(QuotationConflict);
      await query("UPDATE whatsapp_instances SET merchant_id=? WHERE id=?", [
        owner.merchantId,
        account,
      ]);
      const t = await query(
        "INSERT INTO quotation_templates (merchant_id,name) VALUES (?,'Foreign')",
        [other.merchantId]
      );
      await expect(
        prepare({ ...input(), templateId: Number(t.insertId) })
      ).rejects.toThrow(QuotationUnavailable);
    });
    it.each([
      "status='accepted'",
      "valid_until='2000-01-01'",
      "offer_version=2",
      "checkout_snapshot='{}'",
      "items='[]'",
      "total=99",
      "customer_phone=NULL",
    ])("rejects stale, managed or inconsistent source: %s", async patch => {
      await query(`UPDATE sales_quotations SET ${patch} WHERE id=?`, [qid]);
      await expect(prepare()).rejects.toThrow();
      expect(
        await query(
          "SELECT id FROM quotation_delivery_reviews WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(0);
    });
    it("rechecks membership even when a stale caller believes it has access", async () => {
      await query(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(prepare()).rejects.toThrow(QuotationConflict);
    });
    it("detects quote changes while the remote logo is being fetched without holding the write lock", async () => {
      await query(
        "UPDATE merchants SET logo_url='https://cdn.example/logo?token=secret' WHERE id=?",
        [owner.merchantId]
      );
      mocks.download.mockImplementation(async () => {
        await query(
          "UPDATE sales_quotations SET customer_phone='+966599999999' WHERE id=?",
          [qid]
        );
        throw Error("fixture");
      });
      await expect(prepare()).rejects.toThrow(QuotationConflict);
      expect(
        await query(
          "SELECT id FROM quotation_delivery_reviews WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(0);
    });
    it("restores a omitted-logo snapshot without fetching the URL on retry", async () => {
      await query(
        "UPDATE merchants SET logo_url='https://cdn.example/logo?token=secret' WHERE id=?",
        [owner.merchantId]
      );
      const v = input(),
        a = await prepare(v);
      expect(a.document.logoOmitted).toBe(true);
      expect(JSON.stringify(a)).not.toContain("token=secret");
      expect(await prepare(v)).toEqual(a);
      expect(mocks.download).toHaveBeenCalledOnce();
    });
    it("rejects corrupted stored snapshots instead of returning modified commercial text", async () => {
      const v = input();
      await prepare(v);
      await query(
        "UPDATE quotation_delivery_reviews SET snapshot=JSON_SET(snapshot,'$.caption','tampered') WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(
        readQuotationReview(owner.merchantId, owner.userId, {
          requestId: v.requestId,
        })
      ).rejects.toThrow(QuotationConflict);
    });
  }
);
