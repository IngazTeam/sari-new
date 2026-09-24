import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { getBookingConsentReview } from "../booking-consent-review";
import {
  updateBookingOperation,
  getBookingOperationHistory,
} from "../booking-operations";
vi.mock("./openai", () => ({ callGPT4: vi.fn() }));
import { callGPT4 } from "./openai";
import { handleBookingConversation } from "./booking-conversation";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  prepareBookingAgreement,
  prepareBookingAmendment,
  acceptBookingAgreement,
} from "./booking-agreements";
import {
  stageInteraction,
  finishInteractionDelivery,
} from "./interaction-jobs";
import { buildReplyPlan } from "../messaging/reply-plan";
import {
  withInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";
import type { CheckoutIdentity } from "./checkout-agreements";
import * as readiness from "../db/schema-readiness";

describe.skipIf(!process.env.DATABASE_URL)(
  "customer-approved booking amendments",
  () => {
    let children: ChildProcess[] = [];
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      source: CheckoutIdentity,
      serviceId: number,
      staffId: number,
      slotId: number;
    const phone = "966500000085",
      date = new Date(Date.now() + 2 * 86400000 + 10800000)
        .toISOString()
        .slice(0, 10);
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const selection = (patch: any = {}) => ({
      serviceId,
      staffId: null,
      bookingDate: date,
      startTime: "10:00",
      ...patch,
    });
    const bookings = () =>
      q("SELECT * FROM bookings WHERE merchant_id=?", [owner.merchantId]);
    const agreements = () =>
      q(
        "SELECT * FROM conversation_booking_agreements WHERE merchant_id=? ORDER BY id",
        [owner.merchantId]
      );
    const incoming = async (content = "نعم") => ({
      ...source,
      incomingMessageId: (
        await q(
          "INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",
          [source.conversationId, content]
        )
      ).insertId,
    });
    async function deliver(quote: any, accepted = true, id = source) {
      const plan = buildReplyPlan({
        ...id,
        instanceId: 1,
        providerAccount: "fixture",
        eventId: String(id.incomingMessageId),
        to: id.customerPhone,
        text: quote.text,
      });
      await stageInteraction(plan);
      if (accepted) await finishInteractionDelivery(plan, true);
      return plan;
    }
    async function offer(accepted = true) {
      const quote = await prepareBookingAgreement(source, selection());
      await deliver(quote, accepted);
      return quote as { agreementId: number; text: string };
    }
    beforeEach(async () => {
      vi.mocked(callGPT4).mockReset();
      owner = await createDisposableMerchant("booking-consent");
      other = await createDisposableMerchant("other-consent");
      const c = await q(
        "INSERT INTO conversations (merchantId,customerPhone,customerName,status) VALUES (?,?,'Customer','active')",
        [owner.merchantId, phone]
      );
      const m = await q(
        "INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','أريد موعد استشارة')",
        [c.insertId]
      );
      source = {
        merchantId: owner.merchantId,
        conversationId: c.insertId,
        incomingMessageId: m.insertId,
        customerPhone: phone,
      };
      serviceId = (
        await q(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price,advance_booking_days) VALUES (?,'استشارة',60,12500,30)",
          [owner.merchantId]
        )
      ).insertId;
      staffId = (
        await q(
          "INSERT INTO staff_members (merchant_id,name) VALUES (?,'سارة')",
          [owner.merchantId]
        )
      ).insertId;
      slotId = (
        await q(
          "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,'10:00','11:00')",
          [owner.merchantId, serviceId, date]
        )
      ).insertId;
    });
    afterEach(async () => {
      for (const child of children) if (child.exitCode === null) child.kill();
      children = [];
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    async function accepted() {
      const quote = await offer(),
        consent = await incoming();
      const result = await acceptBookingAgreement(consent, quote.agreementId);
      if (result.kind !== "booking" || !("bookingId" in result))
        throw Error("fixture booking");
      await q(
        "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,'12:00','13:00')",
        [owner.merchantId, serviceId, date]
      );
      return { bookingId: result.bookingId, quote, consent };
    }
    async function amendment(
      bookingId: number,
      patch: any = {},
      delivered = true
    ) {
      const request = await incoming(`عدل الحجز #${bookingId} للساعة 12:00`);
      const quote = await prepareBookingAmendment(
        request,
        selection({ startTime: "12:00", ...patch }),
        bookingId
      );
      if (!("agreementId" in quote)) throw Error("fixture proposal");
      if (delivered) await deliver(quote, true, request);
      return { request, quote };
    }
    const sameBooking = async (id: number, time = "10:00") => {
      const rows = await bookings();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        start_time: time,
        payment_status: "unpaid",
      });
    };
    it("holds the old slot while proposing a complete amendment and then moves the same booking", async () => {
      const { bookingId } = await accepted(),
        old = (await agreements())[0];
      const { quote } = await amendment(bookingId);
      expect(quote.text).toContain("10:00–11:00");
      expect(quote.text).toContain("12:00–13:00");
      expect(quote.text).toContain("١٢٥");
      await sameBooking(bookingId);
      const request = await incoming("أريد حجز جديد الساعة 10:00");
      await expect(
        prepareBookingAgreement(request, selection())
      ).rejects.toThrow();
      // The failed competing proposal did not replace the last delivered amendment.
      const consent = await incoming();
      expect(
        (await acceptBookingAgreement(consent, quote.agreementId!)).text
      ).toContain("تم تعديل الحجز");
      await sameBooking(bookingId, "12:00");
      const rows = await agreements();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(old);
      expect(rows[1]).toMatchObject({
        target_booking_id: bookingId,
        prior_agreement_id: old.id,
        booking_reference: bookingId,
        state: "accepted",
      });
      expect((await bookings())[0].customer_agreement_id).toBe(
        quote.agreementId
      );
      const freed = await incoming("أريد حجز جديد الساعة 10:00");
      expect((await prepareBookingAgreement(freed, selection())).kind).toBe(
        "offer"
      );
    });
    it.each(["لا", "لا شكرا", "لا تحجز", "غير موافق", "no thanks"])(
      "declining %s keeps the original booking",
      async text => {
        const { bookingId } = await accepted(),
          { quote } = await amendment(bookingId);
        expect(
          (
            await acceptBookingAgreement(
              await incoming(text),
              quote.agreementId!
            )
          ).kind
        ).toBe("declined");
        await sameBooking(bookingId);
        expect((await agreements())[1].state).toBe("declined");
      }
    );
    it.each([
      "نعم بس الساعة 11",
      "كم السعر؟",
      "yes but tomorrow",
      "تمام غير الموظف",
    ])("does not accept conditional or ambiguous consent %s", async text => {
      const { bookingId } = await accepted(),
        { quote } = await amendment(bookingId);
      expect(
        (await acceptBookingAgreement(await incoming(text), quote.agreementId!))
          .kind
      ).toBe("clarify");
      await sameBooking(bookingId);
    });
    it("requires delivery and unexpired latest proposal", async () => {
      const { bookingId } = await accepted(),
        { quote, request } = await amendment(bookingId, {}, false);
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId!))
          .kind
      ).toBe("clarify");
      await deliver(quote, true, request);
      await q(
        "UPDATE conversation_booking_agreements SET expires_at=TIMESTAMPADD(MINUTE,-1,UTC_TIMESTAMP()) WHERE id=?",
        [quote.agreementId]
      );
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId!))
          .kind
      ).toBe("clarify");
      await sameBooking(bookingId);
    });
    it.each([
      "status='cancelled'",
      "status='completed'",
      "status='in_progress'",
      "status='no_show'",
      "payment_status='paid'",
      "payment_status='refunded'",
      "google_event_id='external'",
      "customer_agreement_id=NULL",
      "final_price=1",
      "discount_amount=1",
    ])("rejects an ineligible existing booking: %s", async patch => {
      const { bookingId } = await accepted();
      await q(`UPDATE bookings SET ${patch} WHERE id=?`, [bookingId]);
      await expect(amendment(bookingId)).rejects.toThrow();
      expect(await agreements()).toHaveLength(1);
    });
    it.each([
      "status='confirmed',confirmed_at=UTC_TIMESTAMP()",
      "notes='staff changed instructions'",
      "payment_status='paid'",
      "google_event_id='external'",
      "final_price=15000",
      "customer_agreement_id=NULL",
    ])(
      "expires stale amendment if booking changes after proposal: %s",
      async patch => {
        const { bookingId } = await accepted(),
          { quote } = await amendment(bookingId);
        await q(`UPDATE bookings SET ${patch} WHERE id=?`, [bookingId]);
        expect(
          (await acceptBookingAgreement(await incoming(), quote.agreementId!))
            .kind
        ).toBe("changed");
        expect((await bookings())[0].start_time).toBe("10:00");
        expect((await agreements())[1].state).toBe("expired");
      }
    );
    it.each(["links", "payments"])(
      "blocks financial %s added before or after proposal",
      async type => {
        const { bookingId } = await accepted(),
          { quote } = await amendment(bookingId);
        if (type === "links")
          await q(
            "INSERT INTO payment_links (merchant_id,booking_id,link_id,title,amount,currency,tap_payment_url) VALUES (?,?,?,'fixture',12500,'SAR','https://example.test/pay')",
            [owner.merchantId, bookingId, randomUUID()]
          );
        else
          await q(
            "INSERT INTO order_payments (merchant_id,booking_id,customer_phone,amount,currency,status) VALUES (?,?,?,12500,'SAR','pending')",
            [owner.merchantId, bookingId, phone]
          );
        expect(
          (await acceptBookingAgreement(await incoming(), quote.agreementId!))
            .kind
        ).toBe("changed");
        await expect(amendment(bookingId)).rejects.toThrow();
        await sameBooking(bookingId);
      }
    );
    it("does not count the moving booking against the same-day capacity limit", async () => {
      const { bookingId } = await accepted();
      await q("UPDATE services SET max_bookings_per_day=1 WHERE id=?", [
        serviceId,
      ]);
      const { quote } = await amendment(bookingId);
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId!))
          .kind
      ).toBe("booking");
      await sameBooking(bookingId, "12:00");
    });
    it("quotes new catalogue prices explicitly but expires a price change after the offer", async () => {
      const { bookingId } = await accepted();
      await q("UPDATE services SET base_price=15000 WHERE id=?", [serviceId]);
      const first = await amendment(bookingId);
      expect(first.quote.text).toContain("١٥٠");
      await q("UPDATE services SET base_price=17000 WHERE id=?", [serviceId]);
      expect(
        (
          await acceptBookingAgreement(
            await incoming(),
            first.quote.agreementId!
          )
        ).kind
      ).toBe("changed");
      await sameBooking(bookingId);
      const next = await amendment(bookingId);
      expect(next.quote.text).toContain("١٧٠");
      await acceptBookingAgreement(await incoming(), next.quote.agreementId!);
      expect((await bookings())[0]).toMatchObject({
        final_price: 17000,
        base_price: 17000,
        start_time: "12:00",
      });
    });
    it("requires fresh staff review after changing a confirmed booking", async () => {
      const { bookingId } = await accepted(),
        old = await getBookingConsentReview(owner.merchantId, bookingId);
      const attestation = {
        agreementId: old.agreementId!,
        evidence: old.evidence!,
        reviewed: true as const,
      };
      await updateBookingOperation(owner.merchantId, owner.userId, {
        bookingId,
        operationId: randomUUID(),
        expectedStatus: "pending",
        status: "confirmed",
        consentReview: attestation,
      });
      const { quote } = await amendment(bookingId);
      await acceptBookingAgreement(await incoming(), quote.agreementId!);
      expect((await bookings())[0]).toMatchObject({
        status: "pending",
        confirmed_at: null,
      });
      await expect(
        updateBookingOperation(owner.merchantId, owner.userId, {
          bookingId,
          operationId: randomUUID(),
          expectedStatus: "pending",
          status: "confirmed",
          consentReview: attestation,
        })
      ).rejects.toThrow();
      const fresh = await getBookingConsentReview(owner.merchantId, bookingId);
      expect(fresh).toMatchObject({
        state: "ready",
        agreementId: quote.agreementId,
        terms: { startTime: "12:00" },
      });
      expect(fresh.offerText).toContain("ملخص تعديل الحجز");
      await updateBookingOperation(owner.merchantId, owner.userId, {
        bookingId,
        operationId: randomUUID(),
        expectedStatus: "pending",
        status: "confirmed",
        consentReview: {
          agreementId: fresh.agreementId!,
          evidence: fresh.evidence!,
          reviewed: true,
        },
      });
      expect((await bookings())[0].status).toBe("confirmed");
    });
    it("keeps all accepted revisions and never undoes changes on an old agreement replay", async () => {
      const { bookingId, quote: old } = await accepted(),
        first = await amendment(bookingId);
      await acceptBookingAgreement(await incoming(), first.quote.agreementId!);
      const second = await amendment(bookingId, { startTime: "10:00" });
      await acceptBookingAgreement(await incoming(), second.quote.agreementId!);
      expect(
        (await agreements()).filter((r: any) => r.state === "accepted")
      ).toHaveLength(3);
      await acceptBookingAgreement(await incoming(), old.agreementId);
      await sameBooking(bookingId);
      expect(
        (await getBookingConsentReview(owner.merchantId, bookingId)).agreementId
      ).toBe(second.quote.agreementId);
    });
    it("reuses one source and prevents cross-mode reuse and no-op amendments", async () => {
      const { bookingId } = await accepted(),
        { request, quote } = await amendment(bookingId);
      expect(
        (
          await prepareBookingAmendment(
            request,
            selection({ startTime: "13:00" }),
            bookingId
          )
        ).text
      ).toBe(quote.text);
      await expect(
        prepareBookingAgreement(request, selection())
      ).rejects.toThrow();
      await expect(
        amendment(bookingId, { startTime: "10:00" })
      ).rejects.toThrow();
      expect(await agreements()).toHaveLength(2);
    });
    it.each(["merchant", "phone", "conversation", "target", "instruction"])(
      "rejects forged amendment %s",
      async part => {
        const { bookingId } = await accepted();
        let request = await incoming(
          part === "instruction" ? "مرحبا" : `عدل الحجز #${bookingId}`
        );
        if (part === "merchant")
          request = { ...request, merchantId: other.merchantId };
        if (part === "phone")
          request = { ...request, customerPhone: "966500000000" };
        if (part === "conversation")
          request = {
            ...request,
            conversationId: request.conversationId + 99999,
          };
        await expect(
          prepareBookingAmendment(
            request,
            selection({ startTime: "12:00" }),
            part === "target" ? bookingId + 99999 : bookingId
          )
        ).rejects.toThrow();
        await sameBooking(bookingId);
        expect(await agreements()).toHaveLength(1);
      }
    );
    it("cannot turn an amendment instruction into new booking creation", async () => {
      const { bookingId } = await accepted(),
        request = await incoming(`عدل الحجز #${bookingId}`);
      await expect(
        prepareBookingAgreement(request, selection({ startTime: "12:00" }))
      ).rejects.toThrow();
      await sameBooking(bookingId);
    });
    it.each([
      "before_snapshot=JSON_OBJECT()",
      "before_hash=REPEAT('a',64)",
      "prior_agreement_id=999999",
      "target_booking_id=999999",
    ])("rejects tampered amendment binding: %s", async patch => {
      const { bookingId } = await accepted(),
        { quote } = await amendment(bookingId);
      await q(
        `UPDATE conversation_booking_agreements SET ${patch} WHERE id=?`,
        [quote.agreementId]
      );
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId!))
          .kind
      ).toBe("changed");
      await sameBooking(bookingId);
    });
    it.each(["rollback", "lost-ack"])(
      "recovers safely from %s at the atomic effect boundary",
      async failure => {
        const { bookingId } = await accepted(),
          { quote } = await amendment(bookingId),
          consent = await incoming();
        const pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        let reached = false;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await original(), {
              get(target, key) {
                if (key === "commit" && failure === "lost-ack")
                  return async () => {
                    reached = true;
                    await target.commit();
                    throw Error("lost ack");
                  };
                if (key === "execute" && failure === "rollback")
                  return async (sql: string, args: any[]) => {
                    if (sql.includes("SET state='accepted'")) {
                      reached = true;
                      throw Error("failed consent write");
                    }
                    return target.execute(sql, args);
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
        );
        await expect(
          acceptBookingAgreement(consent, quote.agreementId!)
        ).rejects.toThrow();
        spy.mockRestore();
        expect(reached).toBe(true);
        await sameBooking(
          bookingId,
          failure === "rollback" ? "10:00" : "12:00"
        );
        expect(
          (await acceptBookingAgreement(consent, quote.agreementId!)).kind
        ).toBe("booking");
        await sameBooking(bookingId, "12:00");
        expect(await agreements()).toHaveLength(2);
      }
    );
    it("uses actual conversation context across an incomplete amendment and consent", async () => {
      const { bookingId } = await accepted();
      vi.mocked(callGPT4)
        .mockResolvedValueOnce(JSON.stringify(selection({ startTime: null })))
        .mockResolvedValueOnce(
          JSON.stringify(selection({ startTime: "12:00" }))
        );
      const request = await incoming(`عدل الحجز #${bookingId}`);
      const text = await handleBookingConversation({
        ...request,
        message: "caller spoof",
      });
      expect(text).toContain(`[BT-${bookingId}]`);
      await deliver({ text }, true, request);
      const follow = await incoming("الساعة 12:00");
      const offerText = await handleBookingConversation({
        ...follow,
        message: "caller spoof",
      });
      expect(offerText).toContain("ملخص تعديل الحجز");
      await deliver({ text: offerText }, true, follow);
      const consent = await incoming();
      expect(
        await handleBookingConversation({ ...consent, message: "spoof" })
      ).toContain("تم تعديل الحجز");
      await sameBooking(bookingId, "12:00");
      expect(callGPT4).toHaveBeenCalledTimes(2);
      const context = JSON.parse(
        vi.mocked(callGPT4).mock.calls[1][0][1].content as string
      );
      expect(context.currentBooking).toMatchObject({
        serviceId,
        startTime: "10:00",
      });
      expect(context.currentBooking).not.toHaveProperty("id");
    });
    it("requires explicit choice between multiple owned bookings and rejects foreign identifiers", async () => {
      const { bookingId } = await accepted();
      const next = await incoming("أريد حجز جديد الساعة 12:00"),
        quote = await prepareBookingAgreement(
          next,
          selection({ startTime: "12:00" })
        );
      await deliver(quote, true, next);
      await acceptBookingAgreement(await incoming(), quote.agreementId!);
      for (const text of [
        "عدل موعدي",
        "عدل الحجز #999999",
        `عدل الحجز #${bookingId} والحجز #999999`,
      ]) {
        const request = await incoming(text);
        expect(
          await handleBookingConversation({ ...request, message: text })
        ).toContain("اذكر رقم الحجز");
      }
      expect(callGPT4).not.toHaveBeenCalled();
      expect(await bookings()).toHaveLength(2);
    });
    it.each([
      "عدل الحجز رقم",
      "أريد تأجيل الحجز #",
      "change appointment #",
      "reschedule booking #",
      "غير الموعد #",
    ])(
      "resolves the owned target from %s with Arabic numerals",
      async prefix => {
        const { bookingId } = await accepted(),
          request = await incoming(
            `${prefix}${String(bookingId).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)])} الساعة 12:00`
          );
        expect(
          (
            await prepareBookingAmendment(
              request,
              selection({ startTime: "12:00" }),
              bookingId
            )
          ).kind
        ).toBe("offer");
        await sameBooking(bookingId);
      }
    );
    it("does not trust a caller-injected amendment instruction or model-supplied target", async () => {
      const { bookingId } = await accepted();
      const unrelated = await incoming("مرحبا");
      expect(
        await handleBookingConversation({
          ...unrelated,
          message: `عدل الحجز #${bookingId}`,
        })
      ).toBeNull();
      const request = await incoming(`عدل الحجز #${bookingId}`);
      vi.mocked(callGPT4).mockResolvedValue(
        JSON.stringify({
          ...selection({ startTime: "12:00" }),
          bookingId: 999999,
        })
      );
      expect(
        await handleBookingConversation({ ...request, message: "ignored" })
      ).toContain(`[BT-${bookingId}]`);
      expect(await agreements()).toHaveLength(1);
      await sameBooking(bookingId);
    });
    it("serializes two customers moving toward the same slot without losing either original commitment", async () => {
      const { bookingId } = await accepted();
      await q(
        "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,'14:00','15:00')",
        [owner.merchantId, serviceId, date]
      );
      const saved = source;
      const conv = (
        await q(
          "INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000086','active')",
          [owner.merchantId]
        )
      ).insertId;
      source = {
        ...source,
        conversationId: conv,
        customerPhone: "966500000086",
      };
      source = await incoming("أريد حجز الساعة 14:00");
      const original = await prepareBookingAgreement(
        source,
        selection({ startTime: "14:00" })
      );
      await deliver(original);
      const second = await acceptBookingAgreement(
        await incoming(),
        original.agreementId!
      );
      const secondId = second.bookingId!;
      const secondProposal = await amendment(secondId);
      const secondConsent = await incoming();
      source = saved;
      const firstProposal = await amendment(bookingId);
      const firstConsent = await incoming();
      const results = await Promise.all([
        acceptBookingAgreement(firstConsent, firstProposal.quote.agreementId!),
        acceptBookingAgreement(
          secondConsent,
          secondProposal.quote.agreementId!
        ),
      ]);
      expect(results.filter(r => r.kind === "booking")).toHaveLength(1);
      expect(results.filter(r => r.kind === "changed")).toHaveLength(1);
      const rows = await bookings();
      expect(rows).toHaveLength(2);
      expect(rows.filter((b: any) => b.start_time === "12:00")).toHaveLength(1);
      expect(
        rows.filter((b: any) => ["10:00", "14:00"].includes(b.start_time))
      ).toHaveLength(1);
    });
    it("applies one revision across three independent worker processes", async () => {
      const { bookingId } = await accepted(),
        { quote } = await amendment(bookingId),
        consent = await incoming();
      const start = () => {
        const child = fork(
          resolve("server/tests/helpers/booking-agreement-child.ts"),
          [JSON.stringify({ input: consent, agreementId: quote.agreementId })],
          {
            execArgv: ["--import", "tsx"],
            stdio: ["ignore", "ignore", "pipe", "ipc"],
            windowsHide: true,
          }
        );
        children.push(child);
        return new Promise<any>((accept, reject) => {
          let result: any;
          const timer = setTimeout(
            () => reject(Error("worker timeout")),
            20000
          );
          child.on("message", (event: any) => {
            if (event.phase === "ready") child.send("run");
            if (event.phase === "done") result = event;
          });
          child.once("exit", code => {
            clearTimeout(timer);
            if (code !== 0 || !result) reject(Error("worker failed"));
            else accept(result);
          });
          child.once("error", error => {
            clearTimeout(timer);
            reject(error);
          });
        });
      };
      const results = await Promise.all([start(), start(), start()]);
      expect(
        results.every(
          r => r.ok && r.kind === "booking" && r.bookingId === bookingId
        )
      ).toBe(true);
      await sameBooking(bookingId, "12:00");
      expect(await agreements()).toHaveLength(2);
    }, 30000);
    it.each(["bookings", "appointments"])(
      "checks new-slot contention against %s before moving",
      async ledger => {
        const { bookingId } = await accepted(),
          { quote } = await amendment(bookingId);
        if (ledger === "appointments")
          await q(
            "INSERT INTO appointments (merchant_id,service_id,customer_phone,appointment_date,start_time,end_time,status) VALUES (?,?,?,?,'12:00','13:00','confirmed')",
            [owner.merchantId, serviceId, phone, date]
          );
        else
          await q(
            "INSERT INTO bookings (merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price) VALUES (?,?,?,?,'12:00','13:00',60,12500,12500)",
            [owner.merchantId, serviceId, "966500000086", date]
          );
        expect(
          (await acceptBookingAgreement(await incoming(), quote.agreementId!))
            .kind
        ).toBe("changed");
        expect(
          (await bookings()).find((b: any) => b.id === bookingId).start_time
        ).toBe("10:00");
      }
    );
    it("changes staff only with a matching configured slot and renewed consent", async () => {
      const { bookingId } = await accepted();
      await q(
        "INSERT INTO booking_time_slots (merchant_id,service_id,staff_id,slot_date,start_time,end_time) VALUES (?,?,?,?,'12:00','13:00')",
        [owner.merchantId, serviceId, staffId, date]
      );
      const { quote } = await amendment(bookingId, { staffId });
      expect(quote.text).toContain("سارة");
      await acceptBookingAgreement(await incoming(), quote.agreementId!);
      expect((await bookings())[0]).toMatchObject({
        staff_id: staffId,
        start_time: "12:00",
      });
    });
    it("expires the proposal when target-slot configuration becomes unavailable", async () => {
      const { bookingId } = await accepted(),
        { quote } = await amendment(bookingId);
      await q(
        "UPDATE booking_time_slots SET is_blocked=1 WHERE merchant_id=? AND start_time='12:00'",
        [owner.merchantId]
      );
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId!))
          .kind
      ).toBe("changed");
      await sameBooking(bookingId);
    });
    it("rolls back on storage faults instead of treating them as changed availability", async () => {
      const { bookingId } = await accepted(),
        { quote } = await amendment(bookingId),
        consent = await incoming();
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, key) {
              if (key === "execute")
                return async (sql: string, args: any[]) => {
                  if (sql.includes("SELECT * FROM services"))
                    throw Error("storage failure");
                  return target.execute(sql, args);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      await expect(
        acceptBookingAgreement(consent, quote.agreementId!)
      ).rejects.toThrow("storage failure");
      spy.mockRestore();
      expect((await agreements())[1].state).toBe("proposed");
      await sameBooking(bookingId);
    });
    it("checks worker ownership immediately before moving the booking", async () => {
      const { bookingId } = await accepted(),
        { quote } = await amendment(bookingId),
        consent = await incoming();
      const ctx: InboundExecution = {
        id: 1,
        merchantId: owner.merchantId,
        instanceId: 1,
        token: "fixture",
        eventKey: "fixture",
        partitionKey: "fixture",
        sendOrdinal: 0,
        assertOwned: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValue(Error("lease lost")),
      };
      await expect(
        withInboundExecution(ctx, () =>
          acceptBookingAgreement(consent, quote.agreementId!)
        )
      ).rejects.toThrow("lease lost");
      await sameBooking(bookingId);
      expect((await agreements())[1].state).toBe("proposed");
    });
    it("keeps failed payment attempts fenced even when their link no longer points at the booking", async () => {
      const { bookingId } = await accepted(),
        { quote } = await amendment(bookingId);
      const link = (
        await q(
          "INSERT INTO payment_links (merchant_id,link_id,title,amount,currency,tap_payment_url) VALUES (?,?,'fixture',12500,'SAR','https://example.test/pay')",
          [owner.merchantId, randomUUID()]
        )
      ).insertId;
      await q(
        "INSERT INTO booking_checkout_attempts (id,merchant_id,booking_id,payment_link_id,request_id,request_hash,provider_reference,amount_minor,currency,state) VALUES (?,?,?,?,?,?,?,12500,'SAR','failed')",
        [
          randomUUID(),
          owner.merchantId,
          bookingId,
          link,
          randomUUID(),
          "a".repeat(64),
          randomUUID(),
        ]
      );
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId!))
          .kind
      ).toBe("changed");
      await expect(amendment(bookingId)).rejects.toThrow();
      await sameBooking(bookingId);
    });
    it("preserves original price on rejected service substitution", async () => {
      const { bookingId } = await accepted();
      const otherService = (
        await q(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'other',60,100)",
          [owner.merchantId]
        )
      ).insertId;
      await expect(
        amendment(bookingId, { serviceId: otherService })
      ).rejects.toThrow();
      await sameBooking(bookingId);
      expect((await bookings())[0].final_price).toBe(12500);
    });
    it.each(["human_takeover=1", "automation_after_message_id=2147483647"])(
      "honors human authority after proposing: %s",
      async patch => {
        const { bookingId } = await accepted(),
          { quote } = await amendment(bookingId);
        await q(`UPDATE conversations SET ${patch} WHERE id=?`, [
          source.conversationId,
        ]);
        await expect(
          acceptBookingAgreement(await incoming(), quote.agreementId!)
        ).rejects.toThrow();
        await sameBooking(bookingId);
      }
    );
    it("does not recreate deleted bookings or accept superseded proposals", async () => {
      const { bookingId } = await accepted(),
        first = await amendment(bookingId),
        second = await amendment(bookingId);
      expect(
        (
          await acceptBookingAgreement(
            await incoming(),
            first.quote.agreementId!
          )
        ).kind
      ).toBe("clarify");
      await acceptBookingAgreement(await incoming(), second.quote.agreementId!);
      await q("DELETE FROM bookings WHERE id=?", [bookingId]);
      expect(
        (
          await acceptBookingAgreement(
            await incoming(),
            second.quote.agreementId!
          )
        ).text
      ).toContain("لن أنشئ طلبًا مكررًا");
      expect(await bookings()).toHaveLength(0);
    });
  }
);
