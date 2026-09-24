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
}));
vi.mock("../_core/googleCalendar", () => ({
  createCalendarEvent: provider.create,
  getCalendarEvent: provider.get,
  validateAndRefreshCredentials: provider.refresh,
  assertCalendarTimeFree: provider.free,
  deleteCalendarEventIfMatch: provider.remove,
}));
import {
  readBookingCalendarReview,
  synchronizeBookingCalendar,
} from "../booking-calendar";
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
import {
  getBookingCancellationReview,
  cancelBookingCalendar,
} from "../booking-cancellation";
const transport = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../channels/whatsapp/providers", () => ({
  getWhatsAppProvider: () => ({ send: transport.send }),
}));
import { enqueueInbound } from "../messaging/inbound-jobs";
import {
  dispatchBookingNotice,
  reconcileBookingNotice,
} from "../booking-reschedule-notification";
import {
  readBookingNoticeReview,
  reviewBookingNotification,
} from "../booking-notification-review";
import { updateWhatsAppDeliveryStatus } from "../channels/whatsapp/service";
import { issueCanonicalBookingPaymentLink } from "../payment/booking-checkout";
import * as db from "../db";
import {
  withBookingCapacityTransaction,
  hasBookingConflict,
} from "../booking-capacity";

describe.skipIf(!process.env.DATABASE_URL)(
  "booking calendar cancellation and recovery",
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
    const unknown = async () => {
      provider.create.mockRejectedValueOnce(Error("private timeout"));
      expect((await run()).state).toBe("create_unknown");
    };
    const cancellations = () =>
      q("SELECT * FROM booking_calendar_cancellations WHERE merchant_id=?", [
        owner.merchantId,
      ]);
    const read = () =>
      getBookingCancellationReview(owner.merchantId, bookingId);
    const cancelCommand = async (action: "cancel" | "verify" = "cancel") => ({
      bookingId,
      requestId: randomUUID(),
      evidence: (await read())!.evidence,
      action,
      reviewed: true as const,
      reason: "Reviewed exact customer cancellation request",
    });
    const cancelRun = async (action: "cancel" | "verify" = "cancel") =>
      cancelBookingCalendar(
        owner.merchantId,
        owner.userId,
        await cancelCommand(action)
      );
    const issue = () =>
      issueCanonicalBookingPaymentLink({
        merchantId: owner.merchantId,
        bookingId,
        amount: 12500,
        title: "Booking payment",
      });
    const conflicted = () =>
      withBookingCapacityTransaction(owner.merchantId, c =>
        hasBookingConflict(c, owner.merchantId, {
          ...selection(),
          staffId: undefined,
          endTime: "11:00",
        })
      );
    beforeEach(async () => {
      await run();
      await incoming(`أريد إلغاء الحجز #${bookingId}`);
      provider.get.mockImplementation(async () => ({
        ...(await active()),
        etag: '"version1"',
      }));
      provider.remove.mockReset().mockResolvedValue(true);
      vi.spyOn(db, "getMerchantPaymentSettings").mockResolvedValue({
        tapEnabled: 1,
        tapTestMode: 1,
        isVerified: 1,
        tapPublicKey: "pk_test_fixture",
        tapSecretKey: "sk_test_fixture",
      } as any);
    });
    const uncertain = async () => {
      provider.remove.mockRejectedValueOnce(Error("private timeout"));
      expect((await cancelRun()).state).toBe("cancel_unknown");
    };
    it("persists request and version before one conditional deletion, then atomically releases capacity", async () => {
      expect(await conflicted()).toBe(true);
      const input = await cancelCommand(),
        original = await read();
      provider.remove.mockImplementationOnce(async (...args: any[]) => {
        const [row] = await cancellations();
        expect(row).toMatchObject({
          state: "cancelling",
          actor_user_id: owner.userId,
          event_etag: '"version1"',
          reason: input.reason,
        });
        expect(JSON.stringify(row.snapshot)).toContain(
          String(original!.request!.id)
        );
        expect((await links())[0].state).toBe("cancelling");
        expect((await bookings())[0].status).toBe("confirmed");
        expect(args.slice(1)).toEqual([
          "primary",
          (await links())[0].event_reference,
          '"version1"',
        ]);
        return true;
      });
      expect(
        await cancelBookingCalendar(owner.merchantId, owner.userId, input)
      ).toEqual({ state: "cancelled", replayed: false });
      expect((await bookings())[0]).toMatchObject({
        status: "cancelled",
        cancelled_by: "customer",
        payment_status: "unpaid",
      });
      expect(
        (await getBookingOperationHistory(owner.merchantId, bookingId))[0]
      ).toMatchObject({ beforeStatus: "confirmed", afterStatus: "cancelled" });
      expect(await conflicted()).toBe(false);
      expect(provider.remove).toHaveBeenCalledOnce();
      expect(
        await cancelBookingCalendar(owner.merchantId, owner.userId, input)
      ).toEqual({ state: "cancelled", replayed: true });
      expect((await read())!.canCancel).toBe(false);
      expect((await read())!.canVerify).toBe(false);
      expect(provider.remove).toHaveBeenCalledOnce();
      expect(JSON.stringify(await read())).not.toMatch(
        /synthetic-refresh|synthetic-access|request_hash|event_etag/
      );
    });
    it.each(["paid", "refunded"])("blocks payment state %s", async status => {
      await q("UPDATE bookings SET payment_status=? WHERE id=?", [
        status,
        bookingId,
      ]);
      expect((await read())!.canCancel).toBe(false);
      await expect(cancelRun()).rejects.toThrow();
      expect(provider.remove).not.toHaveBeenCalled();
    });
    it("blocks even an unused payment link and rechecks issuance during the preflight GET", async () => {
      const input = await cancelCommand();
      provider.get.mockImplementationOnce(async () => {
        await issue();
        return { ...(await active()), etag: '"version1"' };
      });
      await expect(
        cancelBookingCalendar(owner.merchantId, owner.userId, input)
      ).rejects.toThrow();
      expect(await cancellations()).toHaveLength(0);
      expect(provider.remove).not.toHaveBeenCalled();
      expect((await read())!.blocker).toBe("financial");
    });
    it("blocks payment issuance and all local edits after reserving cancellation", async () => {
      provider.remove.mockImplementationOnce(async () => {
        await expect(issue()).rejects.toThrow();
        await expect(
          updateBookingOperation(owner.merchantId, owner.userId, {
            bookingId,
            expectedStatus: "confirmed",
            operationId: randomUUID(),
            notes: "concurrent edit",
          })
        ).rejects.toThrow();
        await expect(run("verify")).rejects.toThrow();
        return true;
      });
      expect((await cancelRun()).state).toBe("cancelled");
      await expect(issue()).rejects.toThrow();
    });
    it.each(["completed", "cancelled", "in_progress", "no_show"])(
      "blocks booking state %s",
      async status => {
        await q("UPDATE bookings SET status=? WHERE id=?", [status, bookingId]);
        expect((await read())!.canCancel).toBe(false);
        await expect(cancelRun()).rejects.toThrow();
        expect(provider.get).not.toHaveBeenCalled();
      }
    );
    it.each([
      "question",
      "negation",
      "other-booking",
      "later-message",
      "old-message",
      "missing-message",
      "foreign-conversation",
    ])("rejects unsupported customer authority %s", async kind => {
      if (kind === "question") await incoming(`هل ألغي الحجز #${bookingId}؟`);
      if (kind === "negation")
        await incoming(`لا أريد إلغاء الحجز #${bookingId}`);
      if (kind === "other-booking")
        await incoming(`أريد إلغاء الحجز #${bookingId + 1}`);
      if (kind === "later-message") await incoming("خلاص احتفظ بالموعد");
      if (kind === "old-message")
        await q(
          "UPDATE messages SET createdAt=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY) WHERE conversationId=?",
          [source.conversationId]
        );
      if (kind === "missing-message")
        await q(
          "DELETE FROM messages WHERE conversationId=? AND content LIKE 'أريد إلغاء%'",
          [source.conversationId]
        );
      if (kind === "foreign-conversation")
        await q("UPDATE conversations SET merchantId=? WHERE id=?", [
          other.merchantId,
          source.conversationId,
        ]);
      expect((await read())!.canCancel).toBe(false);
      await expect(cancelRun()).rejects.toThrow();
      expect(provider.remove).not.toHaveBeenCalled();
    });
    it.each([
      "identity",
      "time",
      "etag",
      "account",
      "missing",
      "inactive",
      "recurring",
    ])("rejects unsafe external preflight %s without dispatch", async kind => {
      if (kind === "account")
        await q("UPDATE google_integrations SET credentials=? WHERE id=?", [
          JSON.stringify({ refresh_token: "different" }),
          integrationId,
        ]);
      else if (kind === "missing")
        provider.get.mockRejectedValueOnce({ response: { status: 404 } });
      else
        provider.get.mockResolvedValueOnce({
          ...(await active()),
          etag: '"version1"',
          ...(kind === "identity"
            ? { id: "foreign" }
            : kind === "time"
              ? { start: { dateTime: "2026-01-01T00:00:00Z" } }
              : kind === "etag"
                ? { etag: "*" }
                : kind === "inactive"
                  ? { status: "cancelled" }
                  : { recurrence: [] }),
        });
      await expect(cancelRun()).rejects.toThrow();
      expect(await cancellations()).toHaveLength(0);
      expect(provider.remove).not.toHaveBeenCalled();
    });
    it("rechecks customer request after preflight before any irreversible effect", async () => {
      provider.get.mockImplementationOnce(async () => {
        await incoming("لا تلغي الموعد");
        return { ...(await active()), etag: '"version1"' };
      });
      await expect(cancelRun()).rejects.toThrow();
      expect(await cancellations()).toHaveLength(0);
      expect(provider.remove).not.toHaveBeenCalled();
    });
    it("keeps capacity when the customer retracts during DELETE and later GET proves deletion", async () => {
      provider.remove.mockImplementationOnce(async () => {
        await incoming("لا تلغي الموعد");
        return true;
      });
      expect((await cancelRun()).state).toBe("cancel_unknown");
      provider.get.mockResolvedValue({
        id: (await links())[0].event_reference,
        status: "cancelled",
      });
      expect((await cancelRun("verify")).state).toBe("cancel_unknown");
      expect((await cancellations())[0].failure_code).toBe("request_changed");
      expect((await bookings())[0].status).toBe("confirmed");
      expect(await conflicted()).toBe(true);
      expect(provider.remove).toHaveBeenCalledOnce();
    });
    it.each([
      "404",
      "410",
      "403",
      "timeout",
      "active",
      "foreign",
      "empty",
      "recurring",
    ])("never releases an unknown cancellation from GET %s", async kind => {
      await uncertain();
      const input = await cancelCommand("verify");
      if (["404", "410", "403", "timeout"].includes(kind))
        provider.get.mockRejectedValueOnce({
          response: { status: Number(kind) },
        });
      else
        provider.get.mockResolvedValueOnce(
          kind === "empty"
            ? {}
            : {
                id:
                  kind === "foreign"
                    ? "foreign"
                    : (await links())[0].event_reference,
                status: kind === "active" ? "confirmed" : "cancelled",
                ...(kind === "recurring" ? { recurringEventId: "parent" } : {}),
              }
        );
      expect(
        (await cancelBookingCalendar(owner.merchantId, owner.userId, input))
          .state
      ).toBe("cancel_unknown");
      expect((await bookings())[0].status).toBe("confirmed");
      expect(await conflicted()).toBe(true);
      expect(provider.remove).toHaveBeenCalledOnce();
      const count = provider.get.mock.calls.length;
      expect(
        (await cancelBookingCalendar(owner.merchantId, owner.userId, input))
          .replayed
      ).toBe(true);
      expect(provider.get).toHaveBeenCalledTimes(count);
    });
    it("recovers only a cancelled tombstone at the original reference, without a second DELETE", async () => {
      await uncertain();
      provider.get.mockResolvedValueOnce({
        id: (await links())[0].event_reference,
        status: "cancelled",
      });
      expect((await cancelRun("verify")).state).toBe("cancelled");
      expect((await bookings())[0].status).toBe("cancelled");
      expect(provider.remove).toHaveBeenCalledOnce();
    });
    it("does not retry a failed conditional deletion", async () => {
      provider.remove.mockRejectedValueOnce({ response: { status: 412 } });
      expect((await cancelRun()).state).toBe("cancel_unknown");
      await expect(cancelRun()).rejects.toThrow();
      expect((await cancelRun("verify")).state).toBe("cancel_unknown");
      expect(provider.remove).toHaveBeenCalledOnce();
    });
    it("serializes duplicate and competing cancellations across the durable dispatch", async () => {
      const input = await cancelCommand();
      const results = await Promise.allSettled([
        cancelBookingCalendar(owner.merchantId, owner.userId, input),
        cancelBookingCalendar(owner.merchantId, owner.userId, input),
        cancelBookingCalendar(owner.merchantId, owner.userId, {
          ...input,
          requestId: randomUUID(),
        }),
      ]);
      expect(
        results.some(
          r => r.status === "fulfilled" && r.value.state === "cancelled"
        )
      ).toBe(true);
      expect(provider.remove).toHaveBeenCalledOnce();
      expect(await cancellations()).toHaveLength(1);
    });
    it.each(["actor", "booking", "reason", "action"])(
      "rejects dispatch UUID reuse with changed %s",
      async field => {
        const input = await cancelCommand();
        await cancelBookingCalendar(owner.merchantId, owner.userId, input);
        await expect(
          cancelBookingCalendar(
            owner.merchantId,
            field === "actor" ? other.userId : owner.userId,
            {
              ...input,
              ...(field === "booking"
                ? { bookingId: bookingId + 1 }
                : field === "reason"
                  ? { reason: "A different operator review" }
                  : field === "action"
                    ? { action: "verify" as const }
                    : {}),
            }
          )
        ).rejects.toThrow();
        expect(provider.remove).toHaveBeenCalledOnce();
      }
    );
    it.each(["dispatch-commit", "result-commit", "audit", "operation-audit"])(
      "recovers safely after %s failure",
      async failure => {
        const input = await cancelCommand(),
          pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        let commits = 0,
          reached = false;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await original(), {
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
                      (failure === "audit" &&
                        sql.startsWith(
                          "INSERT INTO booking_calendar_reviews"
                        )) ||
                      (failure === "operation-audit" &&
                        sql.startsWith("INSERT INTO booking_operation_audits"))
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
          cancelBookingCalendar(owner.merchantId, owner.userId, input)
        ).rejects.toThrow();
        spy.mockRestore();
        expect(reached).toBe(true);
        const deletes = provider.remove.mock.calls.length;
        expect(
          (await cancelBookingCalendar(owner.merchantId, owner.userId, input))
            .replayed
        ).toBe(true);
        expect(provider.remove).toHaveBeenCalledTimes(deletes);
        if (failure !== "result-commit") {
          expect((await cancellations())[0].state).toBe("cancelling");
          expect((await bookings())[0].status).toBe("confirmed");
          expect((await read())!.canVerify).toBe(false);
          await q(
            "UPDATE booking_calendar_cancellations SET updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE booking_reference=?",
            [bookingId]
          );
          provider.get.mockResolvedValueOnce({
            id: (await links())[0].event_reference,
            status: "cancelled",
          });
          expect((await cancelRun("verify")).state).toBe("cancelled");
        }
        expect((await bookings())[0].status).toBe("cancelled");
        expect(provider.remove).toHaveBeenCalledTimes(deletes);
      }
    );
    it("does not let a late DELETE response overwrite a newer recovery", async () => {
      let entered!: () => void, finish!: (v: boolean) => void;
      const ready = new Promise<void>(r => (entered = r));
      provider.remove.mockImplementationOnce(() => {
        entered();
        return new Promise(r => (finish = r));
      });
      const input = await cancelCommand(),
        pending = cancelBookingCalendar(owner.merchantId, owner.userId, input);
      const result = pending.then(
        value => ({ value }),
        error => ({ error })
      );
      await ready;
      await q(
        "UPDATE booking_calendar_cancellations SET updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE booking_reference=?",
        [bookingId]
      );
      provider.get.mockResolvedValueOnce({
        id: (await links())[0].event_reference,
        status: "cancelled",
      });
      expect((await cancelRun("verify")).state).toBe("cancelled");
      finish(true);
      expect(await result).toHaveProperty("error");
      expect((await cancellations())[0].revision).toBe(1);
      expect((await bookings())[0].status).toBe("cancelled");
      expect(
        (await cancelBookingCalendar(owner.merchantId, owner.userId, input))
          .state
      ).toBe("cancelled");
      expect(provider.remove).toHaveBeenCalledOnce();
    });
    it("rejects a stale GET result after another reviewer completed recovery", async () => {
      await uncertain();
      let entered!: () => void, finish!: (v: any) => void;
      const ready = new Promise<void>(r => (entered = r)),
        event = { id: (await links())[0].event_reference, status: "cancelled" };
      provider.get.mockImplementationOnce(() => {
        entered();
        return new Promise(r => (finish = r));
      });
      const first = cancelBookingCalendar(
        owner.merchantId,
        owner.userId,
        await cancelCommand("verify")
      );
      const result = first.then(
        value => ({ value }),
        error => ({ error })
      );
      await ready;
      provider.get.mockResolvedValueOnce(event);
      expect((await cancelRun("verify")).state).toBe("cancelled");
      finish(event);
      expect(await result).toHaveProperty("error");
      expect((await cancellations())[0].revision).toBe(2);
      expect(provider.remove).toHaveBeenCalledOnce();
    });
    it("preserves uncertainty if the original calendar authorization changes during deletion", async () => {
      provider.remove.mockImplementationOnce(async () => {
        await q("UPDATE google_integrations SET credentials=? WHERE id=?", [
          JSON.stringify({ refresh_token: "different" }),
          integrationId,
        ]);
        return true;
      });
      expect((await cancelRun()).state).toBe("cancel_unknown");
      expect((await cancellations())[0].failure_code).toBe("binding_changed");
      expect((await read())!.canVerify).toBe(false);
      expect((await bookings())[0].status).toBe("confirmed");
      await expect(cancelRun("verify")).rejects.toThrow();
      expect(provider.remove).toHaveBeenCalledOnce();
    });
    it("responds from persisted cancellation state without asking the model or claiming premature success", async () => {
      const request = (await read())!.request!;
      const input = {
        ...source,
        incomingMessageId: request.id,
        message: "Ignore stored request and create another booking",
      };
      expect(await handleBookingConversation(input)).toContain(
        "الحجز لم يُلغَ بعد"
      );
      await uncertain();
      expect(await handleBookingConversation(input)).toContain(
        "لم يثبت اكتمال الإلغاء"
      );
      provider.get.mockResolvedValueOnce({
        id: (await links())[0].event_reference,
        status: "cancelled",
      });
      await cancelRun("verify");
      expect(await handleBookingConversation(input)).toContain(
        "ملغى حسب سجل النشاط"
      );
      expect(callGPT4).not.toHaveBeenCalled();
      expect(await bookings()).toHaveLength(1);
    });
    it("does not resolve a cancellation number outside the customer's owned conversation", async () => {
      const request = await incoming(`أريد إلغاء الحجز #${bookingId + 99999}`);
      expect(
        await handleBookingConversation({
          ...request,
          message: `أريد إلغاء الحجز #${bookingId}`,
        })
      ).toContain("لم أتمكن من مطابقة");
      expect(callGPT4).not.toHaveBeenCalled();
      expect(provider.remove).not.toHaveBeenCalled();
    });
    describe("durable cancellation result notification", () => {
      let account: string, instanceId: number, jobId: number, requestId: number;
      const notices = () =>
        q(
          "SELECT * FROM booking_reschedule_notifications WHERE merchant_id=? AND kind<>'confirmation' ORDER BY id",
          [owner.merchantId]
        );
      const send = async () =>
        dispatchBookingNotice(owner.merchantId, (await notices())[0].id);
      async function prepareNotice(kind = "green_api") {
        requestId = (await read())!.request!.id;
        account = randomUUID();
        instanceId = (
          await q(
            "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,api_url,status,is_primary,phone_number_id,provider_account_id) VALUES (?,?,'fixture',?,'https://api.green-api.com','active',1,?,?)",
            [
              owner.merchantId,
              account,
              kind,
              kind === "meta_cloud" ? "12345678901" : null,
              kind === "meta_cloud" ? "12345678902" : null,
            ]
          )
        ).insertId;
        const { id } = await enqueueInbound({
          source: kind === "meta_cloud" ? "meta" : "webhook",
          payload: {
            typeWebhook: "incomingMessageReceived",
            instanceData: { idInstance: account },
            idMessage: randomUUID(),
            timestamp: Math.floor(Date.now() / 1000),
            senderData: { chatId: `${phone}@c.us` },
            messageData: {
              typeMessage: "textMessage",
              textMessageData: {
                textMessage: `أريد إلغاء الحجز #${bookingId}`,
              },
            },
          },
        });
        jobId = id;
        const job = (
          await q("SELECT event_key FROM whatsapp_inbound_jobs WHERE id=?", [
            id,
          ])
        )[0];
        await q("UPDATE messages SET externalId=? WHERE id=?", [
          `inbound:v1:${job.event_key}`,
          requestId,
        ]);
        await q(
          "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE id=?",
          [id]
        );
      }
      const ready = async () => {
        await prepareNotice();
        await cancelRun();
      };
      const reviewCommand = async () => {
        const n = (await read())!.notification!;
        return {
          bookingId,
          notificationId: n.id,
          evidence: n.evidence,
          requestId: randomUUID(),
          reviewed: true as const,
          reason: "Operator checked cancellation delivery receipt",
        };
      };
      beforeEach(() => {
        transport.send.mockReset().mockImplementation(async () => ({
          accepted: true,
          outcome: "accepted",
          status: "sent",
          providerMessageId: randomUUID(),
        }));
      });
      it.each(["green_api", "meta_cloud"])(
        "enqueues and sends one truthful cancellation through the original %s channel",
        async kind => {
          await prepareNotice(kind);
          const input = await cancelCommand();
          await cancelBookingCalendar(owner.merchantId, owner.userId, input);
          const [n] = await notices();
          expect(n).toMatchObject({
            kind: "cancellation",
            reschedule_id: null,
            cancellation_id: (await cancellations())[0].id,
            state: "pending",
          });
          expect(n.dispatch_text).toContain(`تم إلغاء حجزك #${bookingId}`);
          expect(n.dispatch_text).toContain(`${date}، من 10:00 إلى 11:00`);
          expect(n.dispatch_text).not.toMatch(/استرداد|refund|خصم|تم نقل/);
          await cancelBookingCalendar(owner.merchantId, owner.userId, input);
          await Promise.all(Array.from({ length: 6 }, () => send()));
          expect(await notices()).toHaveLength(1);
          expect(transport.send).toHaveBeenCalledTimes(1);
          const [config, sent] = transport.send.mock.calls[0];
          expect(config.provider).toBe(kind);
          expect(sent.to).toBe(phone);
          expect(sent.instanceRecordId).toBe(instanceId);
          expect(sent.text).toBe(n.dispatch_text);
          expect((await read())!.notification!).toMatchObject({
            kind: "cancellation",
            state: "accepted",
            delivery: "sent",
            projected: true,
          });
          expect(
            await withBookingCapacityTransaction(owner.merchantId, c =>
              readBookingNoticeReview(c, owner.merchantId, n.cancellation_id)
            )
          ).toBeNull();
        }
      );
      it("does not enqueue a success while cancellation is uncertain", async () => {
        await prepareNotice();
        await uncertain();
        expect(await notices()).toHaveLength(0);
        expect(transport.send).not.toHaveBeenCalled();
      });
      it("enqueues after GET-only recovery without repeating DELETE", async () => {
        await prepareNotice();
        await uncertain();
        provider.get.mockResolvedValue({
          id: (await links())[0].event_reference,
          status: "cancelled",
        });
        await cancelRun("verify");
        expect(await notices()).toHaveLength(1);
        await send();
        expect(transport.send).toHaveBeenCalledTimes(1);
        expect(provider.remove).toHaveBeenCalledTimes(1);
      });
      it("rolls back cancellation completion if the notification cannot be saved and recovers without another DELETE", async () => {
        await prepareNotice();
        const pool = (await getPool())!,
          get = pool.getConnection.bind(pool);
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await get(), {
              get(target, key) {
                if (key === "execute")
                  return async (sql: any, args: any) => {
                    if (
                      String(sql).includes(
                        "INSERT INTO booking_reschedule_notifications"
                      )
                    )
                      throw Error("outbox unavailable");
                    return target.execute(sql, args);
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
        );
        try {
          await expect(cancelRun()).rejects.toThrow();
        } finally {
          spy.mockRestore();
        }
        expect((await bookings())[0].status).toBe("confirmed");
        expect(await notices()).toHaveLength(0);
        expect(provider.remove).toHaveBeenCalledTimes(1);
        await q(
          "UPDATE booking_calendar_cancellations SET updated_at=TIMESTAMPADD(MINUTE,-3,UTC_TIMESTAMP(3)) WHERE merchant_id=?",
          [owner.merchantId]
        );
        provider.get.mockResolvedValue({
          id: (await links())[0].event_reference,
          status: "cancelled",
        });
        await cancelRun("verify");
        await send();
        expect(provider.remove).toHaveBeenCalledTimes(1);
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("keeps unproven source channels for review without guessing a primary account", async () => {
        await cancelRun();
        expect((await notices())[0].state).toBe("manual_review");
        await send();
        expect(transport.send).not.toHaveBeenCalled();
      });
      it("waits for the original cancellation reply to finish", async () => {
        await ready();
        await q(
          "UPDATE whatsapp_inbound_jobs SET status='running' WHERE id=?",
          [jobId]
        );
        await send();
        expect((await notices())[0].state).toBe("pending");
        expect(transport.send).not.toHaveBeenCalled();
        await q(
          "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE id=?",
          [jobId]
        );
        await send();
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it.each(["review", "dismissed"])(
        "suppresses when the source reply is %s",
        async state => {
          await ready();
          await q("UPDATE whatsapp_inbound_jobs SET status=? WHERE id=?", [
            state,
            jobId,
          ]);
          await send();
          expect((await notices())[0].state).toBe("suppressed");
          expect(transport.send).not.toHaveBeenCalled();
        }
      );
      it.each([
        "new-message",
        "takeover",
        "handoff-version",
        "automation-floor",
        "conversation-phone",
        "booking-phone",
        "account",
        "merchant",
        "expired-source",
        "changed-source",
        "withdrawn",
        "booking-reopened",
        "calendar",
        "cancellation",
        "snapshot",
        "text",
        "price",
        "paid",
        "event",
      ])("suppresses changed %s before dispatch", async change => {
        await ready();
        if (change === "new-message") await incoming("انتظر");
        if (change === "takeover")
          await q("UPDATE conversations SET human_takeover=1 WHERE id=?", [
            source.conversationId,
          ]);
        if (change === "handoff-version")
          await q(
            "UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?",
            [source.conversationId]
          );
        if (change === "automation-floor")
          await q(
            "UPDATE conversations SET automation_after_message_id=? WHERE id=?",
            [requestId, source.conversationId]
          );
        if (change === "conversation-phone")
          await q(
            "UPDATE conversations SET customerPhone='966500000091' WHERE id=?",
            [source.conversationId]
          );
        if (change === "booking-phone")
          await q(
            "UPDATE bookings SET customer_phone='966500000091' WHERE id=?",
            [bookingId]
          );
        if (change === "account")
          await q("UPDATE whatsapp_instances SET instance_id=? WHERE id=?", [
            randomUUID(),
            instanceId,
          ]);
        if (change === "merchant")
          await q("UPDATE merchants SET status='suspended' WHERE id=?", [
            owner.merchantId,
          ]);
        if (change === "expired-source")
          await q(
            "UPDATE messages SET createdAt=TIMESTAMPADD(HOUR,-25,UTC_TIMESTAMP()) WHERE id=?",
            [requestId]
          );
        if (change === "changed-source")
          await q("UPDATE messages SET content='لا تلغي الحجز' WHERE id=?", [
            requestId,
          ]);
        if (change === "withdrawn")
          await q(
            "INSERT INTO campaign_consent_state (merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,?,'withdrawn','v1','test',REPEAT('a',64),UTC_TIMESTAMP(3))",
            [owner.merchantId, phone]
          );
        if (change === "booking-reopened")
          await q("UPDATE bookings SET status='confirmed' WHERE id=?", [
            bookingId,
          ]);
        if (change === "calendar")
          await q(
            "UPDATE booking_calendar_links SET state='synced' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "cancellation")
          await q(
            "UPDATE booking_calendar_cancellations SET state='cancel_unknown' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "snapshot")
          await q(
            "UPDATE booking_reschedule_notifications SET snapshot=JSON_SET(snapshot,'$.commitment.payload.startTime','09:00') WHERE merchant_id=? AND kind<>'confirmation'",
            [owner.merchantId]
          );
        if (change === "text")
          await q(
            "UPDATE booking_reschedule_notifications SET dispatch_text='forged text' WHERE merchant_id=? AND kind<>'confirmation'",
            [owner.merchantId]
          );
        if (change === "price")
          await q("UPDATE bookings SET final_price=final_price+1 WHERE id=?", [
            bookingId,
          ]);
        if (change === "paid")
          await q("UPDATE bookings SET payment_status='paid' WHERE id=?", [
            bookingId,
          ]);
        if (change === "event")
          await q(
            "UPDATE booking_calendar_links SET event_reference='forged-event' WHERE merchant_id=?",
            [owner.merchantId]
          );
        await send();
        expect(transport.send).not.toHaveBeenCalled();
        expect((await notices())[0].state).toBe("suppressed");
      });
      it("rechecks current authority after delivery reservation", async () => {
        await ready();
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
        try {
          await send();
        } finally {
          spy.mockRestore();
        }
        expect(transport.send).not.toHaveBeenCalled();
        expect((await notices())[0].state).toBe("failed");
      });
      it.each(["unknown", "failed", "missing-id"])(
        "never retries a %s provider result",
        async result => {
          await ready();
          if (result === "unknown")
            transport.send.mockRejectedValueOnce(Error("lost response"));
          else
            transport.send.mockResolvedValueOnce(
              result === "failed"
                ? { accepted: false, outcome: "rejected", status: "failed" }
                : { accepted: true, status: "sent" }
            );
          await send();
          await send();
          await reconcileBookingNotice(
            owner.merchantId,
            (await notices())[0].id
          );
          expect(transport.send).toHaveBeenCalledTimes(1);
          expect((await notices())[0].state).toBe(
            result === "failed" ? "failed" : "unknown"
          );
        }
      );
      it("keeps delivered and read distinct and reviews the receipt without resending", async () => {
        await ready();
        await send();
        const n = (await notices())[0];
        for (const status of ["delivered", "read"] as const) {
          await updateWhatsAppDeliveryStatus({
            provider: "green_api",
            providerAccount: account,
            providerMessageId: n.provider_message_id,
            status,
          });
          await reconcileBookingNotice(owner.merchantId, n.id);
          expect((await read())!.notification!.delivery).toBe(status);
        }
        const input = await reviewCommand();
        await reviewBookingNotification(owner.merchantId, owner.userId, input);
        await reviewBookingNotification(owner.merchantId, owner.userId, input);
        expect((await read())!.notification!.history).toHaveLength(1);
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("recovers missing projection from the exact receipt and rejects cross-tenant reviews", async () => {
        await ready();
        await send();
        const n = (await notices())[0];
        await q("DELETE FROM messages WHERE id=?", [n.projection_message_id]);
        const input = await reviewCommand();
        await expect(
          reviewBookingNotification(other.merchantId, other.userId, input)
        ).rejects.toThrow();
        await reviewBookingNotification(owner.merchantId, owner.userId, input);
        expect((await read())!.notification!.projected).toBe(true);
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("rejects stale notification evidence after a delivery update", async () => {
        await ready();
        await send();
        const input = await reviewCommand(),
          n = (await notices())[0];
        await updateWhatsAppDeliveryStatus({
          provider: "green_api",
          providerAccount: account,
          providerMessageId: n.provider_message_id,
          status: "read",
        });
        await expect(
          reviewBookingNotification(owner.merchantId, owner.userId, input)
        ).rejects.toThrow();
        expect(transport.send).toHaveBeenCalledTimes(1);
      });
      it("retains an uncertain claim if commit acknowledgement is lost", async () => {
        await ready();
        const pool = (await getPool())!,
          get = pool.getConnection.bind(pool);
        let lost = false;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await get(), {
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
          await expect(send()).rejects.toThrow();
        } finally {
          spy.mockRestore();
        }
        await send();
        await reconcileBookingNotice(owner.merchantId, (await notices())[0].id);
        expect(transport.send).not.toHaveBeenCalled();
        expect((await notices())[0].state).toBe("unknown");
      });
      it("keeps the original source account when the merchant switches the primary account", async () => {
        await ready();
        await q("UPDATE whatsapp_instances SET is_primary=0 WHERE id=?", [
          instanceId,
        ]);
        await q(
          "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,api_url,status,is_primary) VALUES (?,?,'fixture','green_api','https://api.green-api.com','active',1)",
          [owner.merchantId, randomUUID()]
        );
        await send();
        expect(transport.send.mock.calls[0][1].instanceRecordId).toBe(
          instanceId
        );
      });
    });
    it("blocks cross-tenant reads and writes", async () => {
      const input = await cancelCommand();
      await expect(
        getBookingCancellationReview(other.merchantId, bookingId)
      ).rejects.toThrow();
      await expect(
        cancelBookingCalendar(other.merchantId, other.userId, input)
      ).rejects.toThrow();
      expect(provider.remove).not.toHaveBeenCalled();
    });
  }
);
