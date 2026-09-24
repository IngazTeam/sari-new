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
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  createAtomicBooking,
  withBookingCapacityTransaction,
} from "./booking-capacity";
import {
  updateBookingOperation,
  deleteBookingOperation,
} from "./booking-operations";
import * as db from "./db";
import * as readiness from "./db/schema-readiness";

describe.skipIf(!process.env.DATABASE_URL)(
  "shared booking capacity on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      serviceId: number,
      secondServiceId: number,
      foreignServiceId: number,
      staffId: number,
      secondStaffId: number,
      foreignStaffId: number;
    let children: ChildProcess[] = [];
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const input = (patch: any = {}) => ({
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
    const create = (patch: any = {}) => db.createBooking(input(patch));
    const rows = () =>
      query("SELECT * FROM bookings WHERE merchant_id=? ORDER BY id", [
        owner.merchantId,
      ]);
    const move = (id: number, patch: any = {}) =>
      updateBookingOperation(owner.merchantId, owner.userId, {
        bookingId: id,
        operationId: randomUUID(),
        expectedStatus: "pending",
        startTime: "12:00",
        endTime: "13:00",
        ...patch,
      });
    beforeEach(async () => {
      owner = await createDisposableMerchant("booking-capacity");
      other = await createDisposableMerchant("other-capacity");
      children = [];
      const service = async (merchantId: number) =>
        (
          await query(
            "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Test service',60,10000)",
            [merchantId]
          )
        ).insertId;
      const staff = async (merchantId: number) =>
        (
          await query(
            "INSERT INTO staff_members (merchant_id,name) VALUES (?,'Test staff')",
            [merchantId]
          )
        ).insertId;
      serviceId = await service(owner.merchantId);
      secondServiceId = await service(owner.merchantId);
      foreignServiceId = await service(other.merchantId);
      staffId = await staff(owner.merchantId);
      secondStaffId = await staff(owner.merchantId);
      foreignStaffId = await staff(other.merchantId);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) {
          const stopped = new Promise<void>(done =>
            child.once("exit", () => done())
          );
          child.kill("SIGKILL");
          await stopped;
        }
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);
    const child = (mode: string, data: any) => {
      const process = fork(
        resolve("server/tests/helpers/booking-capacity-child.ts"),
        [mode, JSON.stringify(data)],
        {
          execArgv: ["--import", "tsx"],
          stdio: ["ignore", "ignore", "pipe", "ipc"],
          windowsHide: true,
        }
      );
      children.push(process);
      const events = new Map<string, any>(),
        listeners = new Map<string, (event: any) => void>();
      process.on("message", (event: any) => {
        events.set(event.phase, event);
        listeners.get(event.phase)?.(event);
      });
      const phase = (name: string) =>
        events.has(name)
          ? Promise.resolve(events.get(name))
          : new Promise<any>((done, reject) => {
              const timer = setTimeout(
                () => reject(Error("Worker timeout " + name)),
                20000
              );
              listeners.set(name, event => {
                clearTimeout(timer);
                done(event);
              });
              process.once("error", error => {
                clearTimeout(timer);
                reject(error);
              });
            });
      return { process, phase };
    };
    it("creates only one pending unpaid record under simultaneous duplicate requests", async () => {
      const results = await Promise.allSettled(
        [1, 2, 3, 4].map(() => create())
      );
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(await rows()).toHaveLength(1);
      expect((await rows())[0]).toMatchObject({
        status: "pending",
        payment_status: "unpaid",
        base_price: 10000,
        final_price: 10000,
      });
      expect(
        await query("SELECT id FROM order_payments WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
    });
    it("serializes four independent processes without relying on an in-process mutex", async () => {
      const workers = [1, 2, 3, 4].map(() => child("create", input()));
      await Promise.all(workers.map(w => w.phase("ready")));
      workers.forEach(w => w.process.send("run"));
      const results = await Promise.all(workers.map(w => w.phase("done")));
      expect(results.filter(r => r.ok)).toHaveLength(1);
      expect(await rows()).toHaveLength(1);
    });
    it("releases the lock and rolls back an uncommitted reservation after worker death", async () => {
      const worker = child("hold", input());
      await worker.phase("ready");
      worker.process.send("run");
      await worker.phase("holding");
      const exited = new Promise<void>(done =>
        worker.process.once("exit", () => done())
      );
      worker.process.kill("SIGKILL");
      await exited;
      await create();
      expect(await rows()).toHaveLength(1);
    });
    it("checks staff across services while allowing independent assigned staff", async () => {
      await create();
      await expect(create({ serviceId: secondServiceId })).rejects.toThrow();
      await create({ staffId: secondStaffId });
      expect(await rows()).toHaveLength(2);
    });
    it.each(["existing_unassigned", "requested_unassigned"])(
      "protects service capacity with %s staff",
      async kind => {
        await create(
          kind === "existing_unassigned" ? { staffId: undefined } : {}
        );
        await expect(
          create(
            kind === "requested_unassigned"
              ? { staffId: undefined }
              : { staffId: secondStaffId }
          )
        ).rejects.toThrow();
        expect(await rows()).toHaveLength(1);
      }
    );
    it("filters configured slots by live reservations even when counters are stale", async () => {
      await query(
        "INSERT INTO booking_time_slots (merchant_id,service_id,staff_id,slot_date,start_time,end_time) VALUES (?,?,?,'2026-12-20','10:00','11:00')",
        [owner.merchantId, secondServiceId, staffId]
      );
      expect(
        await db.getAvailableTimeSlots(secondServiceId, "2026-12-20")
      ).toHaveLength(1);
      const id = await create();
      expect(
        await db.getAvailableTimeSlots(secondServiceId, "2026-12-20")
      ).toHaveLength(0);
      await query("UPDATE bookings SET status='cancelled' WHERE id=?", [id]);
      expect(
        await db.getAvailableTimeSlots(secondServiceId, "2026-12-20")
      ).toHaveLength(1);
    });
    it("keeps independently staffed configured slots available for the same service", async () => {
      await query(
        "INSERT INTO booking_time_slots (merchant_id,service_id,staff_id,slot_date,start_time,end_time) VALUES (?,?,?,'2026-12-20','10:00','11:00')",
        [owner.merchantId, serviceId, secondStaffId]
      );
      await create();
      expect(
        await db.getAvailableTimeSlots(serviceId, "2026-12-20", secondStaffId)
      ).toHaveLength(1);
    });
    it.each([
      "blocked",
      "unavailable",
      "foreign_merchant",
      "inactive_service",
      "foreign_staff",
      "inactive_staff",
      "unassigned_staff",
    ])("does not display %s configured slots", async kind => {
      const slot = (
        await query(
          "INSERT INTO booking_time_slots (merchant_id,service_id,staff_id,slot_date,start_time,end_time) VALUES (?,?,?,'2026-12-20','10:00','11:00')",
          [
            kind === "foreign_merchant" ? other.merchantId : owner.merchantId,
            serviceId,
            staffId,
          ]
        )
      ).insertId;
      if (kind === "blocked")
        await query("UPDATE booking_time_slots SET is_blocked=1 WHERE id=?", [
          slot,
        ]);
      if (kind === "unavailable")
        await query("UPDATE booking_time_slots SET is_available=0 WHERE id=?", [
          slot,
        ]);
      if (kind === "inactive_service") await db.deleteService(serviceId);
      if (kind === "foreign_staff")
        await query("UPDATE booking_time_slots SET staff_id=? WHERE id=?", [
          foreignStaffId,
          slot,
        ]);
      if (kind === "inactive_staff")
        await query("UPDATE staff_members SET is_active=0 WHERE id=?", [
          staffId,
        ]);
      if (kind === "unassigned_staff")
        await query("UPDATE services SET staff_ids=? WHERE id=?", [
          JSON.stringify([secondStaffId]),
          serviceId,
        ]);
      expect(await db.getAvailableTimeSlots(serviceId, "2026-12-20")).toEqual(
        []
      );
    });
    it("records chat requests as pending without claiming confirmation or an uncreated payment link", async () => {
      const { createBookingFromChat } = await import("./ai");
      const result = await createBookingFromChat({
        merchantId: owner.merchantId,
        serviceId,
        customerPhone: "966500987654",
        bookingDate: "2026-12-20",
        startTime: "10:00",
        durationMinutes: 60,
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("بانتظار التأكيد");
      expect(result.message).not.toContain("تم تأكيد");
      expect(result.paymentUrl).toBeUndefined();
      expect((await rows())[0]).toMatchObject({
        status: "pending",
        payment_status: "unpaid",
      });
    });
    it.each(["foreign", "inactive"])(
      "does not create chat requests for %s services",
      async kind => {
        const { createBookingFromChat } = await import("./ai");
        if (kind === "inactive") await db.deleteService(serviceId);
        expect(
          (
            await createBookingFromChat({
              merchantId: owner.merchantId,
              serviceId: kind === "foreign" ? foreignServiceId : serviceId,
              customerPhone: "966500987654",
              bookingDate: "2026-12-20",
              startTime: "10:00",
              durationMinutes: 60,
            })
          ).success
        ).toBe(false);
        expect(await rows()).toEqual([]);
      }
    );
    it("chat slot suggestions use configured current capacity without inventing office hours", async () => {
      const { generateAvailableSlotsMessage } = await import("./ai");
      expect(
        await generateAvailableSlotsMessage(serviceId, "2026-12-20")
      ).toContain("لا توجد مواعيد معروضة");
      await query(
        "INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,'2026-12-20','18:00','19:00')",
        [owner.merchantId, serviceId]
      );
      expect(
        await generateAvailableSlotsMessage(serviceId, "2026-12-20")
      ).toContain("18:00");
      expect(
        await generateAvailableSlotsMessage(serviceId, "2026-12-20")
      ).not.toContain("09:00");
      await create({
        staffId: undefined,
        startTime: "18:00",
        endTime: "19:00",
      });
      expect(
        await generateAvailableSlotsMessage(serviceId, "2026-12-20")
      ).toContain("لا توجد مواعيد معروضة");
    });
    it("allows adjacent intervals, another day and another tenant", async () => {
      await create();
      await create({ startTime: "11:00", endTime: "12:00" });
      await create({ bookingDate: "2026-12-21" });
      await create({
        merchantId: other.merchantId,
        serviceId: foreignServiceId,
        staffId: foreignStaffId,
      });
      expect(await rows()).toHaveLength(3);
    });
    it.each(["pending", "confirmed", "in_progress"])(
      "retains %s occupancy for create and availability",
      async status => {
        const id = await create();
        await query("UPDATE bookings SET status=? WHERE id=?", [status, id]);
        await expect(create()).rejects.toThrow();
        expect(
          await db.checkBookingConflict(
            secondServiceId,
            staffId,
            "2026-12-20",
            "10:30",
            "11:30"
          )
        ).toBe(true);
      }
    );
    it.each(["cancelled", "completed", "no_show"])(
      "releases %s occupancy without deleting history",
      async status => {
        const id = await create();
        await query("UPDATE bookings SET status=? WHERE id=?", [status, id]);
        await create();
        expect(await rows()).toHaveLength(2);
      }
    );
    it.each([
      { startTime: "09:30", endTime: "10:30" },
      { startTime: "10:30", endTime: "11:30" },
      { startTime: "09:00", endTime: "12:00", durationMinutes: 180 },
      { startTime: "10:15", endTime: "10:45", durationMinutes: 30 },
    ])("rejects overlapping interval %j", async patch => {
      await create();
      await expect(create(patch)).rejects.toThrow();
      expect(await rows()).toHaveLength(1);
    });
    it.each([
      "foreign_service",
      "inactive_service",
      "foreign_staff",
      "inactive_staff",
      "unassigned_staff",
      "invalid_assignment",
    ])(
      "rejects %s through creation and the compatibility helper",
      async kind => {
        const patch: any = {};
        if (kind === "foreign_service") patch.serviceId = foreignServiceId;
        if (kind === "inactive_service") await db.deleteService(serviceId);
        if (kind === "foreign_staff") patch.staffId = foreignStaffId;
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
        await expect(create(patch)).rejects.toThrow();
        expect(await rows()).toEqual([]);
      }
    );
    it.each([
      { merchantId: 0 },
      { serviceId: 1.2 },
      { staffId: -1 },
      { bookingDate: "2026-02-30" },
      { startTime: "25:00" },
      { endTime: "09:00" },
      { endTime: "10:00" },
      { durationMinutes: 90 },
      { durationMinutes: 1.5 },
      { basePrice: -1 },
      { finalPrice: 0.5 },
      { customerPhone: "abc" },
      { status: "confirmed" },
      { paymentStatus: "paid" },
    ])("rejects malformed direct creation %j", async patch => {
      await expect(create(patch)).rejects.toThrow();
      expect(await rows()).toEqual([]);
    });
    it("checks creation against a concurrent reschedule into the same interval", async () => {
      const id = await create();
      const result = await Promise.allSettled([
        move(id),
        create({ startTime: "12:00", endTime: "13:00" }),
      ]);
      expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (await rows()).filter((r: any) => r.start_time === "12:00")
      ).toHaveLength(1);
    });
    it("serializes two services moving the same staff into one interval", async () => {
      const first = await create(),
        second = await create({
          serviceId: secondServiceId,
          startTime: "14:00",
          endTime: "15:00",
        });
      const result = await Promise.allSettled([move(first), move(second)]);
      expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (await rows()).filter((r: any) => r.start_time === "12:00")
      ).toHaveLength(1);
    });
    it("serializes staff-only reassignment against another service", async () => {
      const first = await create(),
        second = await create({
          serviceId: secondServiceId,
          staffId: secondStaffId,
        });
      await expect(
        move(second, { startTime: "10:00", endTime: "11:00", staffId })
      ).rejects.toThrow();
      expect((await db.getBookingById(second))?.staffId).toBe(secondStaffId);
      expect(first).toBeGreaterThan(0);
    });
    it("cancel and delete release capacity while preserving the operation audit", async () => {
      const id = await create();
      await updateBookingOperation(owner.merchantId, owner.userId, {
        bookingId: id,
        expectedStatus: "pending",
        operationId: randomUUID(),
        status: "cancelled",
      });
      const next = await create();
      await deleteBookingOperation(owner.merchantId, owner.userId, {
        bookingId: next,
        expectedStatus: "pending",
        operationId: randomUUID(),
      });
      await create();
      expect(
        await query(
          "SELECT id FROM booking_operation_audits WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(2);
      expect(await rows()).toHaveLength(2);
    });
    it("availability uses the same staff and service overlap rule and exclusion", async () => {
      const id = await create();
      expect(
        await db.checkBookingConflict(
          serviceId,
          secondStaffId,
          "2026-12-20",
          "10:00",
          "11:00"
        )
      ).toBe(false);
      expect(
        await db.checkBookingConflict(
          secondServiceId,
          staffId,
          "2026-12-20",
          "10:00",
          "11:00"
        )
      ).toBe(true);
      expect(
        await db.checkBookingConflict(
          serviceId,
          staffId,
          "2026-12-20",
          "10:00",
          "11:00",
          id
        )
      ).toBe(false);
      await expect(
        db.checkBookingConflict(
          serviceId,
          foreignStaffId,
          "2026-12-20",
          "10:00",
          "11:00"
        )
      ).rejects.toThrow();
    });
    it("rolls back a failed insertion and immediately permits a later valid request", async () => {
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await original();
        return new Proxy(c, {
          get(target, key) {
            if (key === "execute")
              return async (sql: string, args: any[]) => {
                if (sql.includes("INSERT INTO bookings"))
                  throw Error("write failed");
                return target.execute(sql, args);
              };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      });
      await expect(create()).rejects.toThrow();
      vi.restoreAllMocks();
      expect(await rows()).toEqual([]);
      await create();
      expect(await rows()).toHaveLength(1);
    });
    it("destroys a connection after a lost commit acknowledgement and never creates a duplicate", async () => {
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      let destroyed = 0;
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await original();
        return new Proxy(c, {
          get(target, key) {
            if (key === "commit")
              return async () => {
                await target.commit();
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
      await expect(create()).rejects.toThrow();
      vi.restoreAllMocks();
      expect(destroyed).toBe(1);
      await expect(create()).rejects.toThrow();
      expect(await rows()).toHaveLength(1);
    });
    it("destroys a connection after rollback failure rather than pooling its transaction", async () => {
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      let destroyed = 0;
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await original();
        return new Proxy(c, {
          get(target, key) {
            if (key === "rollback")
              return async () => {
                throw Error("lost connection");
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
      await expect(create({ serviceId: foreignServiceId })).rejects.toThrow();
      vi.restoreAllMocks();
      expect(destroyed).toBe(1);
      await create();
      expect(await rows()).toHaveLength(1);
    });
    it("fails closed before acquiring capacity when the required schema is unavailable", async () => {
      vi.spyOn(readiness, "assertRuntimeSchema").mockRejectedValueOnce(
        Error("schema missing")
      );
      await expect(create()).rejects.toThrow();
      expect(await rows()).toEqual([]);
    });
    it("does not block another tenant behind a held capacity lock", async () => {
      let unlock!: () => void, entered!: () => void;
      const inside = new Promise<void>(done => (entered = done)),
        hold = new Promise<void>(done => (unlock = done));
      const locked = withBookingCapacityTransaction(
        owner.merchantId,
        async () => {
          entered();
          await hold;
        }
      );
      await inside;
      try {
        await create({
          merchantId: other.merchantId,
          serviceId: foreignServiceId,
          staffId: foreignStaffId,
        });
      } finally {
        unlock();
        await locked;
      }
      expect(await rows()).toEqual([]);
    });
  }
);
