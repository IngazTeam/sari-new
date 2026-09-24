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
  "persisted conversation booking consent",
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
    it("runs the actual conversation adapter from extraction through delivered offer and persisted assent", async () => {
      vi.mocked(callGPT4).mockResolvedValue(JSON.stringify(selection()));
      const text = await handleBookingConversation({
        ...source,
        message: "untrusted caller text",
      });
      expect(text).toContain("ملخص طلب حجزك");
      expect(await bookings()).toHaveLength(0);
      await deliver({ text });
      const consent = await incoming();
      expect(
        await handleBookingConversation({ ...consent, message: "نعم" })
      ).toContain("تم تسجيل طلب حجزك");
      expect(
        await handleBookingConversation({ ...consent, message: "نعم" })
      ).toContain("حالته الحالية");
      expect(await bookings()).toHaveLength(1);
      expect(callGPT4).toHaveBeenCalledOnce();
    });
    it("continues missing details from a delivered clarification without requiring another booking keyword", async () => {
      vi.mocked(callGPT4)
        .mockResolvedValueOnce(
          JSON.stringify({ ...selection(), startTime: null })
        )
        .mockResolvedValueOnce(JSON.stringify(selection()));
      const text = await handleBookingConversation({
        ...source,
        message: "أريد موعد",
      });
      expect(text).toContain("حدد الخدمة");
      await deliver({ text });
      const next = await incoming("الساعة 10:00");
      expect(
        await handleBookingConversation({ ...next, message: "الساعة 10:00" })
      ).toContain("ملخص طلب حجزك");
      expect(await bookings()).toHaveLength(0);
      expect(callGPT4).toHaveBeenCalledTimes(2);
    });
    it("creates one booking when independent processes accept the same message", async () => {
      const quote = await offer(),
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
      expect(results.every(r => r.ok && r.kind === "booking")).toBe(true);
      expect(new Set(results.map(r => r.bookingId)).size).toBe(1);
      expect(await bookings()).toHaveLength(1);
    }, 30000);
    it("resolves two customers consenting to the same slot without overbooking", async () => {
      const first = await offer();
      const conv = (
        await q(
          "INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000086','active')",
          [owner.merchantId]
        )
      ).insertId;
      const msg = (
        await q(
          "INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','أريد موعد')",
          [conv]
        )
      ).insertId;
      const secondSource = {
        ...source,
        conversationId: conv,
        customerPhone: "966500000086",
        incomingMessageId: msg,
      };
      const second = await prepareBookingAgreement(secondSource, selection());
      await deliver(second, true, secondSource);
      const firstConsent = await incoming(),
        secondConsent = {
          ...secondSource,
          incomingMessageId: (
            await q(
              "INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','نعم')",
              [conv]
            )
          ).insertId,
        };
      const results = await Promise.all([
        acceptBookingAgreement(firstConsent, first.agreementId),
        acceptBookingAgreement(secondConsent, second.agreementId!),
      ]);
      expect(results.filter(r => r.kind === "booking")).toHaveLength(1);
      expect(results.filter(r => r.kind === "changed")).toHaveLength(1);
      expect(await bookings()).toHaveLength(1);
    });
    it("persists the real service, configured time and minor price without creating a booking", async () => {
      const quote = await offer();
      expect(await bookings()).toHaveLength(0);
      expect(quote.text).toContain("بتوقيت الرياض");
      expect(quote.text).toContain("بانتظار تأكيد النشاط");
      const row = (await agreements())[0],
        snapshot =
          typeof row.snapshot === "string"
            ? JSON.parse(row.snapshot)
            : row.snapshot;
      expect(snapshot).toMatchObject({
        priceMinor: 12500,
        durationMinutes: 60,
        startTime: "10:00",
        endTime: "11:00",
        slotId,
      });
      expect(row.consent_message_id).toBeNull();
      expect(row.booking_reference).toBeNull();
    });
    it("reuses the original offer for an identical source instead of creating another proposal", async () => {
      const first = await offer(),
        second = await prepareBookingAgreement(
          source,
          selection({ startTime: "12:00" })
        );
      expect(second.text).toBe(first.text);
      expect(await agreements()).toHaveLength(1);
    });
    it("atomically creates exactly one pending unpaid booking for concurrent assent and replay", async () => {
      const quote = await offer(),
        consent = await incoming();
      const results = await Promise.all([
        acceptBookingAgreement(consent, quote.agreementId),
        acceptBookingAgreement(consent, quote.agreementId),
      ]);
      expect(results.every(r => r.kind === "booking")).toBe(true);
      expect(await bookings()).toHaveLength(1);
      const b = (await bookings())[0];
      expect(b).toMatchObject({
        status: "pending",
        payment_status: "unpaid",
        base_price: 12500,
        final_price: 12500,
        booking_source: "whatsapp",
        customer_phone: phone,
        start_time: "10:00",
        end_time: "11:00",
      });
      expect((await agreements())[0]).toMatchObject({
        consent_message_id: consent.incomingMessageId,
        booking_reference: b.id,
        state: "accepted",
      });
      expect(
        (await acceptBookingAgreement(consent, quote.agreementId)).text
      ).toContain("حالته الحالية");
      expect(await bookings()).toHaveLength(1);
    });
    it.each(["لا", "غير موافق", "لا تحجز", "don't book"])(
      "declines %s without creating an effect",
      async message => {
        const quote = await offer();
        expect(
          (
            await acceptBookingAgreement(
              await incoming(message),
              quote.agreementId
            )
          ).kind
        ).toBe("declined");
        expect(await bookings()).toHaveLength(0);
        expect((await agreements())[0].state).toBe("declined");
      }
    );
    it.each([
      "نعم لكن الساعة 12",
      "هل السعر شامل؟",
      "تمام؟",
      "نعم غير الموظف",
      "yes if it is cheaper",
    ])("does not interpret %s as unconditional approval", async message => {
      const quote = await offer();
      expect(
        (
          await acceptBookingAgreement(
            await incoming(message),
            quote.agreementId
          )
        ).kind
      ).toBe("clarify");
      expect(await bookings()).toHaveLength(0);
    });
    it.each([
      "waiting_delivery",
      "suppressed",
      "text_changed",
      "newer_unsent",
      "human_reply",
    ])("requires a delivered unchanged latest offer: %s", async change => {
      const quote = await offer();
      if (change === "waiting_delivery" || change === "suppressed")
        await q(
          "UPDATE ai_interaction_jobs SET state=? WHERE incoming_message_id=?",
          [change, source.incomingMessageId]
        );
      if (change === "text_changed")
        await q(
          "UPDATE ai_interaction_jobs SET reply_text=CONCAT(reply_text,' تم تغيير السعر') WHERE incoming_message_id=?",
          [source.incomingMessageId]
        );
      if (change === "newer_unsent") {
        const next = await incoming("سؤال آخر");
        await deliver({ text: "هل تريد معلومات أخرى؟" }, false, next);
      }
      if (change === "human_reply")
        await q(
          "INSERT INTO messages (conversationId,direction,messageType,content,aiResponse) VALUES (?,'outgoing','text','سؤال الموظف',NULL)",
          [source.conversationId]
        );
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId)).kind
      ).toBe("clarify");
      expect(await bookings()).toHaveLength(0);
    });
    it("accepts the actual unchanged outgoing offer alongside its transport acknowledgment", async () => {
      const quote = await offer();
      await q(
        "INSERT INTO messages (conversationId,direction,messageType,content,aiResponse) VALUES (?,'outgoing','text',?,?)",
        [source.conversationId, quote.text, quote.text]
      );
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId)).kind
      ).toBe("booking");
    });
    it.each([
      "price",
      "duration",
      "name",
      "inactive",
      "slot_blocked",
      "slot_deleted",
      "counter",
      "buffer",
      "custom_price",
      "advance_window",
    ])("requires a new agreement when %s changes", async change => {
      const quote = await offer();
      const sql: Record<string, string> = {
        price: "UPDATE services SET base_price=20000 WHERE id=?",
        duration: "UPDATE services SET duration_minutes=90 WHERE id=?",
        name: "UPDATE services SET name='تعديل الخدمة' WHERE id=?",
        inactive: "UPDATE services SET is_active=0 WHERE id=?",
        buffer: "UPDATE services SET buffer_time_minutes=15 WHERE id=?",
        custom_price: "UPDATE services SET price_type='custom' WHERE id=?",
        advance_window: "UPDATE services SET advance_booking_days=0 WHERE id=?",
        slot_blocked: "UPDATE booking_time_slots SET is_blocked=1 WHERE id=?",
        slot_deleted: "DELETE FROM booking_time_slots WHERE id=?",
        counter: "UPDATE booking_time_slots SET current_bookings=1 WHERE id=?",
      };
      await q(sql[change], [
        change.startsWith("slot_") || change === "counter" ? slotId : serviceId,
      ]);
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId)).kind
      ).toBe("changed");
      expect(await bookings()).toHaveLength(0);
      expect((await agreements())[0].state).toBe("expired");
    });
    it("requires new consent after the selected staff becomes unavailable", async () => {
      await q("UPDATE booking_time_slots SET staff_id=? WHERE id=?", [
        staffId,
        slotId,
      ]);
      const quote = await prepareBookingAgreement(
        source,
        selection({ staffId })
      );
      await deliver(quote);
      await q("UPDATE staff_members SET is_active=0 WHERE id=?", [staffId]);
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId!))
          .kind
      ).toBe("changed");
      expect(await bookings()).toHaveLength(0);
    });
    it.each(["expiry", "superseded"])("rejects %s offers", async change => {
      const quote = await offer();
      if (change === "expiry")
        await q(
          "UPDATE conversation_booking_agreements SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE id=?",
          [quote.agreementId]
        );
      else {
        const next = await incoming("أريد نفس الموعد");
        const newer = await prepareBookingAgreement(next, selection());
        await deliver(newer, true, next);
      }
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId)).kind
      ).toBe("clarify");
      expect(await bookings()).toHaveLength(0);
    });
    it("checks live capacity in appointments before committing a consented booking", async () => {
      const quote = await offer();
      await q(
        "INSERT INTO appointments (merchant_id,service_id,customer_phone,appointment_date,start_time,end_time,status) VALUES (?,?,? ,?,'10:00','11:00','confirmed')",
        [owner.merchantId, serviceId, phone, date]
      );
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId)).kind
      ).toBe("changed");
      expect(await bookings()).toHaveLength(0);
    });
    it("enforces the daily limit across both ledgers", async () => {
      await q("UPDATE services SET max_bookings_per_day=1 WHERE id=?", [
        serviceId,
      ]);
      const quote = await offer();
      await q(
        "INSERT INTO appointments (merchant_id,service_id,customer_phone,appointment_date,start_time,end_time,status) VALUES (?,?,?,?,'12:00','13:00','confirmed')",
        [owner.merchantId, serviceId, phone, date]
      );
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId)).kind
      ).toBe("changed");
      expect(await bookings()).toHaveLength(0);
    });
    it.each([
      "merchant",
      "phone",
      "conversation",
      "outgoing_source",
      "superseded_source",
      "human_takeover",
      "handoff_cutoff",
    ])("rejects forged or stale source authority: %s", async change => {
      const quote = await offer(),
        consent = await incoming();
      if (change === "merchant") consent.merchantId = other.merchantId;
      if (change === "phone") consent.customerPhone = "966500000086";
      if (change === "conversation") consent.conversationId += 90000000;
      if (change === "outgoing_source")
        await q("UPDATE messages SET direction='outgoing' WHERE id=?", [
          consent.incomingMessageId,
        ]);
      if (change === "superseded_source") await incoming("غيرت رأيي");
      if (change === "human_takeover")
        await q("UPDATE conversations SET human_takeover=1 WHERE id=?", [
          source.conversationId,
        ]);
      if (change === "handoff_cutoff")
        await q(
          "UPDATE conversations SET automation_after_message_id=? WHERE id=?",
          [consent.incomingMessageId, source.conversationId]
        );
      await expect(
        acceptBookingAgreement(consent, quote.agreementId)
      ).rejects.toThrow();
      expect(await bookings()).toHaveLength(0);
    });
    it.each(["cancelled", "completed", "deleted"])(
      "replays current %s booking without reviving it",
      async state => {
        const quote = await offer(),
          consent = await incoming();
        await acceptBookingAgreement(consent, quote.agreementId);
        const b = (await bookings())[0];
        if (state === "deleted")
          await q("DELETE FROM bookings WHERE id=?", [b.id]);
        else await q("UPDATE bookings SET status=? WHERE id=?", [state, b.id]);
        expect(
          (await acceptBookingAgreement(consent, quote.agreementId)).kind
        ).toBe("booking");
        expect(await bookings()).toHaveLength(state === "deleted" ? 0 : 1);
      }
    );
    it("does not treat a later refusal as a completed cancellation", async () => {
      const quote = await offer();
      await acceptBookingAgreement(await incoming(), quote.agreementId);
      expect(
        (
          await acceptBookingAgreement(
            await incoming("لا تحجز"),
            quote.agreementId
          )
        ).text
      ).toContain("قبل تأكيد إلغائه");
      expect((await bookings())[0].status).toBe("pending");
    });
    it.each([
      { serviceId: 99999999 },
      { staffId: 99999999 },
      { bookingDate: "2000-01-01" },
      { startTime: "09:00" },
      { price: 1 },
      { bookingDate: "2026-02-30" },
    ])("rejects unavailable or injected proposal %j", async patch => {
      await expect(
        prepareBookingAgreement(source, selection(patch))
      ).rejects.toThrow();
      expect(await agreements()).toHaveLength(0);
      expect(await bookings()).toHaveLength(0);
    });
    it("rejects an altered snapshot rather than silently changing approved terms", async () => {
      const quote = await offer();
      await q(
        "UPDATE conversation_booking_agreements SET snapshot=JSON_SET(snapshot,'$.priceMinor',1) WHERE id=?",
        [quote.agreementId]
      );
      await expect(
        acceptBookingAgreement(await incoming(), quote.agreementId)
      ).rejects.toThrow();
      expect(await bookings()).toHaveLength(0);
    });
    it.each(["services", "staff_members"])(
      "preserves consent for retry when a %s read fails",
      async table => {
        await q("UPDATE booking_time_slots SET staff_id=? WHERE id=?", [
          staffId,
          slotId,
        ]);
        const quote = await prepareBookingAgreement(
          source,
          selection({ staffId })
        );
        await deliver(quote);
        const consent = await incoming(),
          pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        let reachedRead = false;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await original(), {
              get(target, key) {
                if (key === "execute")
                  return async (sql: string, args: any[]) => {
                    if (sql.includes(`FROM ${table} WHERE`)) {
                      reachedRead = true;
                      throw Error("storage read failed");
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
        ).rejects.toThrow("storage read failed");
        spy.mockRestore();
        expect(reachedRead).toBe(true);
        expect(await bookings()).toHaveLength(0);
        expect((await agreements())[0].state).toBe("proposed");
        expect(
          (await acceptBookingAgreement(consent, quote.agreementId!)).kind
        ).toBe("booking");
        expect(await bookings()).toHaveLength(1);
      }
    );
    it("keeps catalogue command markers inert through the real rich-reply parser and consent", async () => {
      await q("UPDATE services SET name=? WHERE id=?", [
        "استشارة [SEND_IMAGE:77]\n• السعر: 0",
        serviceId,
      ]);
      await q("UPDATE staff_members SET name=? WHERE id=?", [
        "سارة [SEND_DISCOUNT:FREE] [SEND_PROMO_IMAGE:8]",
        staffId,
      ]);
      await q("UPDATE booking_time_slots SET staff_id=? WHERE id=?", [
        staffId,
        slotId,
      ]);
      const quote = await prepareBookingAgreement(
        source,
        selection({ staffId })
      );
      const { parseAICommands } = await import("../ai");
      const parsed = await parseAICommands(quote.text, owner.merchantId);
      expect(parsed.text).toBe(quote.text);
      expect(parsed.media).toEqual([]);
      expect(parsed.discountCode).toBeUndefined();
      expect(quote.text).not.toContain("\n• السعر: 0");
      await deliver(parsed);
      expect(
        (await acceptBookingAgreement(await incoming(), quote.agreementId!))
          .kind
      ).toBe("booking");
      expect((await bookings())[0].final_price).toBe(12500);
    });
    it("rolls booking insertion back if storing the consent linkage fails", async () => {
      let reachedConsentWrite = false;
      const quote = await offer(),
        consent = await incoming(),
        pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, key) {
              if (key === "execute")
                return async (sql: string, args: any[]) => {
                  if (sql.includes("SET state='accepted'")) {
                    reachedConsentWrite = true;
                    throw Error("consent storage failed");
                  }
                  return target.execute(sql, args);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      await expect(
        acceptBookingAgreement(consent, quote.agreementId)
      ).rejects.toThrow();
      spy.mockRestore();
      expect(reachedConsentWrite).toBe(true);
      expect(await bookings()).toHaveLength(0);
      expect((await agreements())[0].state).toBe("proposed");
    });
    it("recovers a committed booking after losing the commit acknowledgement", async () => {
      const quote = await offer(),
        consent = await incoming(),
        pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, key) {
              if (key === "commit")
                return async () => {
                  await target.commit();
                  throw Error("lost ack");
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      await expect(
        acceptBookingAgreement(consent, quote.agreementId)
      ).rejects.toThrow();
      spy.mockRestore();
      expect(
        (await acceptBookingAgreement(consent, quote.agreementId)).kind
      ).toBe("booking");
      expect(await bookings()).toHaveLength(1);
    });
    it("checks worker ownership again immediately before the effect", async () => {
      const quote = await offer(),
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
          acceptBookingAgreement(consent, quote.agreementId)
        )
      ).rejects.toThrow();
      expect(ctx.assertOwned).toHaveBeenCalledTimes(2);
      expect(await bookings()).toHaveLength(0);
    });
    describe("operator review of persisted booking consent", () => {
      async function accepted() {
        const quote = await offer(),
          consent = await incoming();
        const result = await acceptBookingAgreement(consent, quote.agreementId);
        return { quote, consent, bookingId: result.bookingId! };
      }
      const confirmation = (bookingId: number, review: any) => ({
        bookingId,
        operationId: randomUUID(),
        expectedStatus: "pending" as const,
        status: "confirmed" as const,
        consentReview: {
          agreementId: review.agreementId,
          evidence: review.evidence,
          reviewed: true as const,
        },
      });
      it("shows exact approved terms and incoming messages without exposing raw records", async () => {
        const { bookingId, consent, quote } = await accepted();
        const result = await getBookingConsentReview(
          owner.merchantId,
          bookingId
        );
        expect(result.state).toBe("ready");
        expect(result.evidence).toMatch(/^[a-f0-9]{64}$/);
        expect(result.terms?.amountMinor).toBe(12500);
        expect(result.consent?.id).toBe(consent.incomingMessageId);
        expect(result.offerText).toBe(quote.text);
        expect(result.source?.id).toBe(source.incomingMessageId);
        expect(JSON.stringify(result)).not.toContain("customer_phone");
        expect((await bookings())[0].customer_agreement_id).toBe(
          quote.agreementId
        );
      });
      it("requires review and records its proof with actor and operational update atomically", async () => {
        const { bookingId } = await accepted(),
          review = await getBookingConsentReview(owner.merchantId, bookingId);
        const input = confirmation(bookingId, review);
        await expect(
          updateBookingOperation(owner.merchantId, owner.userId, {
            ...input,
            consentReview: undefined,
          })
        ).rejects.toThrow();
        expect((await bookings())[0].status).toBe("pending");
        expect(
          (await updateBookingOperation(owner.merchantId, owner.userId, input))
            .alreadyApplied
        ).toBe(false);
        expect((await bookings())[0].payment_status).toBe("unpaid");
        const history = await getBookingOperationHistory(
          owner.merchantId,
          bookingId
        );
        expect(history[0].consentReview).toEqual(input.consentReview);
        expect(history[0].actorUserId).toBe(owner.userId);
        await incoming("هل يمكن تذكيري؟");
        expect(
          (await updateBookingOperation(owner.merchantId, owner.userId, input))
            .alreadyApplied
        ).toBe(true);
        expect(
          await getBookingOperationHistory(owner.merchantId, bookingId)
        ).toHaveLength(1);
      });
      it.each([
        "wrong_evidence",
        "wrong_agreement",
        "terms",
        "source",
        "consent",
        "delivery",
        "service",
        "slot",
        "conversation",
        "agreement",
        "pointer",
        "foreign_pointer",
        "refusal_then_question",
        "long_source",
        "slot_counter",
        "buffer_policy",
        "snapshot_corrupt",
      ])("blocks confirmation with %s", async change => {
        const { bookingId, quote, consent } = await accepted(),
          review = await getBookingConsentReview(owner.merchantId, bookingId),
          input = confirmation(bookingId, review);
        if (change === "wrong_evidence")
          input.consentReview.evidence = "0".repeat(64);
        if (change === "wrong_agreement")
          input.consentReview.agreementId += 10000000;
        if (change === "terms")
          await q("UPDATE bookings SET final_price=1 WHERE id=?", [bookingId]);
        if (change === "source")
          await q("DELETE FROM messages WHERE id=?", [
            source.incomingMessageId,
          ]);
        if (change === "consent")
          await q("UPDATE messages SET content='لا تحجز' WHERE id=?", [
            consent.incomingMessageId,
          ]);
        if (change === "delivery")
          await q(
            "UPDATE ai_interaction_jobs SET state='suppressed' WHERE incoming_message_id=?",
            [source.incomingMessageId]
          );
        if (change === "service")
          await q("UPDATE services SET is_active=0 WHERE id=?", [serviceId]);
        if (change === "slot")
          await q("UPDATE booking_time_slots SET is_blocked=1 WHERE id=?", [
            slotId,
          ]);
        if (change === "slot_counter")
          await q(
            "UPDATE booking_time_slots SET current_bookings=1 WHERE id=?",
            [slotId]
          );
        if (change === "buffer_policy")
          await q("UPDATE services SET buffer_time_minutes=15 WHERE id=?", [
            serviceId,
          ]);
        if (change === "snapshot_corrupt")
          await q(
            "UPDATE conversation_booking_agreements SET snapshot=JSON_SET(snapshot,'$.priceMinor',1) WHERE id=?",
            [quote.agreementId]
          );
        if (change === "conversation")
          await q("DELETE FROM conversations WHERE id=?", [
            source.conversationId,
          ]);
        if (change === "agreement")
          await q("DELETE FROM conversation_booking_agreements WHERE id=?", [
            quote.agreementId,
          ]);
        if (change === "pointer")
          await q("UPDATE bookings SET customer_agreement_id=NULL WHERE id=?", [
            bookingId,
          ]);
        if (change === "foreign_pointer")
          await q(
            "UPDATE conversation_booking_agreements SET merchant_id=? WHERE id=?",
            [other.merchantId, quote.agreementId]
          );
        if (change === "refusal_then_question") {
          await incoming("لا تحجز");
          await incoming("ما ساعات العمل؟");
        }
        if (change === "long_source")
          await q("UPDATE messages SET content=? WHERE id=?", [
            "x".repeat(8001),
            source.incomingMessageId,
          ]);
        if (!change.startsWith("wrong_"))
          expect(
            (await getBookingConsentReview(owner.merchantId, bookingId)).state
          ).toBe("blocked");
        await expect(
          updateBookingOperation(owner.merchantId, owner.userId, input)
        ).rejects.toThrow();
        expect((await bookings())[0].status).toBe("pending");
        expect(
          await getBookingOperationHistory(owner.merchantId, bookingId)
        ).toHaveLength(0);
      });
      it("invalidates an attestation on a new message and permits explicit review of refreshed evidence", async () => {
        const { bookingId } = await accepted(),
          old = await getBookingConsentReview(owner.merchantId, bookingId);
        await incoming("هل توجد مواقف؟");
        const fresh = await getBookingConsentReview(
          owner.merchantId,
          bookingId
        );
        expect(fresh.state).toBe("ready");
        expect(fresh.evidence).not.toBe(old.evidence);
        await expect(
          updateBookingOperation(
            owner.merchantId,
            owner.userId,
            confirmation(bookingId, old)
          )
        ).rejects.toThrow();
        await updateBookingOperation(
          owner.merchantId,
          owner.userId,
          confirmation(bookingId, fresh)
        );
        expect((await bookings())[0].status).toBe("confirmed");
      });
      it.each([
        { bookingDate: "2026-12-28" },
        { startTime: "11:00", endTime: "12:00" },
      ])(
        "blocks changing approved schedule %j even with an attestation",
        async patch => {
          const { bookingId } = await accepted(),
            review = await getBookingConsentReview(owner.merchantId, bookingId);
          await expect(
            updateBookingOperation(owner.merchantId, owner.userId, {
              ...confirmation(bookingId, review),
              ...patch,
            })
          ).rejects.toThrow();
          expect((await bookings())[0].status).toBe("pending");
        }
      );
      it("retains cancellation when consent has become unavailable", async () => {
        const { bookingId, quote } = await accepted();
        await q("DELETE FROM conversation_booking_agreements WHERE id=?", [
          quote.agreementId,
        ]);
        await updateBookingOperation(owner.merchantId, owner.userId, {
          bookingId,
          operationId: randomUUID(),
          expectedStatus: "pending",
          status: "cancelled",
        });
        expect((await bookings())[0].status).toBe("cancelled");
      });
      it("rejects cross-tenant reads", async () => {
        const { bookingId } = await accepted();
        await expect(
          getBookingConsentReview(other.merchantId, bookingId)
        ).rejects.toThrow();
      });
      it("serializes concurrent confirmation and stores only one audit", async () => {
        const { bookingId } = await accepted(),
          review = await getBookingConsentReview(owner.merchantId, bookingId);
        const results = await Promise.allSettled(
          [
            confirmation(bookingId, review),
            confirmation(bookingId, review),
          ].map(input =>
            updateBookingOperation(owner.merchantId, owner.userId, input)
          )
        );
        expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
        expect(
          await getBookingOperationHistory(owner.merchantId, bookingId)
        ).toHaveLength(1);
      });
      it("rolls confirmation back if its audit cannot be stored", async () => {
        const { bookingId } = await accepted(),
          review = await getBookingConsentReview(owner.merchantId, bookingId);
        const pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        let reached = false;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await original(), {
              get(target, key) {
                if (key === "execute")
                  return async (sql: string, args: any[]) => {
                    if (sql.includes("INSERT INTO booking_operation_audits")) {
                      reached = true;
                      throw Error("audit failed");
                    }
                    return target.execute(sql, args);
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
        );
        await expect(
          updateBookingOperation(
            owner.merchantId,
            owner.userId,
            confirmation(bookingId, review)
          )
        ).rejects.toThrow();
        spy.mockRestore();
        expect(reached).toBe(true);
        expect((await bookings())[0].status).toBe("pending");
      });
      it("recovers a confirmed booking and its consent proof after losing commit acknowledgement", async () => {
        const { bookingId } = await accepted(),
          review = await getBookingConsentReview(owner.merchantId, bookingId),
          input = confirmation(bookingId, review);
        const pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await original(), {
              get(target, key) {
                if (key === "commit")
                  return async () => {
                    await target.commit();
                    throw Error("lost commit");
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
        );
        await expect(
          updateBookingOperation(owner.merchantId, owner.userId, input)
        ).rejects.toThrow();
        spy.mockRestore();
        expect(
          (await updateBookingOperation(owner.merchantId, owner.userId, input))
            .alreadyApplied
        ).toBe(true);
        expect(
          await getBookingOperationHistory(owner.merchantId, bookingId)
        ).toHaveLength(1);
      });
      it("changes the evidence when a booking note is edited without changing consent", async () => {
        const { bookingId } = await accepted(),
          review = await getBookingConsentReview(owner.merchantId, bookingId);
        await updateBookingOperation(owner.merchantId, owner.userId, {
          bookingId,
          operationId: randomUUID(),
          expectedStatus: "pending",
          notes: "Reviewed by staff",
        });
        const fresh = await getBookingConsentReview(
          owner.merchantId,
          bookingId
        );
        expect(fresh.evidence).not.toBe(review.evidence);
        expect(fresh.state).toBe("ready");
      });
    });
    it("fails closed when migration metadata is unavailable", async () => {
      vi.spyOn(readiness, "assertRuntimeSchema").mockRejectedValue(
        Error("missing migration")
      );
      await expect(
        prepareBookingAgreement(source, selection())
      ).rejects.toThrow();
      expect(await bookings()).toHaveLength(0);
    });
  }
);
