import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
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
  refresh: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./_core/googleCalendar", () => ({
  createCalendarEvent: provider.create,
  validateAndRefreshCredentials: provider.refresh,
  deleteCalendarEvent: provider.remove,
}));
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  bookCalendarAppointment,
  cancelCalendarAppointment,
} from "./appointment-calendar";
import {
  readAppointmentCreationRequest,
  reserveCalendarAppointmentRequest,
} from "./appointment-creation-requests";
import * as readiness from "./db/schema-readiness";

describe.skipIf(!process.env.DATABASE_URL)(
  "durable appointment creation identity on MySQL",
  () => {
    let children: ChildProcess[] = [];
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      serviceId: number,
      otherServiceId: number;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const input = (patch: any = {}) => ({
      merchantId: owner.merchantId,
      serviceId,
      customerPhone: "966500987654",
      customerName: "Test",
      appointmentDate: "2026-12-20",
      startTime: "10:00",
      ...patch,
    });
    const identity = (patch: any = {}) => ({
      actorUserId: owner.userId,
      requestId: randomUUID(),
      ...patch,
    });
    const rows = () =>
      q("SELECT * FROM appointments WHERE merchant_id=?", [owner.merchantId]);
    const requests = () =>
      q("SELECT * FROM appointment_creation_requests WHERE merchant_id=?", [
        owner.merchantId,
      ]);
    const integration = () =>
      q(
        "INSERT INTO google_integrations (merchant_id,integration_type,credentials,calendar_id,is_active) VALUES (?,'calendar',?,'primary',1)",
        [
          owner.merchantId,
          JSON.stringify({
            access_token: "synthetic-access",
            refresh_token: "synthetic-refresh",
          }),
        ]
      );
    beforeEach(async () => {
      vi.resetAllMocks();
      owner = await createDisposableMerchant("appointment-request");
      other = await createDisposableMerchant("other-request");
      serviceId = (
        await q(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Test',60,10000)",
          [owner.merchantId]
        )
      ).insertId;
      otherServiceId = (
        await q(
          "INSERT INTO services (merchant_id,name,duration_minutes,base_price) VALUES (?,'Other',60,10000)",
          [other.merchantId]
        )
      ).insertId;
      provider.refresh.mockImplementation(async credentials => credentials);
      provider.create.mockImplementation(
        async (_credentials, _calendar, event) => ({ id: event.id })
      );
      provider.remove.mockResolvedValue(true);
    });
    afterEach(async () => {
      for (const child of children) if (child.exitCode === null) child.kill();
      children = [];
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(() => closeDb());

    it("shares the same durable identity across independent worker processes", async () => {
      const key = identity();
      const start = () => {
        const child = fork(
          resolve("server/tests/helpers/appointment-request-child.ts"),
          [JSON.stringify({ input: input(), identity: key })],
          {
            execArgv: ["--import", "tsx"],
            stdio: ["ignore", "ignore", "pipe", "ipc"],
            windowsHide: true,
          }
        );
        children.push(child);
        return new Promise<any>((accept, reject) => {
          const timer = setTimeout(
            () => reject(Error("worker timeout")),
            20000
          );
          let result: any;
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
      expect(results.every(r => r.ok)).toBe(true);
      expect(results.filter(r => r.kind === "new")).toHaveLength(1);
      expect(new Set(results.map(r => r.id)).size).toBe(1);
      const afterRestart = await start();
      expect(afterRestart).toMatchObject({
        ok: true,
        kind: "replay",
        id: results[0].id,
      });
      expect(await rows()).toHaveLength(1);
      expect(await requests()).toHaveLength(1);
    });
    it("rejects concurrent changed content under one request identity", async () => {
      const key = identity();
      const results = await Promise.allSettled([
        bookCalendarAppointment(input(), key),
        bookCalendarAppointment(input({ startTime: "12:00" }), key),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(await rows()).toHaveLength(1);
      expect(await requests()).toHaveLength(1);
    });
    it("keeps a request tombstone when service deletion cascades through appointments", async () => {
      const key = identity(),
        first = await bookCalendarAppointment(input(), key);
      await q("DELETE FROM services WHERE id=? AND merchant_id=?", [
        serviceId,
        owner.merchantId,
      ]);
      expect(
        await readAppointmentCreationRequest(owner.merchantId, key)
      ).toMatchObject({
        state: "appointment_unavailable",
        appointmentId: first.appointmentId,
      });
      await expect(bookCalendarAppointment(input(), key)).rejects.toThrow();
      expect(await requests()).toHaveLength(1);
    });

    it("atomically remembers a local creation and replays its existing result", async () => {
      const key = identity(),
        first = await bookCalendarAppointment(input(), key),
        second = await bookCalendarAppointment(input(), key);
      expect(first).toMatchObject({
        success: true,
        replayed: false,
        state: "recorded",
        appointmentStatus: "confirmed",
        calendarSyncState: "none",
        requestId: key.requestId,
      });
      expect(second).toEqual({ ...first, replayed: true });
      expect(await rows()).toHaveLength(1);
      expect(await requests()).toHaveLength(1);
      expect(provider.create).not.toHaveBeenCalled();
      expect((await requests())[0]).toMatchObject({
        actor_user_id: owner.userId,
        appointment_reference: first.appointmentId,
      });
      expect(JSON.stringify(await requests())).not.toMatch(
        /966500987654|synthetic|customerName|Test/
      );
    });
    it("does not repeat a confirmed Google POST", async () => {
      await integration();
      const key = identity();
      const first = await bookCalendarAppointment(input(), key),
        second = await bookCalendarAppointment(input(), key);
      expect(second).toMatchObject({
        appointmentId: first.appointmentId,
        replayed: true,
        calendarSyncState: "synced",
      });
      expect(provider.create).toHaveBeenCalledOnce();
      expect(provider.refresh).toHaveBeenCalledOnce();
    });
    it("returns an in-flight reservation while the original provider call runs", async () => {
      await integration();
      const key = identity();
      let release!: () => void, started!: () => void;
      const blocked = new Promise<void>(resolve => {
          release = resolve;
        }),
        dispatched = new Promise<void>(resolve => {
          started = resolve;
        });
      provider.create.mockImplementation(
        async (_credentials, _calendar, event) => {
          started();
          await blocked;
          return { id: event.id };
        }
      );
      const first = bookCalendarAppointment(input(), key);
      await dispatched;
      try {
        const replay = await bookCalendarAppointment(input(), key);
        expect(replay).toMatchObject({
          replayed: true,
          calendarSyncState: "creating",
        });
        expect(
          await readAppointmentCreationRequest(owner.merchantId, key)
        ).toMatchObject({ state: "recorded", calendarSyncState: "creating" });
      } finally {
        release();
        await first;
      }
      expect(provider.create).toHaveBeenCalledOnce();
    });
    it("serializes simultaneous equal request identities", async () => {
      await integration();
      const key = identity();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => bookCalendarAppointment(input(), key))
      );
      expect(new Set(results.map(r => r.appointmentId)).size).toBe(1);
      expect(results.filter(r => !r.replayed)).toHaveLength(1);
      expect(provider.create).toHaveBeenCalledOnce();
      expect(await rows()).toHaveLength(1);
      expect(await requests()).toHaveLength(1);
    });
    it.each(["timeout", "wrong_ack", "auth"])(
      "replays unknown creation without resending after %s",
      async mode => {
        await integration();
        const key = identity();
        if (mode === "auth")
          provider.refresh.mockRejectedValue(Error("private token"));
        else if (mode === "wrong_ack")
          provider.create.mockResolvedValue({ id: "wrong-event" });
        else provider.create.mockRejectedValue(Error("timeout"));
        const first = await bookCalendarAppointment(input(), key),
          second = await bookCalendarAppointment(input(), key);
        expect(first.calendarSyncState).toBe("create_unknown");
        expect(second).toEqual({ ...first, replayed: true });
        expect(provider.create.mock.calls.length).toBe(mode === "auth" ? 0 : 1);
        expect(provider.refresh).toHaveBeenCalledOnce();
      }
    );
    it.each([
      { serviceId: 99999999 },
      { staffId: 99999999 },
      { appointmentDate: "2026-12-21" },
      { startTime: "11:00" },
      { customerPhone: "966500000001" },
      { customerName: "Changed" },
      { notes: "Changed" },
    ])(
      "rejects identity reuse with changed content %j before any provider call",
      async patch => {
        const key = identity();
        await bookCalendarAppointment(input(), key);
        await expect(
          bookCalendarAppointment(input(patch), key)
        ).rejects.toThrow();
        expect(await rows()).toHaveLength(1);
        expect(await requests()).toHaveLength(1);
        expect(provider.create).not.toHaveBeenCalled();
      }
    );
    it("rejects another actor for both replay and lookup", async () => {
      const key = identity();
      await bookCalendarAppointment(input(), key);
      const forged = { ...key, actorUserId: other.userId };
      await expect(bookCalendarAppointment(input(), forged)).rejects.toThrow();
      await expect(
        readAppointmentCreationRequest(owner.merchantId, forged)
      ).rejects.toThrow();
      expect(await requests()).toHaveLength(1);
    });
    it("scopes identical request IDs independently to each tenant", async () => {
      const key = identity(),
        first = await bookCalendarAppointment(input(), key);
      expect(
        await readAppointmentCreationRequest(other.merchantId, {
          ...key,
          actorUserId: other.userId,
        })
      ).toMatchObject({ state: "not_found" });
      const second = await bookCalendarAppointment(
        input({ merchantId: other.merchantId, serviceId: otherServiceId }),
        { ...key, actorUserId: other.userId }
      );
      expect(first.appointmentId).not.toBe(second.appointmentId);
    });
    it("canonicalizes uppercase request IDs and input whitespace", async () => {
      const key = identity();
      const first = await bookCalendarAppointment(
        input({ customerName: " Test " }),
        key
      );
      const second = await bookCalendarAppointment(input(), {
        ...key,
        requestId: key.requestId.toUpperCase(),
      });
      expect(second.appointmentId).toBe(first.appointmentId);
      expect(second.requestId).toBe(key.requestId);
      expect(await requests()).toHaveLength(1);
    });
    it("recovers an existing result even after its service is disabled and repriced", async () => {
      const key = identity(),
        first = await bookCalendarAppointment(input(), key);
      await q(
        "UPDATE services SET is_active=0,base_price=20000,duration_minutes=90 WHERE id=?",
        [serviceId]
      );
      expect(await bookCalendarAppointment(input(), key)).toEqual({
        ...first,
        replayed: true,
      });
      expect((await rows())[0].end_time).toBe("11:00");
    });
    it.each(["cancelled", "completed", "no_show"])(
      "reports current %s status rather than confirming again",
      async status => {
        const key = identity(),
          first = await bookCalendarAppointment(input(), key);
        await q("UPDATE appointments SET status=? WHERE id=?", [
          status,
          first.appointmentId,
        ]);
        const replay = await bookCalendarAppointment(input(), key);
        expect(replay.appointmentStatus).toBe(status);
        expect(replay.appointmentId).toBe(first.appointmentId);
        expect(await rows()).toHaveLength(1);
      }
    );
    it("retains a tombstone after appointment deletion and never recreates it", async () => {
      const key = identity(),
        first = await bookCalendarAppointment(input(), key);
      await q("DELETE FROM appointments WHERE id=? AND merchant_id=?", [
        first.appointmentId,
        owner.merchantId,
      ]);
      expect(
        await readAppointmentCreationRequest(owner.merchantId, key)
      ).toEqual({
        state: "appointment_unavailable",
        requestId: key.requestId,
        appointmentId: first.appointmentId,
      });
      await expect(bookCalendarAppointment(input(), key)).rejects.toThrow();
      expect(await rows()).toHaveLength(0);
      expect(await requests()).toHaveLength(1);
    });
    it("permits an explicitly new request after a cancelled local appointment", async () => {
      const key = identity(),
        first = await bookCalendarAppointment(input(), key);
      await cancelCalendarAppointment(owner.merchantId, {
        appointmentId: first.appointmentId,
      });
      const second = await bookCalendarAppointment(input(), identity());
      expect(second.appointmentId).not.toBe(first.appointmentId);
      expect(await requests()).toHaveLength(2);
    });
    it("does not consume request identity when capacity validation rolls back", async () => {
      await bookCalendarAppointment(input(), identity());
      const key = identity();
      await expect(bookCalendarAppointment(input(), key)).rejects.toThrow();
      expect(
        await readAppointmentCreationRequest(owner.merchantId, key)
      ).toMatchObject({ state: "not_found" });
      expect(
        await bookCalendarAppointment(input({ startTime: "11:00" }), key)
      ).toMatchObject({ replayed: false });
    });
    it.each(["reservation", "provider_ack"])(
      "recovers result after lost %s commit acknowledgement without POST retry",
      async phase => {
        await integration();
        const key = identity(),
          pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        let commits = 0;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await original(), {
              get(target, prop) {
                if (prop === "commit")
                  return async () => {
                    await target.commit();
                    if (++commits === (phase === "reservation" ? 1 : 2))
                      throw Error("lost ack");
                  };
                const value = Reflect.get(target, prop);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
        );
        await expect(bookCalendarAppointment(input(), key)).rejects.toThrow();
        spy.mockRestore();
        const result = await bookCalendarAppointment(input(), key);
        expect(result).toMatchObject({
          replayed: true,
          calendarSyncState: phase === "reservation" ? "creating" : "synced",
        });
        expect(provider.create.mock.calls.length).toBe(
          phase === "reservation" ? 0 : 1
        );
        expect(await rows()).toHaveLength(1);
        expect(await requests()).toHaveLength(1);
      }
    );
    it("rolls reservation back if the durable request write fails", async () => {
      const key = identity(),
        pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, prop) {
              if (prop === "execute")
                return async (sql: string, args: any[]) => {
                  if (sql.includes("INSERT INTO appointment_creation_requests"))
                    throw Error("audit storage failure");
                  return target.execute(sql, args);
                };
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      await expect(bookCalendarAppointment(input(), key)).rejects.toThrow();
      spy.mockRestore();
      expect(await rows()).toHaveLength(0);
      expect(await requests()).toHaveLength(0);
      expect(provider.create).not.toHaveBeenCalled();
      expect(await bookCalendarAppointment(input(), key)).toMatchObject({
        replayed: false,
      });
    });
    it("fails closed before reservation and lookup on missing schema", async () => {
      vi.spyOn(readiness, "assertRuntimeSchema").mockRejectedValue(
        Error("missing schema")
      );
      await expect(
        bookCalendarAppointment(input(), identity())
      ).rejects.toThrow();
      await expect(
        readAppointmentCreationRequest(owner.merchantId, identity())
      ).rejects.toThrow();
      expect(await rows()).toHaveLength(0);
      expect(provider.create).not.toHaveBeenCalled();
    });
    it.each([
      { actorUserId: 0 },
      { actorUserId: 1.5 },
      { requestId: "not-a-uuid" },
      { requestId: undefined },
      { injected: true },
    ])("rejects invalid identity %j", async patch => {
      await expect(
        reserveCalendarAppointmentRequest(input(), identity(patch))
      ).rejects.toThrow();
      expect(await rows()).toHaveLength(0);
      expect(await requests()).toHaveLength(0);
    });
    it("keeps lookup free of private input, provider binding and side effects", async () => {
      await integration();
      const key = identity();
      expect(
        await readAppointmentCreationRequest(owner.merchantId, key)
      ).toEqual({ state: "not_found", requestId: key.requestId });
      await bookCalendarAppointment(input({ notes: "private-notes" }), key);
      const result = await readAppointmentCreationRequest(
        owner.merchantId,
        key
      );
      expect(Object.keys(result).sort()).toEqual(
        [
          "appointmentId",
          "appointmentStatus",
          "calendarSyncState",
          "requestId",
          "state",
        ].sort()
      );
      expect(JSON.stringify(result)).not.toMatch(
        /private|synthetic|966500|hash|credential/i
      );
      expect(provider.create).toHaveBeenCalledOnce();
    });
  }
);
