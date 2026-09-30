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
const mocks = vi.hoisted(() => ({
  pdf: vi.fn(),
  send: vi.fn(),
  afterLookup: vi.fn(),
}));
vi.mock("./services/quotation-pdf", async original => ({
  ...(await original<typeof import("./services/quotation-pdf")>()),
  renderPreparedQuotationPDF: mocks.pdf,
}));
vi.mock("./channels/whatsapp/providers", () => ({
  getWhatsAppProvider: () => ({ send: mocks.send }),
}));
vi.mock("./db", async original => {
  const actual = await original<typeof import("./db")>();
  return {
    ...actual,
    getWhatsAppInstanceById: async (id: number) => {
      const value = await actual.getWhatsAppInstanceById(id);
      await mocks.afterLookup(value);
      return value;
    },
  };
});
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  createManualQuotation,
  QuotationConflict,
} from "./quotation-mutations";
import { prepareQuotationReview, quotationDigest } from "./quotation-review";
import {
  sendReviewedQuotation,
  readQuotationDelivery,
  quotationDeliveryKey,
  readQuotationSendWorkspace,
} from "./quotation-delivery";
import { sendMerchantWhatsApp } from "./channels/whatsapp/service";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed quotation transport in MySQL with fake providers",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      qid: number,
      account: number,
      r: Awaited<ReturnType<typeof prepareQuotationReview>>;
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const input = () => ({
      requestId: randomUUID(),
      reviewId: r.id,
      snapshotHash: r.snapshotHash,
      confirmed: true as const,
    });
    const send = (v = input()) =>
      sendReviewedQuotation(owner.merchantId, owner.userId, v);
    const read = (requestId: string) =>
      readQuotationDelivery(owner.merchantId, owner.userId, { requestId });
    const prepare = (expectedRevision = 1) =>
      prepareQuotationReview(owner.merchantId, owner.userId, {
        requestId: randomUUID(),
        quotationId: qid,
        expectedRevision,
        instanceRecordId: account,
        templateId: null,
      });
    beforeEach(async () => {
      vi.resetAllMocks();
      mocks.pdf.mockResolvedValue("https://storage.example/first.pdf");
      mocks.send.mockResolvedValue({
        accepted: true,
        status: "sent",
        providerMessageId: "provider-fixture",
      });
      owner = await createDisposableMerchant("quote-send");
      other = await createDisposableMerchant("quote-send-other");
      qid = (
        await createManualQuotation(owner.merchantId, owner.userId, {
          requestId: randomUUID(),
          customerName: "Local",
          customerPhone: "+966500000000",
          items: [{ name: "Item", quantity: 3, unitPrice: 10.01 }],
          taxBasisPoints: 1500,
          validDays: 7,
          currency: "SAR",
        })
      ).recordId;
      account = Number(
        (
          await query(
            "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'fixture-secret','mock','active',1)",
            [owner.merchantId, `quotation-${randomUUID()}`]
          )
        ).insertId
      );
      r = await prepare();
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("returns scoped account/template choices and a saved review without seeding terms or sending", async () => {
      const first = await readQuotationSendWorkspace(
        owner.merchantId,
        owner.userId,
        { quotationId: qid }
      );
      expect(first).toMatchObject({
        merchantId: owner.merchantId,
        actorId: owner.userId,
        quotationId: qid,
        reason: null,
        review: { id: r.id },
        delivery: null,
        templates: [],
        accounts: [{ id: account, primary: true }],
      });
      expect(JSON.stringify(first)).not.toContain("fixture-secret");
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.pdf).not.toHaveBeenCalled();
      await expect(
        readQuotationSendWorkspace(other.merchantId, other.userId, {
          quotationId: qid,
        })
      ).rejects.toThrow();
      const v = input();
      await send(v);
      expect(
        await readQuotationSendWorkspace(owner.merchantId, owner.userId, {
          quotationId: qid,
        })
      ).toMatchObject({
        reason: "attempted",
        delivery: { requestId: v.requestId, transport: "accepted" },
        deliveryOwned: true,
      });
    });
    it("sends one reviewed PDF and reports provider acceptance separately from delivery", async () => {
      const v = input(),
        a = await send(v);
      expect(a).toMatchObject({
        quotationId: qid,
        transport: "accepted",
        state: "dispatching",
        projection: "recorded",
        providerMessageId: "provider-fixture",
      });
      expect(a).not.toHaveProperty("pdfUrl");
      expect(mocks.pdf).toHaveBeenCalledWith(
        r.document,
        expect.stringMatching(/^[a-f0-9]{64}$/)
      );
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "mock" }),
        expect.objectContaining({
          to: "+966500000000",
          kind: "document",
          text: r.caption,
          mediaUrl: "https://storage.example/first.pdf",
        })
      );
      expect(
        (
          await query(
            "SELECT status,offer_version FROM sales_quotations WHERE id=?",
            [qid]
          )
        )[0]
      ).toEqual({ status: "sent", offer_version: 2 });
      expect(await send(v)).toEqual(a);
      expect(await read(v.requestId)).toEqual(a);
      expect(mocks.pdf).toHaveBeenCalledOnce();
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(
        await query(
          "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='quotation_provider_receipt'",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("allows only one provider effect across two separately reviewed attempts for the same quote", async () => {
      const first = input();
      r = await prepare();
      const second = input();
      await Promise.allSettled([send(first), send(second)]);
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(
        await query(
          "SELECT id FROM quotation_deliveries WHERE merchant_id=? AND state='dispatching'",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("reclaims expired PDF preparation but a late former owner cannot overwrite the winning file", async () => {
      let release: (url: string) => void = () => {};
      let started: () => void = () => {};
      const signal = new Promise<void>(resolve => {
        started = resolve;
      });
      mocks.pdf
        .mockImplementationOnce(() => {
          started();
          return new Promise<string>(resolve => {
            release = resolve;
          });
        })
        .mockResolvedValueOnce("https://storage.example/winning.pdf");
      const v = input(),
        first = send(v);
      await signal;
      try {
        await query(
          "UPDATE quotation_deliveries SET prepare_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
          [owner.merchantId]
        );
        expect(await send(v)).toMatchObject({ transport: "accepted" });
      } finally {
        release("https://storage.example/late.pdf");
      }
      expect(await first).toMatchObject({ transport: "accepted" });
      expect(
        (
          await query(
            "SELECT pdf_url FROM quotation_deliveries WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].pdf_url
      ).toBe("https://storage.example/winning.pdf");
      expect(mocks.pdf).toHaveBeenCalledTimes(2);
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it("handles simultaneous clicks with one PDF owner and one provider call", async () => {
      mocks.pdf.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 40));
        return "https://storage.example/first.pdf";
      });
      const v = input();
      await Promise.all(Array.from({ length: 8 }, () => send(v)));
      expect(await read(v.requestId)).toMatchObject({ transport: "accepted" });
      expect(mocks.pdf).toHaveBeenCalledOnce();
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it.each([
      {
        accepted: false,
        status: "failed",
        outcome: "unknown",
        errorCode: "provider_unreachable",
      },
      { accepted: true, status: "sent" },
      {
        accepted: false,
        status: "failed",
        outcome: "rejected",
        errorCode: "http_400",
      },
    ])(
      "does not regenerate or resend unresolved/rejected transport %j",
      async result => {
        mocks.send.mockResolvedValue(result);
        const v = input(),
          a = await send(v);
        expect(a?.transport).toBe(
          result.errorCode === "http_400" ? "rejected" : "unknown"
        );
        await closeDb();
        expect(await send(v)).toEqual(a);
        expect(mocks.send).toHaveBeenCalledOnce();
        expect(mocks.pdf).toHaveBeenCalledOnce();
        expect(
          (
            await query("SELECT status FROM sales_quotations WHERE id=?", [qid])
          )[0].status
        ).toBe("draft");
        r = await prepare();
        await expect(send()).rejects.toThrow(QuotationConflict);
        expect(mocks.send).toHaveBeenCalledOnce();
      }
    );
    it("preserves an ambiguous transport exception as unknown after the connection restarts", async () => {
      mocks.send.mockRejectedValue(
        Error("provider accepted but response lost")
      );
      const v = input();
      expect(await send(v)).toMatchObject({ transport: "unknown" });
      await closeDb();
      expect(await read(v.requestId)).toMatchObject({ transport: "unknown" });
      await send(v);
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it("recovers a PDF preparation failure using the same attempt before any provider call", async () => {
      mocks.pdf.mockRejectedValueOnce(Error("storage private failure"));
      const v = input(),
        a = await send(v);
      expect(a).toMatchObject({
        transport: "not_attempted",
        state: "preparing",
        preparationFailed: true,
      });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(await send(v)).toMatchObject({
        id: a!.id,
        transport: "accepted",
        preparationFailed: false,
      });
      expect(mocks.pdf).toHaveBeenCalledTimes(2);
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it("does not accept a non-HTTPS storage result", async () => {
      mocks.pdf.mockResolvedValue("http://localhost/private.pdf");
      expect(await send()).toMatchObject({
        preparationFailed: true,
        transport: "not_attempted",
      });
      expect(mocks.send).not.toHaveBeenCalled();
    });
    it("isolates restored receipts and rejects a review owned by another tenant", async () => {
      const v = input();
      await send(v);
      expect(
        await readQuotationDelivery(other.merchantId, other.userId, {
          requestId: v.requestId,
        })
      ).toBeNull();
      await expect(
        sendReviewedQuotation(other.merchantId, other.userId, input())
      ).rejects.toThrow();
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it("rejects reuse of a request UUID or a review for a different authorization", async () => {
      const v = input();
      await send(v);
      await expect(
        send({ ...v, snapshotHash: "a".repeat(64) })
      ).rejects.toThrow(QuotationConflict);
      await expect(send({ ...v, requestId: randomUUID() })).rejects.toThrow(
        QuotationConflict
      );
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it.each([
      "customer_phone='+966599999999'",
      "offer_version=2",
      "status='accepted'",
      "checkout_snapshot='{}'",
    ])(
      "blocks changed commercial material before PDF generation: %s",
      async patch => {
        await query(`UPDATE sales_quotations SET ${patch} WHERE id=?`, [qid]);
        await expect(send()).rejects.toThrow(QuotationConflict);
        expect(mocks.pdf).not.toHaveBeenCalled();
        expect(mocks.send).not.toHaveBeenCalled();
      }
    );
    it("rechecks commercial material after PDF preparation", async () => {
      mocks.pdf.mockImplementation(async () => {
        await query(
          "UPDATE sales_quotations SET customer_phone='+966599999999' WHERE id=?",
          [qid]
        );
        return "https://storage.example/first.pdf";
      });
      await expect(send()).rejects.toThrow(QuotationConflict);
      expect(mocks.send).not.toHaveBeenCalled();
    });
    it.each(["recipient", "account", "membership"])(
      "rechecks %s after channel account lookup and suppresses stale sends",
      async change => {
        mocks.afterLookup.mockImplementationOnce(async () => {
          if (change === "recipient")
            await query(
              "UPDATE sales_quotations SET customer_phone='+966599999999' WHERE id=?",
              [qid]
            );
          if (change === "account")
            await query(
              "UPDATE whatsapp_instances SET token='changed' WHERE id=?",
              [account]
            );
          if (change === "membership")
            await query(
              "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
              [owner.merchantId, owner.userId]
            );
        });
        if (change === "membership")
          await expect(send()).rejects.toThrow(QuotationConflict);
        else expect(await send()).toMatchObject({ transport: "suppressed" });
        expect(mocks.send).not.toHaveBeenCalled();
        expect(
          (
            await query(
              "SELECT status,error_code FROM whatsapp_message_deliveries WHERE merchant_id=?",
              [owner.merchantId]
            )
          )[0]
        ).toEqual({ status: "failed", error_code: "quotation_suppressed" });
      }
    );
    it.each(["checkout_snapshot='{}'", "customer_phone='+966599999999'"])(
      "does not project a sent status onto material changed without a revision increment: %s",
      async patch => {
        mocks.send.mockImplementation(async () => {
          await query(`UPDATE sales_quotations SET ${patch} WHERE id=?`, [qid]);
          return {
            accepted: true,
            status: "sent",
            providerMessageId: "accepted-before-change",
          };
        });
        expect(await send()).toMatchObject({
          transport: "accepted",
          projection: "quote_changed",
        });
        expect(
          (
            await query("SELECT status FROM sales_quotations WHERE id=?", [qid])
          )[0].status
        ).toBe("draft");
      }
    );
    it("does not overwrite a concurrent accepted state after provider acceptance", async () => {
      mocks.send.mockImplementation(async () => {
        await query(
          "UPDATE sales_quotations SET status='accepted',offer_version=offer_version+1 WHERE id=?",
          [qid]
        );
        return {
          accepted: true,
          status: "sent",
          providerMessageId: "accepted-in-flight",
        };
      });
      expect(await send()).toMatchObject({
        transport: "accepted",
        projection: "quote_changed",
      });
      expect(
        (
          await query("SELECT status FROM sales_quotations WHERE id=?", [qid])
        )[0].status
      ).toBe("accepted");
    });
    it("reads delivery/read callbacks without issuing another provider call", async () => {
      const v = input(),
        a = await send(v);
      for (const status of ["delivered", "read"]) {
        await query(
          "UPDATE whatsapp_message_deliveries SET status=? WHERE merchant_id=? AND idempotency_key=?",
          [
            status,
            owner.merchantId,
            quotationDeliveryKey(owner.merchantId, a!.id),
          ]
        );
        expect(await read(v.requestId)).toMatchObject({ transport: status });
      }
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it("refuses contradictory outbox contents instead of attributing a different message", async () => {
      const v = input();
      await send(v);
      await query(
        "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','+966599999999') WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(read(v.requestId)).rejects.toThrow(QuotationConflict);
      await expect(send(v)).rejects.toThrow(QuotationConflict);
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it("blocks an earlier legacy send, even if its outcome is unknown", async () => {
      await query(
        "INSERT INTO whatsapp_message_deliveries (merchant_id,instance_id,provider,idempotency_key,direction,status,request_json) VALUES (?,?,'mock',?,'outgoing','queued','{}')",
        [owner.merchantId, account, `quotation:${owner.merchantId}:${qid}:text`]
      );
      await expect(send()).rejects.toThrow(QuotationConflict);
      expect(mocks.pdf).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    });
    it("never dispatches an expired review even with a internally consistent stored snapshot", async () => {
      const [row] = await query(
          "SELECT snapshot FROM quotation_delivery_reviews WHERE id=?",
          [r.id]
        ),
        s =
          typeof row.snapshot === "string"
            ? JSON.parse(row.snapshot)
            : row.snapshot;
      s.createdAt = "2000-01-01T10:00:00.000Z";
      s.expiresAt = "2000-01-01T10:15:00.000Z";
      const hash = quotationDigest(s);
      await query(
        "UPDATE quotation_delivery_reviews SET snapshot=?,snapshot_hash=? WHERE id=?",
        [JSON.stringify(s), hash, r.id]
      );
      await expect(send({ ...input(), snapshotHash: hash })).rejects.toThrow(
        QuotationConflict
      );
      expect(mocks.pdf).not.toHaveBeenCalled();
    });
    it("requires the transport authority even if callers borrow a reviewed-key prefix", async () => {
      expect(
        await sendMerchantWhatsApp({
          merchantId: owner.merchantId,
          instanceRecordId: account,
          to: "+966500000000",
          kind: "text",
          text: "No review",
          idempotencyKey: quotationDeliveryKey(owner.merchantId, 999),
        })
      ).toMatchObject({ accepted: false, errorCode: "quotation_suppressed" });
      expect(mocks.send).not.toHaveBeenCalled();
    });
  }
);
