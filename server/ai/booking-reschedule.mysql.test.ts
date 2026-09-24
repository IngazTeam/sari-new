import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const provider = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  refresh: vi.fn(),
  free: vi.fn(),
  remove: vi.fn(),
  move: vi.fn(),
}));
vi.mock("../_core/googleCalendar", () => ({
  createCalendarEvent: provider.create,
  getCalendarEvent: provider.get,
  validateAndRefreshCredentials: provider.refresh,
  assertCalendarTimeFree: provider.free,
  deleteCalendarEventIfMatch: provider.remove,
  rescheduleCalendarEventIfMatch: provider.move,
}));
import {
  readBookingCalendarReview,
  synchronizeBookingCalendar,
} from "../booking-calendar";
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
const transport = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../channels/whatsapp/providers", () => ({
  getWhatsAppProvider: () => ({ send: transport.send }),
}));
import { enqueueInbound } from "../messaging/inbound-jobs";
import {
  dispatchBookingNotice,
  reconcileBookingNotice,
  runBookingNotificationBatch,
  bookingNoticeKey,
} from "../booking-reschedule-notification";
import { updateWhatsAppDeliveryStatus } from "../channels/whatsapp/service";
import { reviewBookingNotification } from "../booking-notification-review";
import type { CheckoutIdentity } from "./checkout-agreements";
import { getBookingCancellationReview } from "../booking-cancellation";
import {
  getBookingRescheduleReview,
  rescheduleBookingCalendar,
} from "../booking-reschedule";
import { createAtomicBooking } from "../booking-capacity";
import { readBookingSelectionSnapshot } from "./booking-agreements";
import { bookCalendarAppointment } from "../appointment-calendar";
import { issueCanonicalBookingPaymentLink } from "../payment/booking-checkout";
import {
  withBookingCapacityTransaction,
  hasBookingConflict,
} from "../booking-capacity";

describe.skipIf(!process.env.DATABASE_URL)(
  "booking calendar reschedule and recovery",
  () => {
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
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    let bookingId: number, integrationId: number;
    const links = () =>
      q(
        "SELECT * FROM booking_calendar_links WHERE merchant_id=? ORDER BY id",
        [owner.merchantId]
      );
    const reviews = () =>
      q(
        "SELECT * FROM booking_calendar_reviews WHERE merchant_id=? ORDER BY id",
        [owner.merchantId]
      );
    beforeEach(async () => {
      vi.mocked(provider.create).mockReset();
      vi.mocked(provider.get).mockReset();
      vi.mocked(provider.refresh).mockReset();
      provider.refresh.mockImplementation(
        async (credentials: any) => credentials
      );
      provider.free.mockReset().mockResolvedValue(undefined);
      provider.create.mockImplementation(
        async (_credentials: any, _calendar: string, data: any) => ({
          id: data.id,
          status: "confirmed",
          start: { dateTime: data.start.toISOString() },
          end: { dateTime: data.end.toISOString() },
          extendedProperties: { private: data.privateProperties },
        })
      );
      const quote = await offer(),
        consent = await incoming();
      bookingId = (await acceptBookingAgreement(consent, quote.agreementId))
        .bookingId!;
      const review = await getBookingConsentReview(owner.merchantId, bookingId);
      await updateBookingOperation(owner.merchantId, owner.userId, {
        bookingId,
        expectedStatus: "pending",
        operationId: randomUUID(),
        status: "confirmed",
        consentReview: {
          agreementId: review.agreementId!,
          evidence: review.evidence!,
          reviewed: true,
        },
      });
      integrationId = (
        await q(
          "INSERT INTO google_integrations (merchant_id,integration_type,credentials,calendar_id,is_active) VALUES (?,'calendar',?,'primary',1)",
          [
            owner.merchantId,
            JSON.stringify({
              access_token: "synthetic-access",
              refresh_token: "synthetic-refresh",
            }),
          ]
        )
      ).insertId;
    });
    const command = async (action: "create" | "verify" = "create") => ({
      bookingId,
      requestId: randomUUID(),
      evidence: (await readBookingCalendarReview(owner.merchantId, bookingId))
        .evidence,
      action,
      reviewed: true as const,
      reason: "Operator reviewed consent and calendar",
    });
    const run = async (action: "create" | "verify" = "create") =>
      synchronizeBookingCalendar(
        owner.merchantId,
        owner.userId,
        await command(action)
      );
    const active = async (patch: any = {}) => {
      const link = (await links())[0],
        p =
          typeof link.payload === "string"
            ? JSON.parse(link.payload)
            : link.payload;
      return {
        id: link.event_reference,
        status: "confirmed",
        start: { dateTime: `${p.date}T${p.startTime}:00+03:00` },
        end: { dateTime: `${p.date}T${p.endTime}:00+03:00` },
        extendedProperties: {
          private: {
            sariBooking: link.event_reference,
            sariAgreement: String(p.agreementId),
          },
        },
        ...patch,
      };
    };
    const moves = () =>
      q(
        "SELECT * FROM booking_calendar_reschedules WHERE merchant_id=? ORDER BY id",
        [owner.merchantId]
      );
    const read = () => getBookingRescheduleReview(owner.merchantId, bookingId);
    const moveCommand = async (
      action: "move" | "verify" | "abandon" = "move"
    ) => ({
      bookingId,
      requestId: randomUUID(),
      evidence: (await read())!.evidence,
      action,
      reviewed: true as const,
      reason: "Reviewed the new customer agreement and both calendar periods",
    });
    const moveRun = async (action: "move" | "verify" | "abandon" = "move") =>
      rescheduleBookingCalendar(
        owner.merchantId,
        owner.userId,
        await moveCommand(action)
      );
    async function pending() {
      const request = await incoming(
        `غير موعد الحجز #${bookingId} إلى الساعة 12`
      );
      const quote = await prepareBookingAmendment(
        request,
        selection({ startTime: "12:00" }),
        bookingId
      );
      await deliver(quote, true, request);
      const consent = await incoming();
      const accepted = await acceptBookingAgreement(
        consent,
        quote.agreementId!
      );
      return { request, quote, consent, accepted };
    }
    const conflict = (startTime: string) =>
      withBookingCapacityTransaction(owner.merchantId, c =>
        hasBookingConflict(c, owner.merchantId, {
          ...selection({ startTime }),
          staffId: undefined,
          endTime: startTime === "10:00" ? "11:00" : "13:00",
        })
      );
    beforeEach(async () => {
      await run();
      await q(
        "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,'12:00','13:00')",
        [owner.merchantId, serviceId, date]
      );
      provider.get.mockImplementation(() => active({ etag: '"original"' }));
      provider.move
        .mockReset()
        .mockImplementation(
          async (_credentials, _calendar, _event, _etag, next) => ({
            ...(await active()),
            start: { dateTime: next.start.toISOString() },
            end: { dateTime: next.end.toISOString() },
            extendedProperties: {
              private: {
                sariBooking: _event,
                sariAgreement: String(next.agreementId),
              },
            },
          })
        );
    });
    it("keeps the old commitment until assent, then holds both periods without calling Google", async () => {
      const before = (await bookings())[0];
      const { quote, accepted } = await pending();
      expect(quote.text).toContain("يبقى موعدك الحالي مؤكدًا");
      expect(accepted.text).toContain("لم يثبت النقل");
      expect((await bookings())[0]).toEqual(before);
      expect(await conflict("10:00")).toBe(true);
      expect(await conflict("12:00")).toBe(true);
      expect(provider.move).not.toHaveBeenCalled();
      expect((await read())?.canMove).toBe(true);
    });
    it.each(["decline", "undelivered", "expired"])(
      "does not reserve or move on %s assent",
      async mode => {
        const request = await incoming(`غير موعد الحجز #${bookingId}`),
          quote = await prepareBookingAmendment(
            request,
            selection({ startTime: "12:00" }),
            bookingId
          );
        expect(await conflict("12:00")).toBe(false);
        expect((await bookings())[0].start_time).toBe("10:00");
        if (mode !== "undelivered") await deliver(quote, true, request);
        if (mode === "expired")
          await q(
            "UPDATE conversation_booking_agreements SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE id=?",
            [quote.agreementId]
          );
        await acceptBookingAgreement(
          await incoming(mode === "decline" ? "لا" : "نعم"),
          quote.agreementId!
        );
        expect(await moves()).toHaveLength(0);
        expect(await conflict("12:00")).toBe(false);
        expect((await links())[0].state).toBe("synced");
      }
    );
    it.each(["price", "staff", "overlap", "payment"])(
      "does not propose unsupported external change %s",
      async mode => {
        const request = await incoming(`غير موعد الحجز #${bookingId}`);
        if (mode === "price")
          await q("UPDATE services SET base_price=15000 WHERE id=?", [
            serviceId,
          ]);
        if (mode === "staff")
          await q(
            "INSERT INTO booking_time_slots (merchant_id,service_id,staff_id,slot_date,start_time,end_time) VALUES (?,?,?,?,'12:00','13:00')",
            [owner.merchantId, serviceId, staffId, date]
          );
        if (mode === "overlap")
          await q(
            "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,'10:30','11:30')",
            [owner.merchantId, serviceId, date]
          );
        if (mode === "payment")
          await q("UPDATE bookings SET payment_status='paid' WHERE id=?", [
            bookingId,
          ]);
        await expect(
          prepareBookingAmendment(
            request,
            selection({
              startTime: mode === "overlap" ? "10:30" : "12:00",
              staffId: mode === "staff" ? staffId : null,
            }),
            bookingId
          )
        ).rejects.toThrow();
        expect(await moves()).toHaveLength(0);
        expect(provider.move).not.toHaveBeenCalled();
      }
    );
    it("allows a later independent reschedule of the same booking after a completed move", async () => {
      await pending();
      await moveRun();
      await q(
        "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,'14:00','15:00')",
        [owner.merchantId, serviceId, date]
      );
      const request = await incoming(`غير موعد الحجز #${bookingId}`),
        quote = await prepareBookingAmendment(
          request,
          selection({ startTime: "14:00" }),
          bookingId
        );
      await deliver(quote, true, request);
      await acceptBookingAgreement(await incoming(), quote.agreementId!);
      expect((await moveRun()).state).toBe("applied");
      expect(await moves()).toHaveLength(2);
      expect((await bookings())[0].start_time).toBe("14:00");
      expect(provider.move).toHaveBeenCalledTimes(2);
    });
    it("updates the same booking and agreement only after matching remote confirmation", async () => {
      const { quote } = await pending();
      expect(await moveRun()).toEqual({ state: "applied", replayed: false });
      expect(await bookings()).toHaveLength(1);
      expect((await bookings())[0]).toMatchObject({
        start_time: "12:00",
        end_time: "13:00",
        status: "confirmed",
        customer_agreement_id: quote.agreementId,
      });
      expect(await conflict("10:00")).toBe(false);
      expect(await conflict("12:00")).toBe(true);
      expect((await links())[0]).toMatchObject({
        state: "synced",
        agreement_id: quote.agreementId,
      });
      expect(provider.move).toHaveBeenCalledTimes(1);
      expect(provider.move.mock.calls[0][3]).toBe('"original"');
      expect(
        (await getBookingConsentReview(owner.merchantId, bookingId)).state
      ).toBe("ready");
      expect(
        (await getBookingOperationHistory(owner.merchantId, bookingId)).length
      ).toBeGreaterThan(1);
    });
    it("idempotently replays assent and dispatch without duplicate holds or writes", async () => {
      const { consent, quote } = await pending();
      expect(
        (await acceptBookingAgreement(consent, quote.agreementId!)).text
      ).toContain("لم يثبت نقل");
      expect(await moves()).toHaveLength(1);
      const command = await moveCommand();
      await rescheduleBookingCalendar(owner.merchantId, owner.userId, command);
      expect(
        await rescheduleBookingCalendar(owner.merchantId, owner.userId, command)
      ).toEqual({ state: "applied", replayed: true });
      expect(provider.move).toHaveBeenCalledTimes(1);
    });
    it.each([
      "timeout",
      "412",
      "wrong-time",
      "wrong-agreement",
      "wrong-id",
      "cancelled",
      "recurring",
    ])("keeps both holds after %s and recovers by GET only", async mode => {
      const { quote } = await pending();
      if (["timeout", "412"].includes(mode))
        provider.move.mockRejectedValueOnce(Error(mode));
      else
        provider.move.mockImplementationOnce(async () => ({
          ...(await active()),
          ...(mode === "wrong-id"
            ? { id: "foreign" }
            : mode === "cancelled"
              ? { status: "cancelled" }
              : mode === "recurring"
                ? { recurrence: ["RRULE:FREQ=DAILY"] }
                : {}),
          ...(mode === "wrong-time"
            ? { start: { dateTime: `${date}T14:00:00+03:00` } }
            : {}),
        }));
      expect((await moveRun()).state).toBe("move_unknown");
      expect((await bookings())[0].start_time).toBe("10:00");
      expect(await conflict("12:00")).toBe(true);
      await expect(moveRun()).rejects.toThrow();
      provider.get.mockImplementation(async () => ({
        ...(await active()),
        start: { dateTime: `${date}T12:00:00+03:00` },
        end: { dateTime: `${date}T13:00:00+03:00` },
        extendedProperties: {
          private: {
            sariBooking: (await links())[0].event_reference,
            sariAgreement: String(quote.agreementId),
          },
        },
      }));
      expect((await moveRun("verify")).state).toBe("applied");
      expect(provider.move).toHaveBeenCalledTimes(1);
    });
    it.each([404, 410, 403])(
      "does not free either period after recovery HTTP %s",
      async code => {
        await pending();
        provider.move.mockRejectedValueOnce(Error("lost response"));
        await moveRun();
        provider.get.mockRejectedValueOnce({ response: { status: code } });
        expect((await moveRun("verify")).state).toBe("move_unknown");
        expect(await conflict("10:00")).toBe(true);
        expect(await conflict("12:00")).toBe(true);
      }
    );
    it("rejects stale evidence before network access", async () => {
      await pending();
      const command = await moveCommand();
      await incoming("لا أريد النقل");
      provider.get.mockClear();
      await expect(
        rescheduleBookingCalendar(owner.merchantId, owner.userId, command)
      ).rejects.toThrow();
      expect(provider.get).not.toHaveBeenCalled();
      expect(provider.move).not.toHaveBeenCalled();
    });
    it("allows abandoning a request before dispatch while preserving the original appointment", async () => {
      await pending();
      await incoming("لا أريد النقل");
      expect((await read())?.canMove).toBe(false);
      expect((await read())?.canAbandon).toBe(true);
      expect((await moveRun("abandon")).state).toBe("abandoned");
      expect(await conflict("12:00")).toBe(false);
      expect(await conflict("10:00")).toBe(true);
      expect((await links())[0].state).toBe("synced");
      expect(provider.move).not.toHaveBeenCalled();
    });
    it("never abandons a dispatched request or frees its uncertain prospective hold", async () => {
      await pending();
      provider.move.mockRejectedValueOnce(Error("lost"));
      await moveRun();
      expect((await read())?.canAbandon).toBe(false);
      await expect(moveRun("abandon")).rejects.toThrow();
      expect(await conflict("12:00")).toBe(true);
    });
    it("rechecks consent after preflight without writing Google", async () => {
      await pending();
      provider.free.mockImplementationOnce(async () => {
        await incoming("لا أريد النقل");
      });
      await expect(moveRun()).rejects.toThrow();
      expect(provider.move).not.toHaveBeenCalled();
      expect((await moves())[0].state).toBe("pending");
    });
    it("retains uncertainty if the customer changes their request during PATCH", async () => {
      await pending();
      const implementation = provider.move.getMockImplementation()!;
      provider.move.mockImplementationOnce(async (...args) => {
        const result = await implementation(...args);
        await incoming("لا أريد تغيير الموعد");
        return result;
      });
      expect((await moveRun()).state).toBe("move_unknown");
      expect(await conflict("10:00")).toBe(true);
      expect(await conflict("12:00")).toBe(true);
    });
    it.each(["old-event", "etag", "busy", "account"])(
      "blocks preflight problem %s before dispatch",
      async mode => {
        await pending();
        if (mode === "old-event")
          provider.get.mockResolvedValueOnce({ id: "foreign" });
        if (mode === "etag")
          provider.get.mockImplementationOnce(() => active({ etag: "*" }));
        if (mode === "busy")
          provider.free.mockRejectedValueOnce(Error("occupied"));
        if (mode === "account")
          await q(
            "UPDATE google_integrations SET calendar_id='other' WHERE id=?",
            [integrationId]
          );
        await expect(moveRun()).rejects.toThrow();
        expect(provider.move).not.toHaveBeenCalled();
        expect((await moves())[0].state).toBe("pending");
      }
    );
    it("fences checkout, local edits, cancellation and a second transfer while pending", async () => {
      await pending();
      await expect(
        issueCanonicalBookingPaymentLink({
          merchantId: owner.merchantId,
          bookingId,
          amount: 12500,
          title: "Payment",
        })
      ).rejects.toThrow();
      await expect(
        updateBookingOperation(owner.merchantId, owner.userId, {
          bookingId,
          expectedStatus: "confirmed",
          operationId: randomUUID(),
          status: "in_progress",
        })
      ).rejects.toThrow();
      await incoming(`أريد إلغاء الحجز #${bookingId}`);
      expect(
        (await getBookingCancellationReview(owner.merchantId, bookingId))
          ?.canCancel
      ).toBe(false);
      const request = await incoming(`غير موعد الحجز #${bookingId}`);
      await expect(
        prepareBookingAmendment(
          request,
          selection({ startTime: "12:00" }),
          bookingId
        )
      ).rejects.toThrow();
    });
    it("serializes two operator dispatches into exactly one PATCH", async () => {
      await pending();
      const a = await moveCommand(),
        b = { ...a, requestId: randomUUID() };
      const results = await Promise.allSettled([
        rescheduleBookingCalendar(owner.merchantId, owner.userId, a),
        rescheduleBookingCalendar(owner.merchantId, owner.userId, b),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(provider.move).toHaveBeenCalledTimes(1);
    });
    it("reserves prospective capacity against a competing local booking", async () => {
      await pending();
      await expect(
        createAtomicBooking({
          merchantId: owner.merchantId,
          serviceId,
          customerPhone: "966500000099",
          bookingDate: date,
          startTime: "12:00",
          endTime: "13:00",
          durationMinutes: 60,
          basePrice: 12500,
          finalPrice: 12500,
        })
      ).rejects.toThrow();
      expect(await bookings()).toHaveLength(1);
    });
    const movedEvent = async () => {
      const row = (await moves()).at(-1);
      const snapshot =
        typeof row.snapshot === "string"
          ? JSON.parse(row.snapshot)
          : row.snapshot;
      return {
        ...(await active()),
        start: {
          dateTime:
            snapshot.after.bookingDate +
            "T" +
            snapshot.after.startTime +
            ":00+03:00",
        },
        end: {
          dateTime:
            snapshot.after.bookingDate +
            "T" +
            snapshot.after.endTime +
            ":00+03:00",
        },
        extendedProperties: {
          private: {
            sariBooking: (await links())[0].event_reference,
            sariAgreement: String(row.agreement_id),
          },
        },
      };
    };
    it.each([
      "dispatch-commit",
      "result-commit",
      "operation-audit",
      "review-audit",
    ])("recovers without repeating PATCH after %s failure", async failure => {
      await pending();
      const command = await moveCommand(),
        pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      let commits = 0,
        reached = false;
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await get(), {
            get(target, key) {
              if (key === "commit")
                return async () => {
                  await target.commit();
                  commits++;
                  if (
                    (failure === "dispatch-commit" && commits === 2) ||
                    (failure === "result-commit" && commits === 3)
                  ) {
                    reached = true;
                    throw Error("lost ack");
                  }
                };
              if (key === "execute")
                return async (sql: string, args: any[]) => {
                  if (
                    (failure === "operation-audit" &&
                      sql.startsWith("INSERT INTO booking_operation_audits")) ||
                    (failure === "review-audit" &&
                      sql.startsWith("INSERT INTO booking_calendar_reviews"))
                  ) {
                    reached = true;
                    throw Error("audit unavailable");
                  }
                  return target.execute(sql, args);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      await expect(
        rescheduleBookingCalendar(owner.merchantId, owner.userId, command)
      ).rejects.toThrow();
      spy.mockRestore();
      expect(reached).toBe(true);
      const writes = provider.move.mock.calls.length;
      expect(
        (
          await rescheduleBookingCalendar(
            owner.merchantId,
            owner.userId,
            command
          )
        ).replayed
      ).toBe(true);
      expect(provider.move).toHaveBeenCalledTimes(writes);
      if (failure !== "result-commit") {
        expect((await moves())[0].state).toBe("moving");
        expect((await bookings())[0].start_time).toBe("10:00");
        expect(await conflict("12:00")).toBe(true);
        expect((await read())?.canVerify).toBe(false);
        await q(
          "UPDATE booking_calendar_reschedules SET updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE booking_reference=?",
          [bookingId]
        );
        // A dispatch commit failure did not send PATCH: an old event proves neither success nor permission to release.
        provider.get.mockResolvedValueOnce(
          failure === "dispatch-commit" ? await active() : await movedEvent()
        );
        expect((await moveRun("verify")).state).toBe(
          failure === "dispatch-commit" ? "move_unknown" : "applied"
        );
      }
      expect(provider.move).toHaveBeenCalledTimes(writes);
    });
    it("rejects a late PATCH response after a newer recovery completed", async () => {
      await pending();
      let entered!: () => void, finish!: (v: any) => void;
      const ready = new Promise<void>(r => (entered = r));
      provider.move.mockImplementationOnce(() => {
        entered();
        return new Promise(r => (finish = r));
      });
      const command = await moveCommand(),
        operation = rescheduleBookingCalendar(
          owner.merchantId,
          owner.userId,
          command
        ).then(
          value => ({ value }),
          error => ({ error })
        );
      await ready;
      const event = await movedEvent();
      await q(
        "UPDATE booking_calendar_reschedules SET updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE booking_reference=?",
        [bookingId]
      );
      provider.get.mockResolvedValueOnce(event);
      expect((await moveRun("verify")).state).toBe("applied");
      finish(event);
      expect(await operation).toHaveProperty("error");
      expect((await bookings())[0].start_time).toBe("12:00");
      expect(provider.move).toHaveBeenCalledTimes(1);
    });
    it("rejects a stale GET after another reviewer completed recovery", async () => {
      await pending();
      provider.move.mockRejectedValueOnce(Error("lost"));
      await moveRun();
      let entered!: () => void, finish!: (v: any) => void;
      const ready = new Promise<void>(r => (entered = r)),
        event = await movedEvent();
      provider.get.mockImplementationOnce(() => {
        entered();
        return new Promise(r => (finish = r));
      });
      const operation = rescheduleBookingCalendar(
        owner.merchantId,
        owner.userId,
        await moveCommand("verify")
      ).then(
        value => ({ value }),
        error => ({ error })
      );
      await ready;
      provider.get.mockResolvedValueOnce(event);
      expect((await moveRun("verify")).state).toBe("applied");
      finish(event);
      expect(await operation).toHaveProperty("error");
      expect(provider.move).toHaveBeenCalledTimes(1);
    });
    it("counts a prospective hold on another day toward the service daily limit", async () => {
      const nextDate = new Date(Date.parse(date) + 86400000)
        .toISOString()
        .slice(0, 10);
      await q("UPDATE services SET max_bookings_per_day=1 WHERE id=?", [
        serviceId,
      ]);
      for (const time of ["12:00", "14:00"])
        await q(
          "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,?,?)",
          [
            owner.merchantId,
            serviceId,
            nextDate,
            time,
            time === "12:00" ? "13:00" : "15:00",
          ]
        );
      const request = await incoming(`غير موعد الحجز #${bookingId}`),
        quote = await prepareBookingAmendment(
          request,
          selection({ bookingDate: nextDate, startTime: "12:00" }),
          bookingId
        );
      await deliver(quote, true, request);
      await acceptBookingAgreement(await incoming(), quote.agreementId!);
      const inspect = () =>
        withBookingCapacityTransaction(owner.merchantId, c =>
          readBookingSelectionSnapshot(
            c,
            owner.merchantId,
            selection({ bookingDate: nextDate, startTime: "14:00" })
          )
        );
      await expect(inspect()).rejects.toThrow();
      await moveRun("abandon");
      await expect(inspect()).resolves.toMatchObject({
        bookingDate: nextDate,
        startTime: "14:00",
      });
    });
    it("fences another service using the same Google calendar in the appointment ledger", async () => {
      await pending();
      const service = (
        await q(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Another service',60,5000)",
          [owner.merchantId]
        )
      ).insertId;
      provider.create.mockClear();
      await expect(
        bookCalendarAppointment(
          {
            merchantId: owner.merchantId,
            serviceId: service,
            customerPhone: "966500000098",
            appointmentDate: date,
            startTime: "12:00",
          },
          { actorUserId: owner.userId, requestId: randomUUID() }
        )
      ).rejects.toThrow();
      expect(provider.create).not.toHaveBeenCalled();
    });
    it("blocks a transfer against an uncertain appointment in the same calendar even for another service", async () => {
      await pending();
      const service = (
        await q(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Another service',60,5000)",
          [owner.merchantId]
        )
      ).insertId;
      const link = (await links())[0];
      await q(
        "INSERT INTO appointments (merchant_id,customer_phone,service_id,appointment_date,start_time,end_time,status,calendar_sync_state,calendar_integration_id,calendar_target_id,calendar_identity_hash) VALUES (?,'966500000097',?,?,'12:00','13:00','confirmed','create_unknown',?,'primary',?)",
        [owner.merchantId, service, date, integrationId, link.identity_hash]
      );
      await expect(moveRun()).rejects.toThrow();
      expect(provider.move).not.toHaveBeenCalled();
      expect((await moves())[0].state).toBe("pending");
    });
    it("routes the saved WhatsApp request through renewed consent without letting the model execute the move", async () => {
      const request = await incoming(
        `غير موعد الحجز #${bookingId} إلى الساعة 12`
      );
      vi.mocked(callGPT4).mockResolvedValue(
        JSON.stringify(selection({ startTime: "12:00" }))
      );
      const text = await handleBookingConversation({
        ...request,
        message: "spoofed input",
      });
      expect(text).toContain("يبقى موعدك الحالي مؤكدًا");
      const agreement = (await agreements()).at(-1);
      await deliver({ text }, true, request);
      const consent = await incoming();
      const reply = await handleBookingConversation({
        ...consent,
        message: "ignored",
      });
      expect(reply).toContain("لم يثبت النقل");
      expect(provider.move).not.toHaveBeenCalled();
      expect(
        await handleBookingConversation({ ...consent, message: "ignored" })
      ).toContain("لم يثبت نقل");
      expect(await moves()).toHaveLength(1);
      expect(callGPT4).toHaveBeenCalledTimes(1);
      await moveRun();
      expect(
        await handleBookingConversation({ ...consent, message: "ignored" })
      ).toContain("مؤكد لدى النشاط");
      expect((await bookings())[0].customer_agreement_id).toBe(agreement.id);
      expect(callGPT4).toHaveBeenCalledTimes(1);
    });
    it("does not authorize another tenant with a leaked booking and evidence", async () => {
      await pending();
      await expect(
        getBookingRescheduleReview(other.merchantId, bookingId)
      ).rejects.toThrow();
      await expect(
        rescheduleBookingCalendar(
          other.merchantId,
          other.userId,
          await moveCommand()
        )
      ).rejects.toThrow();
      expect(provider.move).not.toHaveBeenCalled();
    });
    describe("durable customer notification after moving", () => {
      let account: string, instanceId: number;
      const notices = () =>
        q(
          "SELECT * FROM booking_reschedule_notifications WHERE merchant_id=? ORDER BY id",
          [owner.merchantId]
        );
      const send = async () =>
        dispatchBookingNotice(owner.merchantId, (await notices()).at(-1).id);
      const receipt = async (status = "read") => {
        const n = (await notices()).at(-1);
        return updateWhatsAppDeliveryStatus({
          provider: "green_api",
          providerAccount: account,
          providerMessageId: n.provider_message_id,
          status: status as any,
        });
      };
      async function prepareNotice() {
        const { consent } = await pending();
        account = randomUUID();
        instanceId = (
          await q(
            "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,api_url,status,is_primary) VALUES (?,?,'fixture','green_api','https://api.green-api.com','active',1)",
            [owner.merchantId, account]
          )
        ).insertId;
        const { id } = await enqueueInbound({
          source: "webhook",
          payload: {
            typeWebhook: "incomingMessageReceived",
            instanceData: { idInstance: account },
            idMessage: randomUUID(),
            timestamp: Math.floor(Date.now() / 1000),
            senderData: { chatId: `${phone}@c.us` },
            messageData: {
              typeMessage: "textMessage",
              textMessageData: { textMessage: "نعم" },
            },
          },
        });
        const job = (
          await q("SELECT event_key FROM whatsapp_inbound_jobs WHERE id=?", [
            id,
          ])
        )[0];
        await q("UPDATE messages SET externalId=? WHERE id=?", [
          `inbound:v1:${job.event_key}`,
          consent.incomingMessageId,
        ]);
        await q(
          "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE id=?",
          [id]
        );
        return consent;
      }
      beforeEach(() => {
        transport.send.mockReset().mockImplementation(async () => ({
          accepted: true,
          outcome: "accepted",
          status: "sent",
          providerMessageId: randomUUID(),
        }));
      });
      const noticeReviews = () =>
        q(
          "SELECT * FROM booking_notification_reviews WHERE merchant_id=? ORDER BY id",
          [owner.merchantId]
        );
      const noticeCommand = async () => {
        const notice = (await read())!.notification!;
        return {
          bookingId,
          notificationId: notice.id,
          evidence: notice.evidence,
          requestId: randomUUID(),
          reviewed: true as const,
          reason: "Operator checked saved delivery evidence",
        };
      };
      const reviewNotice = async (
        input?: Awaited<ReturnType<typeof noticeCommand>>
      ) =>
        reviewBookingNotification(
          owner.merchantId,
          owner.userId,
          input ?? (await noticeCommand())
        );
      const readyNotice = async () => {
        await prepareNotice();
        await moveRun();
        await send();
      };
      it("shows exact receipt evidence and records an owned review without resending", async () => {
        await readyNotice();
        const before = (await read())!.notification!;
        expect(before).toMatchObject({
          state: "accepted",
          delivery: "sent",
          projected: true,
          canReview: true,
          issue: null,
          history: [],
        });
        expect(before.receipt).toBe((await notices())[0].provider_message_id);
        expect(before.evidence).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(before)).not.toMatch(
          /claim_token|bookingNoticeGuard|synthetic-access|fixture/
        );
        await reviewNotice();
        const history = await noticeReviews();
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({
          actor_user_id: owner.userId,
          booking_reference: bookingId,
          outcome: "accepted",
          delivery_state: "sent",
          projected: 1,
        });
        expect((await read())!.notification!.history[0].reason).toBe(
          "Operator checked saved delivery evidence"
        );
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("reads current receipt without reconciling or adding audit records", async () => {
        await readyNotice();
        await receipt("read");
        expect((await read())!.notification!.delivery).toBe("read");
        expect((await notices())[0].delivery_state).toBe("sent");
        expect(await noticeReviews()).toHaveLength(0);
        await reviewNotice();
        expect((await notices())[0].delivery_state).toBe("read");
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("serves concurrent review reads without requesting schema connections while holding capacity locks", async () => {
        await readyNotice();
        const results = await Promise.all(
          Array.from({ length: 24 }, () => read())
        );
        expect(results.every(r => r?.notification?.delivery === "sent")).toBe(
          true
        );
        expect(await noticeReviews()).toHaveLength(0);
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("replays concurrent identical reviews once and rejects changing the actor or request body", async () => {
        await readyNotice();
        const input = await noticeCommand();
        const results = await Promise.all(
          Array.from({ length: 6 }, () => reviewNotice(input))
        );
        expect(results.filter(r => !r.replayed)).toHaveLength(1);
        expect(await noticeReviews()).toHaveLength(1);
        await expect(
          reviewNotice({ ...input, reason: "Changed explanation after commit" })
        ).rejects.toThrow();
        await expect(
          reviewBookingNotification(owner.merchantId, other.userId, input)
        ).rejects.toThrow();
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("allows only one concurrent review of the same evidence with different request ids", async () => {
        await readyNotice();
        const input = await noticeCommand();
        const results = await Promise.allSettled(
          Array.from({ length: 5 }, () =>
            reviewNotice({ ...input, requestId: randomUUID() })
          )
        );
        expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
        expect(await noticeReviews()).toHaveLength(1);
      });
      it.each([
        "receipt",
        "account",
        "message",
        "conversation",
        "snapshot",
        "review",
      ])(
        "rejects stale %s evidence before reconciliation or audit",
        async mode => {
          await readyNotice();
          const input = await noticeCommand(),
            n = (await notices())[0];
          if (mode === "receipt") await receipt("read");
          if (mode === "account")
            await q("UPDATE whatsapp_instances SET instance_id=? WHERE id=?", [
              randomUUID(),
              instanceId,
            ]);
          if (mode === "message")
            await q(
              "UPDATE messages SET content='changed projection' WHERE id=?",
              [n.projection_message_id]
            );
          if (mode === "conversation")
            await q(
              "UPDATE conversations SET customerPhone='966500000098' WHERE id=?",
              [source.conversationId]
            );
          if (mode === "snapshot")
            await q(
              "UPDATE booking_reschedule_notifications SET snapshot_hash=? WHERE id=?",
              ["b".repeat(64), n.id]
            );
          if (mode === "review") await reviewNotice(input);
          await expect(
            reviewNotice({ ...input, requestId: randomUUID() })
          ).rejects.toThrow();
          expect(await noticeReviews()).toHaveLength(mode === "review" ? 1 : 0);
          expect(transport.send).toHaveBeenCalledTimes(1);
        }
      );
      it("does not invalidate evidence for polling schedule changes", async () => {
        await readyNotice();
        const input = await noticeCommand();
        await q(
          "UPDATE booking_reschedule_notifications SET next_check_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)),updated_at=UTC_TIMESTAMP(3) WHERE merchant_id=?",
          [owner.merchantId]
        );
        await expect(reviewNotice(input)).resolves.toMatchObject({
          replayed: false,
        });
      });
      it.each(["unknown", "failed", "suppressed", "manual_review"])(
        "records %s without fabricating receipt or requeueing",
        async mode => {
          if (mode === "manual_review") {
            await pending();
            await moveRun();
          } else {
            await prepareNotice();
            await moveRun();
            if (mode === "suppressed") await incoming("changed my mind");
            if (mode === "unknown")
              transport.send.mockRejectedValue(Error("timeout"));
            if (mode === "failed")
              transport.send.mockResolvedValue({
                accepted: false,
                outcome: "rejected",
                status: "failed",
              });
            await send();
          }
          const n = (await notices())[0];
          expect(n.state).toBe(mode);
          const sends = transport.send.mock.calls.length;
          await reviewNotice();
          await send();
          expect((await notices())[0].state).toBe(mode);
          expect((await read())!.notification!.receipt).toBeNull();
          expect((await noticeReviews())[0].outcome).toBe(mode);
          expect(transport.send).toHaveBeenCalledTimes(sends);
        }
      );
      it.each(["pending", "dispatching"])(
        "does not review an active %s attempt",
        async mode => {
          await prepareNotice();
          await moveRun();
          if (mode === "dispatching")
            await q(
              "UPDATE booking_reschedule_notifications SET state='dispatching',dispatch_started_at=UTC_TIMESTAMP(3),claim_token=? WHERE merchant_id=?",
              [randomUUID(), owner.merchantId]
            );
          expect((await read())!.notification!.canReview).toBe(false);
          await expect(reviewNotice()).rejects.toThrow();
          expect(await noticeReviews()).toHaveLength(0);
          expect(transport.send).not.toHaveBeenCalled();
        }
      );
      it("isolates a leaked notification id and mismatched booking id", async () => {
        await readyNotice();
        const input = await noticeCommand();
        await expect(
          reviewBookingNotification(other.merchantId, other.userId, input)
        ).rejects.toThrow();
        await expect(
          reviewNotice({ ...input, bookingId: bookingId + 1000000 })
        ).rejects.toThrow();
        await expect(
          reviewNotice({
            ...input,
            notificationId: input.notificationId + 1000000,
          })
        ).rejects.toThrow();
        expect(await noticeReviews()).toHaveLength(0);
      });
      it("recovers a late receipt and missing projection after the automatic seven-day polling period", async () => {
        await readyNotice();
        const n = (await notices())[0];
        await q("DELETE FROM messages WHERE id=?", [n.projection_message_id]);
        await q(
          "UPDATE booking_reschedule_notifications SET state='unknown',accepted_at=NULL,provider_message_id=NULL,projection_message_id=NULL,delivery_state='unverified',created_at=TIMESTAMPADD(DAY,-8,UTC_TIMESTAMP(3)),next_check_at=NULL WHERE id=?",
          [n.id]
        );
        const before = (await read())!.notification!;
        expect(before).toMatchObject({
          state: "unknown",
          delivery: "sent",
          projected: false,
          issue: "projection_missing",
        });
        await reviewNotice();
        expect((await read())!.notification!).toMatchObject({
          state: "accepted",
          projected: true,
        });
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it.each(["delete", "corrupt", "reassign", "receipt-id"])(
        "does not trust stale cached projection after %s",
        async mode => {
          await readyNotice();
          const n = (await notices())[0];
          if (mode === "delete")
            await q("DELETE FROM messages WHERE id=?", [
              n.projection_message_id,
            ]);
          if (mode === "corrupt")
            await q(
              "UPDATE messages SET content='unrelated history' WHERE id=?",
              [n.projection_message_id]
            );
          if (mode === "reassign")
            await q(
              "UPDATE conversations SET customerPhone='966500000090' WHERE id=?",
              [source.conversationId]
            );
          if (mode === "receipt-id")
            await q(
              "UPDATE whatsapp_message_deliveries SET provider_message_id=? WHERE merchant_id=? AND idempotency_key=?",
              [
                randomUUID(),
                owner.merchantId,
                bookingNoticeKey(owner.merchantId, n.id),
              ]
            );
          expect((await read())!.notification!.projected).toBe(false);
          await reviewNotice();
          expect((await read())!.notification!.projected).toBe(
            mode === "delete"
          );
          expect((await notices())[0].provider_message_id).toBe(
            n.provider_message_id
          );
          expect(transport.send).toHaveBeenCalledTimes(1);
        }
      );
      it("does not show delivered or read without a valid provider message identity", async () => {
        await readyNotice();
        const n = (await notices())[0];
        await q(
          "UPDATE booking_reschedule_notifications SET state='unknown',accepted_at=NULL,provider_message_id=NULL WHERE id=?",
          [n.id]
        );
        await q(
          "UPDATE whatsapp_message_deliveries SET status='read',provider_message_id=NULL WHERE merchant_id=? AND idempotency_key=?",
          [owner.merchantId, bookingNoticeKey(owner.merchantId, n.id)]
        );
        expect((await read())!.notification!).toMatchObject({
          delivery: "unverified",
          receipt: null,
          projected: false,
        });
        await reviewNotice();
        expect((await noticeReviews())[0]).toMatchObject({
          outcome: "unknown",
          delivery_state: "unverified",
          projected: 0,
        });
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("recovers a lost review commit acknowledgement with the original request id", async () => {
        await readyNotice();
        const input = await noticeCommand(),
          pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        let lost = false;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await original(), {
              get(target, key) {
                if (key === "commit")
                  return async () => {
                    await target.commit();
                    if (!lost) {
                      lost = true;
                      throw Error("ack lost");
                    }
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
        );
        try {
          await expect(reviewNotice(input)).rejects.toThrow();
        } finally {
          spy.mockRestore();
        }
        expect(await noticeReviews()).toHaveLength(1);
        await expect(reviewNotice(input)).resolves.toMatchObject({
          replayed: true,
        });
        expect(await noticeReviews()).toHaveLength(1);
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("rolls back receipt recovery and projection when recording the review fails", async () => {
        await readyNotice();
        const n = (await notices())[0];
        await q("DELETE FROM messages WHERE id=?", [n.projection_message_id]);
        const input = await noticeCommand(),
          pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        const spy = vi
          .spyOn(pool, "getConnection")
          .mockImplementation(async () => {
            const c = await original();
            return new Proxy(c, {
              get(target, key) {
                if (key === "execute")
                  return async (sql: any, args: any) => {
                    if (
                      String(sql).includes(
                        "INSERT INTO booking_notification_reviews"
                      )
                    )
                      throw Error("audit unavailable");
                    return target.execute(sql, args);
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
          });
        try {
          await expect(reviewNotice(input)).rejects.toThrow();
        } finally {
          spy.mockRestore();
        }
        expect(await noticeReviews()).toHaveLength(0);
        expect((await read())!.notification!.projected).toBe(false);
        await reviewNotice(input);
        expect((await read())!.notification!.projected).toBe(true);
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("waits for the consent reply job to finish before sending the later outcome", async () => {
        await prepareNotice();
        await q(
          "UPDATE whatsapp_inbound_jobs SET status='running' WHERE merchant_id=?",
          [owner.merchantId]
        );
        await moveRun();
        await send();
        expect((await notices())[0].state).toBe("pending");
        expect(transport.send).not.toHaveBeenCalled();
        await q(
          "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE merchant_id=?",
          [owner.merchantId]
        );
        await send();
        expect((await notices())[0].state).toBe("accepted");
      });
      it.each(["review", "dismissed"])(
        "does not overtake a consent reply in %s",
        async state => {
          await prepareNotice();
          await q(
            "UPDATE whatsapp_inbound_jobs SET status=? WHERE merchant_id=?",
            [state, owner.merchantId]
          );
          await moveRun();
          await send();
          expect((await notices())[0].state).toBe("suppressed");
          expect(transport.send).not.toHaveBeenCalled();
        }
      );
      it("atomically queues one notification only after a verified move and replays without duplicates", async () => {
        await prepareNotice();
        expect(await notices()).toHaveLength(0);
        const input = await moveCommand();
        await rescheduleBookingCalendar(owner.merchantId, owner.userId, input);
        expect(await notices()).toHaveLength(1);
        expect((await notices())[0].state).toBe("pending");
        expect((await read())?.notification?.state).toBe("pending");
        await rescheduleBookingCalendar(owner.merchantId, owner.userId, input);
        expect(await notices()).toHaveLength(1);
        expect(transport.send).not.toHaveBeenCalled();
      });
      it.each(["abandon", "unknown"])(
        "does not enqueue after %s",
        async mode => {
          await prepareNotice();
          if (mode === "unknown")
            provider.move.mockRejectedValueOnce(Error("lost"));
          await moveRun(mode === "abandon" ? "abandon" : "move");
          expect(await notices()).toHaveLength(0);
        }
      );
      it("enqueues when GET recovery proves the move, without replaying PATCH", async () => {
        await prepareNotice();
        let result: any;
        const actual = provider.move.getMockImplementation()!;
        provider.move.mockImplementationOnce(async (...args: any[]) => {
          result = await actual(...args);
          throw Error("lost");
        });
        await moveRun();
        expect(await notices()).toHaveLength(0);
        provider.get.mockResolvedValueOnce(result);
        await moveRun("verify");
        expect(await notices()).toHaveLength(1);
        expect(provider.move).toHaveBeenCalledTimes(1);
      });
      it("rolls back local completion if transactional notification insertion fails", async () => {
        await prepareNotice();
        const pool = (await getPool())!,
          get = pool.getConnection.bind(pool);
        let fail = true;
        const spy = vi
          .spyOn(pool, "getConnection")
          .mockImplementation(async () => {
            const c = await get();
            const exec = c.execute.bind(c);
            c.execute = ((sql: any, args: any) => {
              if (
                fail &&
                String(sql).startsWith(
                  "INSERT INTO booking_reschedule_notifications"
                )
              ) {
                fail = false;
                return Promise.reject(Error("notice storage lost"));
              }
              return exec(sql, args);
            }) as any;
            const release = c.release.bind(c);
            c.release = () => {
              c.execute = exec as any;
              c.release = release;
              release();
            };
            return c;
          });
        await expect(moveRun()).rejects.toThrow();
        spy.mockRestore();
        expect((await moves())[0].state).toBe("moving");
        expect((await bookings())[0].start_time).toBe("10:00");
        expect(await notices()).toHaveLength(0);
        expect(transport.send).not.toHaveBeenCalled();
      });
      it("records missing source channel for review without failing the actual move", async () => {
        await pending();
        await moveRun();
        expect((await notices())[0].state).toBe("manual_review");
        await send();
        expect(transport.send).not.toHaveBeenCalled();
      });
      it("sends through the original account once across concurrent workers and projects exactly once", async () => {
        await prepareNotice();
        await moveRun();
        await Promise.all(Array.from({ length: 8 }, () => send()));
        const n = (await notices())[0];
        expect(n.state).toBe("accepted");
        expect(n.delivery_state).toBe("sent");
        expect(n.projection_message_id).toBeTruthy();
        expect(transport.send).toHaveBeenCalledTimes(1);
        expect(transport.send.mock.calls[0][0].instanceId).toBe(account);
        expect(transport.send.mock.calls[0][1].text).toContain("تم نقل حجزك");
        await reconcileBookingNotice(owner.merchantId, n.id);
        expect((await notices())[0].projection_message_id).toBe(
          n.projection_message_id
        );
        expect(
          await q("SELECT id FROM messages WHERE externalId=?", [
            `booking-notice:v1:${owner.merchantId}:${n.id}`,
          ])
        ).toHaveLength(1);
      });
      it("tracks delivery and reading separately, without another provider call", async () => {
        await prepareNotice();
        await moveRun();
        await send();
        const n = (await notices())[0];
        expect((await read())?.notification?.delivery).toBe("sent");
        await receipt("delivered");
        await reconcileBookingNotice(owner.merchantId, n.id);
        expect((await read())?.notification?.delivery).toBe("delivered");
        await receipt();
        await reconcileBookingNotice(owner.merchantId, n.id);
        expect((await read())?.notification?.delivery).toBe("read");
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("does not erase acceptance when a later failure receipt arrives", async () => {
        await prepareNotice();
        await moveRun();
        await send();
        await receipt("failed");
        const n = (await notices())[0];
        await reconcileBookingNotice(owner.merchantId, n.id);
        expect((await notices())[0]).toMatchObject({
          state: "accepted",
          delivery_state: "failed",
          provider_message_id: n.provider_message_id,
        });
        await send();
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it.each([
        "human",
        "new-message",
        "withdrawn",
        "changed-booking",
        "changed-phone",
        "inactive-account",
        "changed-account",
        "inactive-merchant",
        "old-consent",
        "tampered-text",
        "tampered-snapshot",
        "changed-consent",
        "changed-agreement",
        "expired-slot",
      ])("suppresses %s before sending", async mode => {
        const consent = await prepareNotice();
        await moveRun();
        if (mode === "human")
          await q("UPDATE conversations SET human_takeover=1 WHERE id=?", [
            source.conversationId,
          ]);
        if (mode === "new-message") await incoming("لدي تعديل");
        if (mode === "withdrawn")
          await q(
            "INSERT INTO campaign_consent_state (merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,?,'withdrawn','v1','test',?,UTC_TIMESTAMP(3))",
            [owner.merchantId, phone, "a".repeat(64)]
          );
        if (mode === "changed-booking")
          await q("UPDATE bookings SET status='cancelled' WHERE id=?", [
            bookingId,
          ]);
        if (mode === "changed-phone")
          await q(
            "UPDATE conversations SET customerPhone='966500000090' WHERE id=?",
            [source.conversationId]
          );
        if (mode === "inactive-account")
          await q(
            "UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",
            [instanceId]
          );
        if (mode === "changed-account")
          await q("UPDATE whatsapp_instances SET instance_id=? WHERE id=?", [
            randomUUID(),
            instanceId,
          ]);
        if (mode === "inactive-merchant")
          await q("UPDATE merchants SET status='suspended' WHERE id=?", [
            owner.merchantId,
          ]);
        if (mode === "old-consent")
          await q(
            "UPDATE messages SET createdAt=TIMESTAMPADD(HOUR,-25,UTC_TIMESTAMP()) WHERE id=?",
            [consent.incomingMessageId]
          );
        if (mode === "tampered-text")
          await q(
            "UPDATE booking_reschedule_notifications SET dispatch_text='forged' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (mode === "tampered-snapshot")
          await q(
            "UPDATE booking_reschedule_notifications SET snapshot=JSON_SET(snapshot,'$.phone','966500000090') WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (mode === "changed-consent")
          await q("UPDATE messages SET content='لا أوافق' WHERE id=?", [
            consent.incomingMessageId,
          ]);
        if (mode === "changed-agreement")
          await q(
            "UPDATE conversation_booking_agreements SET state='expired' WHERE id=?",
            [(await bookings())[0].customer_agreement_id]
          );
        if (mode === "expired-slot")
          await q("UPDATE bookings SET booking_date='2020-01-01' WHERE id=?", [
            bookingId,
          ]);
        await send();
        expect((await notices())[0].state).toBe("suppressed");
        expect(transport.send).not.toHaveBeenCalled();
      });
      it("rechecks authority after delivery reservation and stops a new reply during account loading", async () => {
        await prepareNotice();
        await moveRun();
        const pool = (await getPool())!,
          execute = pool.execute.bind(pool);
        let changed = false;
        const spy = vi.spyOn(pool, "execute").mockImplementation((async (
          sql: any,
          args: any
        ) => {
          const result = await execute(sql, args);
          if (
            !changed &&
            String(sql).includes("INSERT INTO whatsapp_message_deliveries")
          ) {
            changed = true;
            await incoming("لا ترسل الآن");
          }
          return result;
        }) as any);
        await send();
        spy.mockRestore();
        expect(transport.send).not.toHaveBeenCalled();
        expect((await notices())[0].state).toBe("failed");
      });
      it.each(["throw", "missing-id", "rejected"])(
        "never retries %s transport outcomes",
        async mode => {
          await prepareNotice();
          await moveRun();
          if (mode === "throw")
            transport.send.mockRejectedValueOnce(Error("network lost"));
          else
            transport.send.mockResolvedValueOnce(
              mode === "missing-id"
                ? { accepted: true, status: "sent" }
                : {
                    accepted: false,
                    status: "failed",
                    outcome: "rejected",
                    errorCode: "http_400",
                  }
            );
          await send();
          await send();
          const n = (await notices())[0];
          await reconcileBookingNotice(owner.merchantId, n.id);
          expect((await notices())[0].state).toBe(
            mode === "rejected" ? "failed" : "unknown"
          );
          expect((await notices())[0].projection_message_id).toBeNull();
          expect(transport.send).toHaveBeenCalledTimes(1);
        }
      );
      it("recovers accepted delivery after local projection fails, without resending", async () => {
        await prepareNotice();
        await moveRun();
        const pool = (await getPool())!,
          get = pool.getConnection.bind(pool);
        let failed = false;
        const spy = vi
          .spyOn(pool, "getConnection")
          .mockImplementation(async () => {
            const c = await get(),
              exec = c.execute.bind(c),
              release = c.release.bind(c);
            c.execute = ((sql: any, args: any) => {
              if (!failed && String(sql).includes("INSERT INTO messages")) {
                failed = true;
                return Promise.reject(Error("projection failure"));
              }
              return exec(sql, args);
            }) as any;
            c.release = () => {
              c.execute = exec as any;
              c.release = release;
              release();
            };
            return c;
          });
        await expect(send()).rejects.toThrow();
        spy.mockRestore();
        const n = (await notices())[0];
        expect(n.state).toBe("dispatching");
        await reconcileBookingNotice(owner.merchantId, n.id);
        expect((await notices())[0].state).toBe("accepted");
        expect((await notices())[0].projection_message_id).toBeTruthy();
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it.each(["text", "recipient", "account", "guard", "receipt"])(
        "rejects mismatched %s receipt evidence",
        async mode => {
          await prepareNotice();
          await moveRun();
          transport.send.mockRejectedValueOnce(Error("lost"));
          await send();
          const n = (await notices())[0];
          await q(
            "UPDATE whatsapp_message_deliveries SET status='sent',provider_message_id='synthetic-receipt' WHERE merchant_id=? AND idempotency_key=?",
            [owner.merchantId, bookingNoticeKey(owner.merchantId, n.id)]
          );
          if (mode === "text")
            await q(
              "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.text','forged') WHERE merchant_id=?",
              [owner.merchantId]
            );
          if (mode === "recipient")
            await q(
              "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','966500000090') WHERE merchant_id=?",
              [owner.merchantId]
            );
          if (mode === "account")
            await q("UPDATE whatsapp_instances SET instance_id=? WHERE id=?", [
              randomUUID(),
              instanceId,
            ]);
          if (mode === "guard")
            await q(
              "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.bookingNoticeGuard.token','forged') WHERE merchant_id=?",
              [owner.merchantId]
            );
          if (mode === "receipt")
            await q(
              "UPDATE whatsapp_message_deliveries SET provider_message_id='<bad>' WHERE merchant_id=?",
              [owner.merchantId]
            );
          await reconcileBookingNotice(owner.merchantId, n.id);
          expect((await notices())[0].accepted_at).toBeNull();
          expect((await notices())[0].projection_message_id).toBeNull();
          expect(transport.send).toHaveBeenCalledTimes(1);
        }
      );
      it("recovers an expired claim only by reading receipts, never resending", async () => {
        await prepareNotice();
        await moveRun();
        await q(
          "UPDATE booking_reschedule_notifications SET state='dispatching',claim_token=?,dispatch_started_at=TIMESTAMPADD(MINUTE,-3,UTC_TIMESTAMP(3)),next_check_at=UTC_TIMESTAMP(3) WHERE merchant_id=?",
          [randomUUID(), owner.merchantId]
        );
        await runBookingNotificationBatch();
        expect((await notices())[0].state).toBe("unknown");
        expect(transport.send).not.toHaveBeenCalled();
      });
      it("does not let another tenant dispatch or reconcile a leaked notification id", async () => {
        await prepareNotice();
        await moveRun();
        const n = (await notices())[0];
        await dispatchBookingNotice(other.merchantId, n.id);
        await expect(
          reconcileBookingNotice(other.merchantId, n.id)
        ).rejects.toThrow();
        expect((await notices())[0].state).toBe("pending");
        expect(transport.send).not.toHaveBeenCalled();
      });
      it("does not replay a dispatch whose claim commit acknowledgement was lost", async () => {
        await prepareNotice();
        await moveRun();
        const pool = (await getPool())!,
          get = pool.getConnection.bind(pool);
        let failed = false;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await get(), {
              get(target, key) {
                if (key === "commit")
                  return async () => {
                    await target.commit();
                    if (!failed) {
                      failed = true;
                      throw Error("commit ack lost");
                    }
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
        );
        await expect(send()).rejects.toThrow();
        spy.mockRestore();
        expect((await notices())[0].state).toBe("dispatching");
        await send();
        await reconcileBookingNotice(owner.merchantId, (await notices())[0].id);
        expect((await notices())[0].state).toBe("unknown");
        expect(transport.send).not.toHaveBeenCalled();
      });
      it("keeps the original account when another account becomes primary", async () => {
        await prepareNotice();
        await moveRun();
        await q("UPDATE whatsapp_instances SET is_primary=0 WHERE id=?", [
          instanceId,
        ]);
        await q(
          "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,api_url,status,is_primary) VALUES (?,?,'fixture','green_api','https://api.green-api.com','active',1)",
          [owner.merchantId, randomUUID()]
        );
        await send();
        expect(transport.send.mock.calls[0][0].instanceId).toBe(account);
        expect((await notices())[0].state).toBe("accepted");
      });
      it("preserves accepted evidence without writing history into a reassigned conversation", async () => {
        await prepareNotice();
        await moveRun();
        transport.send.mockImplementationOnce(async () => {
          await q(
            "UPDATE conversations SET customerPhone='966500000090' WHERE id=?",
            [source.conversationId]
          );
          return {
            accepted: true,
            outcome: "accepted",
            status: "sent",
            providerMessageId: randomUUID(),
          };
        });
        await send();
        expect((await notices())[0]).toMatchObject({
          state: "accepted",
          last_error: "conversation_unavailable",
          projection_message_id: null,
        });
        expect((await read())?.notification?.projected).toBe(false);
      });
      it("does not claim a reassigned conversation still contains the notification", async () => {
        await prepareNotice();
        await moveRun();
        await send();
        const n = (await notices())[0];
        expect(n.projection_message_id).toBeTruthy();
        await q(
          "UPDATE conversations SET customerPhone='966500000090' WHERE id=?",
          [source.conversationId]
        );
        await reconcileBookingNotice(owner.merchantId, n.id);
        expect((await notices())[0]).toMatchObject({
          state: "accepted",
          projection_message_id: null,
          last_error: "conversation_unavailable",
        });
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("retains the stored message if projection encounters conflicting history", async () => {
        await prepareNotice();
        await moveRun();
        const n = (await notices())[0];
        await q(
          "INSERT INTO messages (conversationId,direction,messageType,content,externalId) VALUES (?,'outgoing','text','conflicting',?)",
          [
            source.conversationId,
            `booking-notice:v1:${owner.merchantId}:${n.id}`,
          ]
        );
        await send();
        expect((await notices())[0]).toMatchObject({
          state: "accepted",
          last_error: "projection_conflict",
          projection_message_id: null,
        });
        expect(
          (
            await q("SELECT content FROM messages WHERE externalId=?", [
              `booking-notice:v1:${owner.merchantId}:${n.id}`,
            ])
          )[0].content
        ).toBe("conflicting");
      });
    });
  }
);
