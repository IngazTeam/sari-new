import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
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
  refresh: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./_core/googleCalendar", () => ({
  validateAndRefreshCredentials: provider.refresh,
  createCalendarEvent: provider.create,
  deleteCalendarEvent: provider.remove,
}));
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  createConfirmedAppointment,
  reserveAppointment,
} from "./appointment-booking";
import {
  bookCalendarAppointment as bookCalendarRequest,
  cancelCalendarAppointment,
} from "./appointment-calendar";
import {
  createAtomicBooking,
  hasBookingConflict,
  withBookingCapacityTransaction,
} from "./booking-capacity";
import { updateBookingOperation } from "./booking-operations";
import * as db from "./db";
import * as readiness from "./db/schema-readiness";

describe.skipIf(!process.env.DATABASE_URL)(
  "unified appointment capacity on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    let serviceId: number,
      secondServiceId: number,
      staffId: number,
      secondStaffId: number,
      foreignServiceId: number,
      foreignStaffId: number;
    let children: ChildProcess[] = [];
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const input = (patch: any = {}) => ({
      merchantId: owner.merchantId,
      serviceId,
      staffId,
      customerPhone: "966500987654",
      customerName: "Test",
      appointmentDate: "2026-12-20",
      startTime: "10:00",
      ...patch,
    });
    const booking = (patch: any = {}) => ({
      merchantId: owner.merchantId,
      serviceId,
      staffId,
      customerPhone: "966500987654",
      bookingDate: "2026-12-20",
      startTime: "10:00",
      endTime: "11:00",
      durationMinutes: 60,
      basePrice: 10000,
      finalPrice: 10000,
      ...patch,
    });
    const create = (patch: any = {}) => reserveAppointment(input(patch));
    const bookCalendarAppointment = (data: ReturnType<typeof input>) =>
      bookCalendarRequest(data, {
        requestId: randomUUID(),
        actorUserId: owner.userId,
      });
    const rows = () =>
      query("SELECT * FROM appointments WHERE merchant_id=? ORDER BY id", [
        owner.merchantId,
      ]);
    const integration = async () =>
      (
        await query(
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
    const cancel = (id: number) =>
      cancelCalendarAppointment(owner.merchantId, {
        appointmentId: id,
        reason: "test",
      });
    beforeEach(async () => {
      vi.resetAllMocks();
      children = [];
      owner = await createDisposableMerchant("appointment-capacity");
      other = await createDisposableMerchant("other-appointments");
      const service = async (merchant: number) =>
        (
          await query(
            "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Test',60,10000)",
            [merchant]
          )
        ).insertId;
      const staff = async (merchant: number) =>
        (
          await query(
            "INSERT INTO staff_members (merchant_id,name) VALUES (?,'Test')",
            [merchant]
          )
        ).insertId;
      serviceId = await service(owner.merchantId);
      secondServiceId = await service(owner.merchantId);
      foreignServiceId = await service(other.merchantId);
      staffId = await staff(owner.merchantId);
      secondStaffId = await staff(owner.merchantId);
      foreignStaffId = await staff(other.merchantId);
      provider.refresh.mockImplementation(async credentials => credentials);
      provider.create.mockImplementation(
        async (_credentials, _calendar, event) => ({ id: event.id })
      );
      provider.remove.mockResolvedValue(true);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) {
          const exited = new Promise<void>(done =>
            child.once("exit", () => done())
          );
          child.kill("SIGKILL");
          await exited;
        }
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);
    it("admits one reservation when both ledgers race", async () => {
      const result = await Promise.allSettled([
        create(),
        createAtomicBooking(booking()),
        create(),
        createAtomicBooking(booking()),
      ]);
      expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (await rows()).length +
          (
            await query("SELECT id FROM bookings WHERE merchant_id=?", [
              owner.merchantId,
            ])
          ).length
      ).toBe(1);
    });
    it("serializes independent appointment and booking worker processes", async () => {
      const workers = ["appointment", "create", "appointment", "create"].map(
        mode => {
          const child = fork(
            resolve("server/tests/helpers/booking-capacity-child.ts"),
            [
              mode,
              JSON.stringify(mode === "appointment" ? input() : booking()),
            ],
            {
              execArgv: ["--import", "tsx"],
              stdio: ["ignore", "ignore", "pipe", "ipc"],
              windowsHide: true,
            }
          );
          children.push(child);
          const done = new Promise<any>((accept, reject) => {
            const timer = setTimeout(
              () => reject(Error("worker timeout")),
              20000
            );
            child.on("message", (event: any) => {
              if (event.phase === "ready") child.send("run");
              if (event.phase === "done") {
                clearTimeout(timer);
                accept(event);
              }
            });
            child.once("error", error => {
              clearTimeout(timer);
              reject(error);
            });
          });
          return done;
        }
      );
      expect((await Promise.all(workers)).filter(r => r.ok)).toHaveLength(1);
    });
    it("applies the same capacity rules through WhatsApp and the db compatibility facade", async () => {
      const { appointmentDate, ...fields } = input();
      await createConfirmedAppointment({ ...fields, date: appointmentDate });
      await expect(db.createAppointment(input())).rejects.toThrow();
      await expect(createAtomicBooking(booking())).rejects.toThrow();
      expect(await rows()).toHaveLength(1);
    });
    it("checks both directions, including staff across different services", async () => {
      await createAtomicBooking(booking());
      await expect(create({ serviceId: secondServiceId })).rejects.toThrow();
      await create({ staffId: secondStaffId });
      expect(await rows()).toHaveLength(1);
    });
    it.each(["existing_unassigned", "requested_unassigned"])(
      "protects same-service capacity with %s",
      async kind => {
        await create(
          kind === "existing_unassigned" ? { staffId: undefined } : {}
        );
        await expect(
          createAtomicBooking(
            booking(
              kind === "requested_unassigned"
                ? { staffId: undefined }
                : { staffId: secondStaffId }
            )
          )
        ).rejects.toThrow();
      }
    );
    it("does not block unrelated unassigned services, adjacent intervals, other days or other tenants", async () => {
      await create({ staffId: undefined });
      await createAtomicBooking(
        booking({ serviceId: secondServiceId, staffId: undefined })
      );
      await create({ startTime: "11:00" });
      await create({ appointmentDate: "2026-12-21" });
      await create({
        merchantId: other.merchantId,
        serviceId: foreignServiceId,
        staffId: foreignStaffId,
      });
      expect(await rows()).toHaveLength(3);
    });
    it.each(["pending", "confirmed"])(
      "holds %s legacy appointments even with non-midnight timestamps",
      async status => {
        const appointment = await create();
        await query(
          "UPDATE appointments SET status=?,appointment_date='2026-12-20 15:30:00' WHERE id=?",
          [status, appointment.appointmentId]
        );
        await expect(createAtomicBooking(booking())).rejects.toThrow();
      }
    );
    it.each(["cancelled", "completed", "no_show"])(
      "releases terminal %s local appointments without deleting history",
      async status => {
        const appointment = await create();
        await query("UPDATE appointments SET status=? WHERE id=?", [
          status,
          appointment.appointmentId,
        ]);
        await createAtomicBooking(booking());
        expect(await rows()).toHaveLength(1);
      }
    );
    it("does not exclude an appointment whose ID equals the booking being moved", async () => {
      const id = await createAtomicBooking(
        booking({ startTime: "12:00", endTime: "13:00" })
      );
      await query(
        "INSERT INTO appointments (id,merchant_id,service_id,staff_id,customer_phone,appointment_date,start_time,end_time,status) VALUES (?,?,?,?,?,'2026-12-20','10:00','11:00','confirmed')",
        [id, owner.merchantId, serviceId, staffId, "966500987654"]
      );
      await expect(
        updateBookingOperation(owner.merchantId, owner.userId, {
          bookingId: id,
          operationId: randomUUID(),
          expectedStatus: "pending",
          startTime: "10:00",
          endTime: "11:00",
        })
      ).rejects.toThrow();
      expect(
        (await query("SELECT start_time FROM bookings WHERE id=?", [id]))[0]
          .start_time
      ).toBe("12:00");
      expect(
        await hasBookingConflict(
          (await getPool())!,
          owner.merchantId,
          {
            serviceId,
            staffId,
            bookingDate: "2026-12-20",
            startTime: "12:00",
            endTime: "13:00",
          },
          undefined,
          id
        )
      ).toBe(true);
    });
    it("filters configured slots and bot suggestions using appointments", async () => {
      await query(
        "INSERT INTO booking_time_slots (merchant_id,service_id,staff_id,slot_date,start_time,end_time) VALUES (?,?,?,'2026-12-20','10:00','11:00')",
        [owner.merchantId, secondServiceId, staffId]
      );
      expect(
        await db.getAvailableTimeSlots(secondServiceId, "2026-12-20")
      ).toHaveLength(1);
      await create();
      expect(
        await db.getAvailableTimeSlots(secondServiceId, "2026-12-20")
      ).toHaveLength(0);
      const bot = await import("./appointmentBot");
      expect(
        await bot.getAvailableSlots(
          owner.merchantId,
          secondServiceId,
          "2026-12-20",
          staffId
        )
      ).toEqual([]);
    });
    it.each([
      "foreign_service",
      "foreign_staff",
      "inactive_service",
      "inactive_staff",
      "unassigned_staff",
      "invalid_assignment",
    ])("rejects %s without rows or provider I/O", async kind => {
      await integration();
      const patch: any = {};
      if (kind === "foreign_service") patch.serviceId = foreignServiceId;
      if (kind === "foreign_staff") patch.staffId = foreignStaffId;
      if (kind === "inactive_service")
        await query("UPDATE services SET is_active=0 WHERE id=?", [serviceId]);
      if (kind === "inactive_staff")
        await query("UPDATE staff_members SET is_active=0 WHERE id=?", [
          staffId,
        ]);
      if (kind === "unassigned_staff")
        await query("UPDATE services SET staff_ids=? WHERE id=?", [
          JSON.stringify([secondStaffId]),
          serviceId,
        ]);
      if (kind === "invalid_assignment")
        await query("UPDATE services SET staff_ids='{}' WHERE id=?", [
          serviceId,
        ]);
      await expect(bookCalendarAppointment(input(patch))).rejects.toThrow();
      expect(await rows()).toEqual([]);
      expect(provider.create).not.toHaveBeenCalled();
    });
    it("commits the local hold before Google and does not retain a SQL lock during network I/O", async () => {
      await integration();
      provider.create.mockImplementationOnce(
        async (_credentials, _calendar, event) => {
          expect((await rows())[0]).toMatchObject({
            calendar_sync_state: "creating",
            status: "confirmed",
          });
          expect(event.start.toISOString()).toBe("2026-12-20T07:00:00.000Z");
          await createAtomicBooking(
            booking({ startTime: "11:00", endTime: "12:00" })
          );
          return { id: (await rows())[0].calendar_event_reference };
        }
      );
      const result = await bookCalendarAppointment(input());
      expect(result.calendarSyncState).toBe("synced");
      expect(JSON.stringify(result)).not.toMatch(
        /synthetic-access|synthetic-refresh|identity|credentials/
      );
      expect((await rows())[0]).toMatchObject({
        google_event_id: expect.stringMatching(/^sariappt[0-9a-f]{32}$/),
        calendar_sync_state: "synced",
      });
      const listed = await db.getAppointmentsByMerchant(owner.merchantId);
      expect(listed[0]).toMatchObject({ calendarSyncState: "synced" });
      expect(listed[0]).not.toHaveProperty("calendarIdentityHash");
      expect(listed[0]).not.toHaveProperty("calendarTargetId");
    });
    it("issues one Google POST for competing creation requests", async () => {
      await integration();
      const result = await Promise.allSettled([
        bookCalendarAppointment(input()),
        bookCalendarAppointment(input()),
      ]);
      expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(provider.create).toHaveBeenCalledOnce();
    });
    it.each(["timeout", "missing_ack", "auth_failure"])(
      "retains a local hold for ambiguous creation: %s",
      async failure => {
        await integration();
        if (failure === "timeout")
          provider.create.mockRejectedValue(Error("timeout"));
        if (failure === "missing_ack") provider.create.mockResolvedValue({});
        if (failure === "auth_failure")
          provider.refresh.mockRejectedValue(Error("expired"));
        const result = await bookCalendarAppointment(input());
        expect(result.calendarSyncState).toBe("create_unknown");
        await expect(cancel(result.appointmentId)).rejects.toThrow();
        await expect(createAtomicBooking(booking())).rejects.toThrow();
        await expect(bookCalendarAppointment(input())).rejects.toThrow();
        expect(provider.create.mock.calls.length).toBe(
          failure === "auth_failure" ? 0 : 1
        );
        expect((await rows())[0].status).toBe("confirmed");
      }
    );
    it("cannot cancel or release an appointment while the Google POST is in flight", async () => {
      await integration();
      provider.create.mockImplementationOnce(async () => {
        await expect(cancel((await rows())[0].id)).rejects.toThrow();
        await expect(createAtomicBooking(booking())).rejects.toThrow();
        return { id: (await rows())[0].calendar_event_reference };
      });
      await bookCalendarAppointment(input());
      expect(provider.remove).not.toHaveBeenCalled();
      expect((await rows())[0].status).toBe("confirmed");
    });
    it("releases capacity only after Google DELETE acknowledges cancellation", async () => {
      await integration();
      const result = await bookCalendarAppointment(input());
      provider.remove.mockImplementationOnce(async () => {
        expect((await rows())[0]).toMatchObject({
          calendar_sync_state: "cancelling",
          status: "confirmed",
        });
        await expect(createAtomicBooking(booking())).rejects.toThrow();
        await expect(cancel(result.appointmentId)).rejects.toThrow();
        return true;
      });
      await cancel(result.appointmentId);
      await cancel(result.appointmentId);
      expect(provider.remove).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        "primary",
        expect.stringMatching(/^sariappt[0-9a-f]{32}$/)
      );
      expect((await rows())[0]).toMatchObject({
        status: "cancelled",
        calendar_sync_state: "cancelled",
      });
      await createAtomicBooking(booking());
    });
    it("retains cancellation uncertainty without replaying DELETE or freeing capacity", async () => {
      await integration();
      const result = await bookCalendarAppointment(input());
      provider.remove.mockRejectedValue(Error("timeout"));
      await expect(cancel(result.appointmentId)).rejects.toThrow();
      await expect(cancel(result.appointmentId)).rejects.toThrow();
      expect(provider.remove).toHaveBeenCalledOnce();
      expect((await rows())[0]).toMatchObject({
        status: "confirmed",
        calendar_sync_state: "cancel_unknown",
      });
      await expect(createAtomicBooking(booking())).rejects.toThrow();
    });
    it.each(["calendar", "account", "disconnected", "deleted", "legacy"])(
      "does not delete against an unverified %s target",
      async kind => {
        const integrationId = await integration();
        const result = await bookCalendarAppointment(input());
        if (kind === "calendar")
          await query(
            "UPDATE google_integrations SET calendar_id='other' WHERE id=?",
            [integrationId]
          );
        if (kind === "account")
          await query(
            "UPDATE google_integrations SET credentials=? WHERE id=?",
            [JSON.stringify({ access_token: "other-account" }), integrationId]
          );
        if (kind === "disconnected")
          await query("UPDATE google_integrations SET is_active=0 WHERE id=?", [
            integrationId,
          ]);
        if (kind === "deleted")
          await query("DELETE FROM google_integrations WHERE id=?", [
            integrationId,
          ]);
        if (kind === "legacy")
          await query(
            "UPDATE appointments SET calendar_sync_state='legacy',calendar_integration_id=NULL WHERE id=?",
            [result.appointmentId]
          );
        await expect(cancel(result.appointmentId)).rejects.toThrow();
        expect(provider.remove).not.toHaveBeenCalled();
        expect((await rows())[0].status).toBe("confirmed");
      }
    );
    it("requires tenant scope for cancellation and preserves terminal records", async () => {
      const result = await create();
      await expect(
        cancelCalendarAppointment(other.merchantId, {
          appointmentId: result.appointmentId,
        })
      ).rejects.toThrow();
      await query("UPDATE appointments SET status='completed' WHERE id=?", [
        result.appointmentId,
      ]);
      await expect(cancel(result.appointmentId)).rejects.toThrow();
      expect((await rows())[0].status).toBe("completed");
    });
    it("cancels a local-only appointment idempotently through the scoped compatibility helper", async () => {
      const result = await create();
      await db.cancelAppointment(
        owner.merchantId,
        result.appointmentId,
        "test"
      );
      await db.cancelAppointment(
        owner.merchantId,
        result.appointmentId,
        "test"
      );
      expect((await rows())[0].status).toBe("cancelled");
      expect(provider.remove).not.toHaveBeenCalled();
      await createAtomicBooking(booking());
    });
    it("fails closed before dispatch when the required migration is missing", async () => {
      vi.spyOn(readiness, "assertRuntimeSchema").mockRejectedValue(
        Error("schema missing")
      );
      await expect(bookCalendarAppointment(input())).rejects.toThrow();
      expect(await rows()).toEqual([]);
      expect(provider.create).not.toHaveBeenCalled();
    });
    it.each(["reservation", "provider_ack"])(
      "survives a lost %s commit acknowledgement without repeating POST",
      async phase => {
        await integration();
        const pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        let commits = 0,
          destroyed = 0;
        const interception = vi
          .spyOn(pool, "getConnection")
          .mockImplementation(async () => {
            const connection = await original();
            return new Proxy(connection, {
              get(target, key) {
                if (key === "commit")
                  return async () => {
                    await target.commit();
                    commits++;
                    if (commits === (phase === "reservation" ? 1 : 2))
                      throw Error("lost acknowledgement");
                  };
                if (key === "destroy")
                  return () => {
                    destroyed++;
                    target.destroy();
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
          });
        await expect(bookCalendarAppointment(input())).rejects.toThrow();
        interception.mockRestore();
        expect(destroyed).toBe(1);
        expect(await rows()).toHaveLength(1);
        expect((await rows())[0].calendar_sync_state).toBe(
          phase === "reservation" ? "creating" : "synced"
        );
        await expect(bookCalendarAppointment(input())).rejects.toThrow();
        expect(provider.create.mock.calls.length).toBe(
          phase === "reservation" ? 0 : 1
        );
        await expect(createAtomicBooking(booking())).rejects.toThrow();
      }
    );
    it("retains cancelling after a failed local commit following successful DELETE", async () => {
      await integration();
      const result = await bookCalendarAppointment(input());
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const interception = vi
        .spyOn(pool, "getConnection")
        .mockImplementation(async () => {
          const connection = await original();
          return new Proxy(connection, {
            get(target, key) {
              if (key === "execute")
                return async (sql: string, args: any[]) => {
                  if (
                    sql.includes(
                      "status='cancelled',calendar_sync_state='cancelled'"
                    )
                  )
                    throw Error("database unavailable");
                  return target.execute(sql, args);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        });
      await expect(cancel(result.appointmentId)).rejects.toThrow();
      interception.mockRestore();
      expect((await rows())[0]).toMatchObject({
        status: "confirmed",
        calendar_sync_state: "cancelling",
      });
      await expect(cancel(result.appointmentId)).rejects.toThrow();
      expect(provider.remove).toHaveBeenCalledOnce();
      await expect(createAtomicBooking(booking())).rejects.toThrow();
    });
    it("rolls back a failed reservation before another writer enters", async () => {
      await expect(
        withBookingCapacityTransaction(owner.merchantId, async connection => {
          await connection.execute(
            "INSERT INTO appointments (merchant_id,service_id,staff_id,customer_phone,appointment_date,start_time,end_time) VALUES (?,?,?,?,'2026-12-20','10:00','11:00')",
            [owner.merchantId, serviceId, staffId, "966500987654"]
          );
          throw Error("injected failure");
        })
      ).rejects.toThrow();
      await createAtomicBooking(booking());
      expect(await rows()).toEqual([]);
    });
  }
);
