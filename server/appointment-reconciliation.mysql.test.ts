import { randomUUID } from "node:crypto";
import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const provider = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("./_core/googleCalendar", () => ({
  getCalendarEvent: provider.get,
  createCalendarEvent: provider.create,
  deleteCalendarEvent: provider.remove,
  validateAndRefreshCredentials: provider.refresh,
}));
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { reserveAppointment } from "./appointment-booking";
import { bookCalendarAppointment as bookCalendarRequest } from "./appointment-calendar";
import {
  readAppointmentReview,
  reconcileAppointment,
} from "./appointment-reconciliation";
import { readCalendarAppointments } from "./calendar-read";
import { createAtomicBooking } from "./booking-capacity";
import * as readiness from "./db/schema-readiness";

describe.skipIf(!process.env.DATABASE_URL)(
  "appointment reconciliation on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      serviceId: number,
      integrationId: number;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const input = () => ({
      merchantId: owner.merchantId,
      serviceId,
      customerPhone: "966500987654",
      customerName: "Test",
      appointmentDate: "2026-12-20",
      startTime: "10:00",
    });
    const bookCalendarAppointment = (data: ReturnType<typeof input>) =>
      bookCalendarRequest(data, {
        requestId: randomUUID(),
        actorUserId: owner.userId,
      });
    const row = async (id: number) =>
      (await q("SELECT * FROM appointments WHERE id=?", [id]))[0];
    const audits = () =>
      q(
        "SELECT * FROM appointment_calendar_reviews WHERE merchant_id=? ORDER BY revision",
        [owner.merchantId]
      );
    const occupied = () =>
      createAtomicBooking({
        merchantId: owner.merchantId,
        serviceId,
        customerPhone: "966500987654",
        bookingDate: "2026-12-20",
        startTime: "10:00",
        endTime: "11:00",
        durationMinutes: 60,
        basePrice: 10000,
        finalPrice: 10000,
      });
    const pending = async (state = "create_unknown") => {
      const value = await reserveAppointment(input(), true);
      await q(
        "UPDATE appointments SET calendar_sync_state=?,updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE id=?",
        [state, value.appointmentId]
      );
      return value.appointmentId;
    };
    const active = async (id: number, patch: any = {}) => {
      const appointment = await row(id);
      return {
        id: appointment.google_event_id || appointment.calendar_event_reference,
        status: "confirmed",
        summary: "Test - Test",
        description: "Phone: 966500987654",
        start: { dateTime: "2026-12-20T10:00:00+03:00" },
        end: { dateTime: "2026-12-20T11:00:00+03:00" },
        extendedProperties: {
          private: { sariAppointment: appointment.calendar_event_reference },
        },
        ...patch,
      };
    };
    const command = async (id: number, patch: any = {}) => {
      const data = await readAppointmentReview(owner.merchantId, id);
      return {
        appointmentId: id,
        requestId: randomUUID(),
        evidence: data.evidence,
        eventId: data.eventId,
        action: "restore_sync" as const,
        reason: "Operator reviewed this appointment",
        reviewed: true as const,
        bindingReviewed: false,
        ...patch,
      };
    };
    const run = async (id: number, patch: any = {}) =>
      reconcileAppointment(
        owner.merchantId,
        owner.userId,
        await command(id, patch)
      );
    beforeEach(async () => {
      vi.resetAllMocks();
      owner = await createDisposableMerchant("calendar-review");
      other = await createDisposableMerchant("other-calendar-review");
      serviceId = (
        await q(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Test',60,10000)",
          [owner.merchantId]
        )
      ).insertId;
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
      provider.refresh.mockImplementation(async value => value);
      provider.create.mockImplementation(async (_c, _id, event) => ({
        id: event.id,
      }));
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);
    it("stores a provider reference before POST and sends the matching private property", async () => {
      const result = await bookCalendarAppointment(input());
      const appointment = await row(result.appointmentId);
      expect(appointment.calendar_event_reference).toMatch(
        /^sariappt[0-9a-f]{32}$/
      );
      expect(provider.create).toHaveBeenCalledWith(
        expect.anything(),
        "primary",
        expect.objectContaining({
          id: appointment.calendar_event_reference,
          privateProperties: {
            sariAppointment: appointment.calendar_event_reference,
          },
        })
      );
    });
    it("restores an unknown creation with matching provider identity and an atomic audit", async () => {
      const id = await pending();
      provider.get.mockResolvedValue(await active(id));
      expect(await run(id)).toEqual({
        outcome: "verified_active",
        failureCode: null,
      });
      expect(await row(id)).toMatchObject({
        calendar_sync_state: "synced",
        calendar_review_revision: 1,
      });
      const logs = await audits();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actor_user_id: owner.userId,
        outcome: "verified_active",
      });
      expect(JSON.stringify(logs)).not.toMatch(
        /synthetic-refresh|synthetic-access|966500987654/
      );
      await expect(occupied()).rejects.toThrow();
      expect(provider.create).not.toHaveBeenCalled();
      expect(provider.remove).not.toHaveBeenCalled();
    });
    it("replays the same request after success without another provider read or audit", async () => {
      const id = await pending(),
        cmd = await command(id);
      provider.get.mockResolvedValue(await active(id));
      const first = await reconcileAppointment(
        owner.merchantId,
        owner.userId,
        cmd
      );
      expect(
        await reconcileAppointment(owner.merchantId, owner.userId, cmd)
      ).toEqual(first);
      expect(provider.get).toHaveBeenCalledOnce();
      expect(await audits()).toHaveLength(1);
      await expect(
        reconcileAppointment(owner.merchantId, other.userId, cmd)
      ).rejects.toThrow();
      await expect(
        reconcileAppointment(owner.merchantId, owner.userId, {
          ...cmd,
          reason: "A different operation reason",
        })
      ).rejects.toThrow();
    });
    it.each([
      "foreign_event",
      "wrong_reference",
      "wrong_time",
      "all_day",
      "no_offset",
      "tentative",
      "transparent",
      "recurring",
    ])("holds capacity for %s evidence", async kind => {
      const id = await pending();
      const event = await active(id);
      if (kind === "foreign_event") event.id = "other-event";
      if (kind === "wrong_reference")
        event.extendedProperties.private.sariAppointment = "other";
      if (kind === "wrong_time")
        event.start.dateTime = "2026-12-20T12:00:00+03:00";
      if (kind === "all_day") event.start = { date: "2026-12-20" } as any;
      if (kind === "no_offset") event.start.dateTime = "2026-12-20T10:00:00";
      if (kind === "tentative") event.status = "tentative";
      if (kind === "transparent") event.transparency = "transparent";
      if (kind === "recurring") event.recurringEventId = "recurring";
      provider.get.mockResolvedValue(event);
      expect((await run(id)).outcome).toBe("unverified");
      expect((await row(id)).calendar_sync_state).toBe("create_unknown");
      expect(await audits()).toHaveLength(1);
      await expect(occupied()).rejects.toThrow();
    });
    it.each([404, 410, 429, 500, "timeout"])(
      "does not release a reservation on %s",
      async code => {
        const id = await pending();
        provider.get.mockRejectedValue(
          Object.assign(Error("private provider response"), { code })
        );
        expect(await run(id)).toEqual({
          outcome: "unverified",
          failureCode: "provider_unavailable",
        });
        await expect(occupied()).rejects.toThrow();
        expect((await audits())[0].failure_code).toBe("provider_unavailable");
      }
    );
    it("rejects a supplied event identifier that differs from the saved reference before GET", async () => {
      const id = await pending();
      await expect(run(id, { eventId: "other-event" })).rejects.toThrow();
      expect(provider.get).not.toHaveBeenCalled();
    });
    it.each(["creating", "cancelling"])(
      "does not take over a recent %s operation",
      async state => {
        const id = await pending(state);
        await q(
          "UPDATE appointments SET google_event_id=calendar_event_reference,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [id]
        );
        const data = await readAppointmentReview(owner.merchantId, id);
        expect(data.blocked).toBe("in_flight");
        await expect(
          run(id, {
            action:
              state === "creating" ? "restore_sync" : "confirm_cancellation",
          })
        ).rejects.toThrow();
        expect(provider.get).not.toHaveBeenCalled();
      }
    );
    it("can restore a stalled creation after the safety delay without another POST", async () => {
      const id = await pending("creating");
      provider.get.mockResolvedValue(await active(id));
      expect((await run(id)).outcome).toBe("verified_active");
      expect(provider.create).not.toHaveBeenCalled();
    });
    it.each(["cancelling", "cancel_unknown"])(
      "releases %s only after fetching cancellation of the bound event",
      async state => {
        const id = await pending(state);
        await q(
          "UPDATE appointments SET google_event_id=calendar_event_reference,updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 MINUTE) WHERE id=?",
          [id]
        );
        provider.get.mockResolvedValue({
          id: (await row(id)).google_event_id,
          status: "cancelled",
        });
        expect(
          (await run(id, { action: "confirm_cancellation" })).outcome
        ).toBe("verified_cancelled");
        expect(await row(id)).toMatchObject({
          status: "cancelled",
          calendar_sync_state: "cancelled",
        });
        await occupied();
        expect(provider.remove).not.toHaveBeenCalled();
      }
    );
    it("a still-active event does not prove cancellation", async () => {
      const id = await pending("cancel_unknown");
      await q(
        "UPDATE appointments SET google_event_id=calendar_event_reference WHERE id=?",
        [id]
      );
      provider.get.mockResolvedValue(await active(id));
      expect(
        (await run(id, { action: "confirm_cancellation" })).failureCode
      ).toBe("cancellation_unconfirmed");
      await expect(occupied()).rejects.toThrow();
    });
    it.each(["account", "calendar", "disconnected", "deleted"])(
      "does not recover using a changed %s target",
      async kind => {
        const id = await pending();
        if (kind === "account")
          await q("UPDATE google_integrations SET credentials=? WHERE id=?", [
            JSON.stringify({ access_token: "another-account" }),
            integrationId,
          ]);
        if (kind === "calendar")
          await q(
            "UPDATE google_integrations SET calendar_id='other' WHERE id=?",
            [integrationId]
          );
        if (kind === "disconnected")
          await q("UPDATE google_integrations SET is_active=0 WHERE id=?", [
            integrationId,
          ]);
        if (kind === "deleted")
          await q("DELETE FROM google_integrations WHERE id=?", [
            integrationId,
          ]);
        expect(
          (await readAppointmentReview(owner.merchantId, id)).blocked
        ).toBe("target_unavailable");
        await expect(run(id)).rejects.toThrow();
        expect(provider.get).not.toHaveBeenCalled();
      }
    );
    it("supports explicit legacy adoption only when customer, service and time match", async () => {
      const id = await pending("legacy");
      await q(
        "UPDATE appointments SET calendar_event_reference=NULL,google_event_id='legacy-event',calendar_integration_id=NULL,calendar_identity_hash=NULL,calendar_target_id=NULL WHERE id=?",
        [id]
      );
      provider.get.mockResolvedValue(await active(id));
      await expect(run(id)).rejects.toThrow();
      expect((await run(id, { bindingReviewed: true })).outcome).toBe(
        "verified_active"
      );
      expect((await audits())[0].manual_binding).toBe(1);
      expect((await row(id)).calendar_integration_id).toBe(integrationId);
    });
    it("does not adopt a legacy event for a different customer", async () => {
      const id = await pending("legacy");
      await q(
        "UPDATE appointments SET calendar_event_reference=NULL,google_event_id='legacy-event',calendar_integration_id=NULL,calendar_identity_hash=NULL,calendar_target_id=NULL WHERE id=?",
        [id]
      );
      provider.get.mockResolvedValue(
        await active(id, { description: "Phone: 966500000001" })
      );
      expect((await run(id, { bindingReviewed: true })).failureCode).toBe(
        "identity_mismatch"
      );
      expect((await row(id)).calendar_sync_state).toBe("legacy");
    });
    it("supports operator-provided identity for an old unknown creation with matching evidence", async () => {
      const id = await pending();
      await q(
        "UPDATE appointments SET calendar_event_reference=NULL WHERE id=?",
        [id]
      );
      provider.get.mockResolvedValue(
        await active(id, { id: "old-unknown-event" })
      );
      expect(
        (await run(id, { eventId: "old-unknown-event", bindingReviewed: true }))
          .outcome
      ).toBe("verified_active");
    });
    it("never interprets a cancelled event as permission to release an unknown creation", async () => {
      const id = await pending();
      provider.get.mockResolvedValue(await active(id, { status: "cancelled" }));
      expect((await run(id)).outcome).toBe("unverified");
      await expect(
        run(id, { action: "confirm_cancellation" })
      ).rejects.toThrow();
      await expect(occupied()).rejects.toThrow();
    });
    it("rejects cross-tenant evidence reads and writes", async () => {
      const id = await pending(),
        cmd = await command(id);
      await expect(
        readAppointmentReview(other.merchantId, id)
      ).rejects.toThrow();
      await expect(
        reconcileAppointment(other.merchantId, other.userId, cmd)
      ).rejects.toThrow();
      expect(provider.get).not.toHaveBeenCalled();
      expect(await audits()).toEqual([]);
    });
    it.each(["partial_binding", "mismatched_reference"])(
      "rejects inconsistent %s before provider access",
      async kind => {
        const id = await pending();
        if (kind === "partial_binding")
          await q(
            "UPDATE appointments SET calendar_identity_hash=NULL WHERE id=?",
            [id]
          );
        else
          await q(
            "UPDATE appointments SET google_event_id='foreign-event' WHERE id=?",
            [id]
          );
        expect(
          (await readAppointmentReview(owner.merchantId, id)).blocked
        ).toBe("target_unavailable");
        await expect(run(id, { bindingReviewed: true })).rejects.toThrow();
        expect(provider.get).not.toHaveBeenCalled();
      }
    );
    it("rechecks the appointment and account after network I/O", async () => {
      const id = await pending();
      provider.get.mockImplementation(async () => {
        await q(
          "UPDATE google_integrations SET calendar_id='reconnected' WHERE id=?",
          [integrationId]
        );
        return active(id);
      });
      await expect(run(id)).rejects.toThrow();
      expect(await audits()).toEqual([]);
      expect((await row(id)).calendar_sync_state).toBe("create_unknown");
    });
    it("allows one of two competing reviews to commit against the same evidence", async () => {
      const id = await pending(),
        cmd = await command(id);
      provider.get.mockResolvedValue(await active(id));
      const results = await Promise.allSettled([
        reconcileAppointment(owner.merchantId, owner.userId, cmd),
        reconcileAppointment(owner.merchantId, owner.userId, {
          ...cmd,
          requestId: randomUUID(),
        }),
      ]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(await audits()).toHaveLength(1);
    });
    it("rolls back state changes when the audit insert fails", async () => {
      const id = await pending();
      provider.get.mockResolvedValue(await active(id));
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, key) {
              if (key === "execute")
                return async (sql: string, args: any[]) => {
                  if (sql.includes("INSERT INTO appointment_calendar_reviews"))
                    throw Error("audit unavailable");
                  return target.execute(sql, args);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      await expect(run(id)).rejects.toThrow();
      spy.mockRestore();
      expect((await row(id)).calendar_sync_state).toBe("create_unknown");
      expect(await audits()).toEqual([]);
    });
    it("replays a committed review after its commit acknowledgement is lost", async () => {
      const id = await pending(),
        cmd = await command(id);
      provider.get.mockResolvedValue(await active(id));
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      let wrote = false;
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, key) {
              if (key === "execute")
                return async (sql: string, args: any[]) => {
                  if (sql.includes("INSERT INTO appointment_calendar_reviews"))
                    wrote = true;
                  return target.execute(sql, args);
                };
              if (key === "commit")
                return async () => {
                  await target.commit();
                  if (wrote) throw Error("lost ack");
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      await expect(
        reconcileAppointment(owner.merchantId, owner.userId, cmd)
      ).rejects.toThrow();
      spy.mockRestore();
      expect(
        (await reconcileAppointment(owner.merchantId, owner.userId, cmd))
          .outcome
      ).toBe("verified_active");
      expect(provider.get).toHaveBeenCalledOnce();
      expect(await audits()).toHaveLength(1);
    });
    it("rejects missing audit schema before contacting the provider", async () => {
      const id = await pending();
      const cmd = await command(id);
      vi.spyOn(readiness, "assertRuntimeSchema").mockRejectedValue(
        Error("missing migration")
      );
      await expect(
        reconcileAppointment(owner.merchantId, owner.userId, cmd)
      ).rejects.toThrow();
      expect(provider.get).not.toHaveBeenCalled();
    });
    it("lists bounded dates with service names, includes the final day and excludes internal bindings", async () => {
      const id = await pending();
      await q(
        "UPDATE appointments SET appointment_date='2026-12-31 18:30:00' WHERE id=?",
        [id]
      );
      const result = await readCalendarAppointments(owner.merchantId, {
        startDate: "2026-12-01",
        endDate: "2026-12-31",
      });
      expect(result.appointments).toHaveLength(1);
      expect(result.appointments[0]).toMatchObject({
        appointmentDate: "2026-12-31",
        serviceName: "Test",
        startTime: "10:00",
      });
      expect(JSON.stringify(result)).not.toMatch(
        /calendarIdentity|calendarTarget|calendarEventReference|synthetic/
      );
      expect(
        (
          await readCalendarAppointments(other.merchantId, {
            startDate: "2026-12-01",
            endDate: "2026-12-31",
          })
        ).appointments
      ).toEqual([]);
    });
    it("reports truncation rather than silently claiming a complete large calendar", async () => {
      await q(
        "INSERT INTO appointments (merchant_id,service_id,customer_phone,appointment_date,start_time,end_time) VALUES " +
          Array(501)
            .fill("(?,?,'966500987654','2026-12-20','10:00','11:00')")
            .join(","),
        Array.from({ length: 501 }, () => [owner.merchantId, serviceId]).flat()
      );
      const result = await readCalendarAppointments(owner.merchantId, {
        startDate: "2026-12-01",
        endDate: "2026-12-31",
      });
      expect(result.truncated).toBe(true);
      expect(result.appointments).toHaveLength(500);
    });
  }
);
