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
}));
vi.mock("../_core/googleCalendar", () => ({
  createCalendarEvent: provider.create,
  getCalendarEvent: provider.get,
  validateAndRefreshCredentials: provider.refresh,
  assertCalendarTimeFree: provider.free,
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
import * as readiness from "../db/schema-readiness";

describe.skipIf(!process.env.DATABASE_URL)(
  "booking calendar durable synchronization",
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
    it("records dispatch before one provider call and confirms exact matching acknowledgement", async () => {
      const original = provider.create.getMockImplementation()!;
      provider.create.mockImplementationOnce(async (...args: any[]) => {
        expect((await links())[0].state).toBe("creating");
        return original(...args);
      });
      const input = await command();
      expect(
        (
          await synchronizeBookingCalendar(
            owner.merchantId,
            owner.userId,
            input
          )
        ).state
      ).toBe("synced");
      const [link] = await links();
      expect(link.event_reference).toMatch(/^saribook[a-f0-9]{32}$/);
      expect((await bookings())[0]).toMatchObject({
        id: bookingId,
        google_event_id: link.event_reference,
        status: "confirmed",
        payment_status: "unpaid",
      });
      expect(
        (
          await synchronizeBookingCalendar(
            owner.merchantId,
            owner.userId,
            input
          )
        ).replayed
      ).toBe(true);
      expect(provider.create).toHaveBeenCalledOnce();
      expect(await reviews()).toHaveLength(1);
      const review = await readBookingCalendarReview(
        owner.merchantId,
        bookingId
      );
      expect(review).toMatchObject({
        state: "synced",
        canCreate: false,
        canVerify: true,
      });
      expect(JSON.stringify(review)).not.toContain("synthetic");
      expect(JSON.stringify(review)).not.toContain("customerPhone");
    });
    it.each([
      "status='pending'",
      "status='cancelled'",
      "google_event_id='legacy-event'",
      "customer_agreement_id=NULL",
      "final_price=1",
    ])("blocks invalid creation eligibility: %s", async patch => {
      await q(`UPDATE bookings SET ${patch} WHERE id=?`, [bookingId]);
      await expect(run()).rejects.toThrow();
      expect(provider.create).not.toHaveBeenCalled();
      expect(await links()).toHaveLength(0);
    });
    it.each(["is_active=0", "credentials='{}'", "credentials='invalid'"])(
      "blocks unavailable account: %s",
      async patch => {
        await q(`UPDATE google_integrations SET ${patch} WHERE id=?`, [
          integrationId,
        ]);
        await expect(run()).rejects.toThrow();
        expect(provider.create).not.toHaveBeenCalled();
      }
    );
    it("rejects ambiguous accounts and stale evidence before dispatch", async () => {
      const input = await command();
      await q("UPDATE bookings SET notes='updated' WHERE id=?", [bookingId]);
      await expect(
        synchronizeBookingCalendar(owner.merchantId, owner.userId, input)
      ).rejects.toThrow();
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,credentials,calendar_id,is_active) VALUES (?,'calendar',?,'primary',1)",
        [owner.merchantId, JSON.stringify({ refresh_token: "second" })]
      );
      await expect(run()).rejects.toThrow();
      expect(provider.create).not.toHaveBeenCalled();
    });
    it.each([
      "id",
      "reference",
      "agreement",
      "status",
      "transparent",
      "start",
      "end",
      "offset",
      "all-day",
      "recurrence",
      "recurring",
    ])("holds the slot on invalid provider %s", async field => {
      provider.create.mockImplementationOnce(
        async (_c: any, _t: string, d: any) => {
          const e: any = {
            id: d.id,
            status: "confirmed",
            start: { dateTime: d.start.toISOString() },
            end: { dateTime: d.end.toISOString() },
            extendedProperties: { private: d.privateProperties },
          };
          if (field === "id") e.id = "foreign";
          if (field === "reference")
            e.extendedProperties.private.sariBooking = "foreign";
          if (field === "agreement")
            e.extendedProperties.private.sariAgreement = "999999";
          if (field === "status") e.status = "cancelled";
          if (field === "transparent") e.transparency = "transparent";
          if (field === "start") e.start.dateTime = e.end.dateTime;
          if (field === "end") e.end.dateTime = e.start.dateTime;
          if (field === "offset") e.start.dateTime = "2026-12-20T10:00:00";
          if (field === "all-day") e.start = { date };
          if (field === "recurrence") e.recurrence = ["RRULE:FREQ=DAILY"];
          if (field === "recurring") e.recurringEventId = "other";
          return e;
        }
      );
      expect((await run()).state).toBe("create_unknown");
      expect((await bookings())[0]).toMatchObject({
        status: "confirmed",
        google_event_id: null,
      });
      await expect(
        updateBookingOperation(owner.merchantId, owner.userId, {
          bookingId,
          operationId: randomUUID(),
          expectedStatus: "confirmed",
          status: "cancelled",
        })
      ).rejects.toThrow();
      expect(await reviews()).toHaveLength(1);
    });
    it("recovers unknown creation using GET of the same account and reference only", async () => {
      await unknown();
      provider.get.mockResolvedValue(await active());
      expect((await run("verify")).state).toBe("synced");
      expect(provider.create).toHaveBeenCalledOnce();
      expect(provider.get).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ refresh_token: "synthetic-refresh" }),
        "primary",
        (await links())[0].event_reference
      );
      expect(await reviews()).toHaveLength(2);
    });
    it.each([404, 410, 403, 429, 500])(
      "does not treat provider GET %s as cancellation or permission to repeat POST",
      async status => {
        await unknown();
        provider.get.mockRejectedValueOnce({
          response: { status },
          message: "private token",
        });
        expect((await run("verify")).state).toBe("create_unknown");
        await expect(run()).rejects.toThrow();
        expect(provider.create).toHaveBeenCalledOnce();
        expect((await bookings())[0].status).toBe("confirmed");
        expect(
          JSON.stringify(
            await readBookingCalendarReview(owner.merchantId, bookingId)
          )
        ).not.toContain("private token");
      }
    );
    it.each(["calendar_id='different'", "credentials='{}'", "is_active=0"])(
      "does not read from a replaced or unusable calendar: %s",
      async patch => {
        await unknown();
        await q(`UPDATE google_integrations SET ${patch} WHERE id=?`, [
          integrationId,
        ]);
        await expect(run("verify")).rejects.toThrow();
        expect(provider.get).not.toHaveBeenCalled();
      }
    );
    it("marks a changed account during dispatch unverified without binding it", async () => {
      const original = provider.create.getMockImplementation()!;
      provider.create.mockImplementationOnce(async (...args: any[]) => {
        await q(
          "UPDATE google_integrations SET calendar_id='other' WHERE id=?",
          [integrationId]
        );
        return original(...args);
      });
      expect((await run()).state).toBe("create_unknown");
      expect((await bookings())[0].google_event_id).toBeNull();
      expect((await reviews())[0].failure_code).toBe("binding_changed");
    });
    it("serializes two creation requests before network IO without duplicate POST", async () => {
      const input = await command();
      const results = await Promise.all([
        synchronizeBookingCalendar(owner.merchantId, owner.userId, input),
        synchronizeBookingCalendar(owner.merchantId, owner.userId, input),
      ]);
      expect(results.some(r => r.state === "synced")).toBe(true);
      expect(provider.create).toHaveBeenCalledOnce();
      expect(await links()).toHaveLength(1);
      expect(await reviews()).toHaveLength(1);
    });
    it.each(["actor", "merchant", "booking", "reason", "action"])(
      "rejects request identity reuse with different %s",
      async field => {
        const input = await command();
        await synchronizeBookingCalendar(owner.merchantId, owner.userId, input);
        await expect(
          synchronizeBookingCalendar(
            field === "merchant" ? other.merchantId : owner.merchantId,
            field === "actor" ? other.userId : owner.userId,
            {
              ...input,
              ...(field === "booking"
                ? { bookingId: bookingId + 99999 }
                : field === "reason"
                  ? { reason: "Different operator justification" }
                  : field === "action"
                    ? { action: "verify" as const }
                    : {}),
            }
          )
        ).rejects.toThrow();
        expect(provider.create).toHaveBeenCalledOnce();
      }
    );
    it.each(["dispatch-commit", "result-commit", "audit"])(
      "retains safe recovery after %s failure",
      async failure => {
        const input = await command(),
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
                if (key === "execute" && failure === "audit")
                  return async (sql: string, args: any[]) => {
                    if (
                      sql.startsWith("INSERT INTO booking_calendar_reviews")
                    ) {
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
          synchronizeBookingCalendar(owner.merchantId, owner.userId, input)
        ).rejects.toThrow();
        spy.mockRestore();
        expect(reached).toBe(true);
        const count = provider.create.mock.calls.length;
        expect(
          (
            await synchronizeBookingCalendar(
              owner.merchantId,
              owner.userId,
              input
            )
          ).replayed
        ).toBe(true);
        expect(provider.create).toHaveBeenCalledTimes(count);
        if (failure !== "result-commit") {
          expect((await links())[0].state).toBe("creating");
          expect(
            (await readBookingCalendarReview(owner.merchantId, bookingId))
              .canVerify
          ).toBe(false);
          await q(
            "UPDATE booking_calendar_links SET updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE booking_reference=?",
            [bookingId]
          );
          provider.get.mockResolvedValue(await active());
          expect((await run("verify")).state).toBe("synced");
        }
        expect((await bookings())[0].google_event_id).toBe(
          (await links())[0].event_reference
        );
      }
    );
    it("blocks local cancellation, premature completion, and amendments after calendar binding", async () => {
      await run();
      for (const status of ["cancelled", "no_show"] as const)
        await expect(
          updateBookingOperation(owner.merchantId, owner.userId, {
            bookingId,
            operationId: randomUUID(),
            expectedStatus: "confirmed",
            status,
          })
        ).rejects.toThrow();
      await updateBookingOperation(owner.merchantId, owner.userId, {
        bookingId,
        operationId: randomUUID(),
        expectedStatus: "confirmed",
        status: "in_progress",
      });
      await expect(
        updateBookingOperation(owner.merchantId, owner.userId, {
          bookingId,
          operationId: randomUUID(),
          expectedStatus: "in_progress",
          status: "completed",
        })
      ).rejects.toThrow();
      expect((await bookings())[0].status).toBe("in_progress");
    });
    it("invalidates synchronization when the previously verified event is changed externally", async () => {
      await run();
      provider.get.mockResolvedValue(await active({ status: "cancelled" }));
      expect((await run("verify")).state).toBe("create_unknown");
      expect((await bookings())[0].status).toBe("confirmed");
      await expect(run()).rejects.toThrow();
      expect(provider.create).toHaveBeenCalledOnce();
    });
    it("checks refusal after customer assent before dispatching calendar creation", async () => {
      await incoming("لا تحجز");
      await expect(run()).rejects.toThrow();
      expect(provider.create).not.toHaveBeenCalled();
    });
    it("does not reserve a dispatch or send an event when Google availability is unavailable", async () => {
      provider.free.mockRejectedValueOnce(Error("occupied or unavailable"));
      await expect(run()).rejects.toThrow();
      expect(await links()).toHaveLength(0);
      expect(provider.create).not.toHaveBeenCalled();
      expect((await bookings())[0].google_event_id).toBeNull();
    });
    it("revalidates consent after external availability lookup and before persisting dispatch", async () => {
      provider.free.mockImplementationOnce(async () => {
        await incoming("لا تحجز");
      });
      await expect(run()).rejects.toThrow();
      expect(await links()).toHaveLength(0);
      expect(provider.create).not.toHaveBeenCalled();
    });
    it("prevents overlapping local calendar dispatches for different services on one account", async () => {
      await run();
      const service2 = (
        await q(
          "INSERT INTO services(merchant_id,name,duration_minutes,base_price,advance_booking_days) VALUES (?,'second',60,12500,30)",
          [owner.merchantId]
        )
      ).insertId;
      await q(
        "INSERT INTO booking_time_slots(merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,'10:00','11:00')",
        [owner.merchantId, service2, date]
      );
      const request = await incoming("أريد حجز جديد للخدمة الثانية"),
        quote = await prepareBookingAgreement(
          request,
          selection({ serviceId: service2 })
        );
      await deliver(quote, true, request);
      bookingId = (
        await acceptBookingAgreement(await incoming(), quote.agreementId!)
      ).bookingId!;
      const review = await getBookingConsentReview(owner.merchantId, bookingId);
      await updateBookingOperation(owner.merchantId, owner.userId, {
        bookingId,
        operationId: randomUUID(),
        expectedStatus: "pending",
        status: "confirmed",
        consentReview: {
          agreementId: review.agreementId!,
          evidence: review.evidence!,
          reviewed: true,
        },
      });
      await expect(run()).rejects.toThrow();
      expect(provider.create).toHaveBeenCalledOnce();
      expect(await links()).toHaveLength(1);
    });
    it("retains operator justification before dispatch and notices customer refusal during IO", async () => {
      const original = provider.create.getMockImplementation()!;
      provider.create.mockImplementationOnce(async (...args: any[]) => {
        const link = (await links())[0],
          saved =
            typeof link.payload === "string"
              ? JSON.parse(link.payload)
              : link.payload;
        expect(saved.operatorReason).toBe(
          "Operator reviewed consent and calendar"
        );
        expect(saved.reviewEvidence).toMatch(/^[a-f0-9]{64}$/);
        await incoming("لا تحجز");
        return original(...args);
      });
      expect((await run()).state).toBe("create_unknown");
      expect((await reviews())[0].failure_code).toBe("consent_changed");
      expect((await bookings())[0].google_event_id).toBeNull();
      expect((await bookings())[0].status).toBe("confirmed");
    });
    it("rejects replaying a stale review after another review completed", async () => {
      await unknown();
      const stale = await command("verify");
      provider.get.mockResolvedValue(await active());
      await run("verify");
      await expect(
        synchronizeBookingCalendar(owner.merchantId, owner.userId, stale)
      ).rejects.toThrow();
      expect(provider.get).toHaveBeenCalledOnce();
    });
    it("rejects consented amendment while a provider outcome remains unknown", async () => {
      await unknown();
      const request = await incoming(`عدل الحجز #${bookingId} للساعة 12:00`);
      await q(
        "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,'12:00','13:00')",
        [owner.merchantId, serviceId, date]
      );
      const { prepareBookingAmendment } = await import("./booking-agreements");
      await expect(
        prepareBookingAmendment(
          request,
          selection({ startTime: "12:00" }),
          bookingId
        )
      ).rejects.toThrow();
      expect((await bookings())[0].start_time).toBe("10:00");
      expect(await agreements()).toHaveLength(1);
    });
    it("never exposes another merchant booking or permits unreviewed input", async () => {
      await expect(
        readBookingCalendarReview(other.merchantId, bookingId)
      ).rejects.toThrow();
      await expect(
        synchronizeBookingCalendar(owner.merchantId, owner.userId, {
          ...(await command()),
          reviewed: false,
        } as any)
      ).rejects.toThrow();
      expect(provider.create).not.toHaveBeenCalled();
    });
  }
);
