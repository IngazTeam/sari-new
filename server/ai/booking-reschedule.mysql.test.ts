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
  }
);
