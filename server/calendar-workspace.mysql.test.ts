import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, getDb, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readCalendarWorkspace,
  readCalendarDetails,
  readCalendarStats,
} from "./calendar-workspace";
import { calendarRouter } from "./routers-calendar";
describe.skipIf(!process.env.DATABASE_URL)(
  "complete calendar workspace on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      member: typeof owner;
    let service: number,
      foreignService: number,
      staff: number,
      foreignStaff: number;
    const q = async (text: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(text, args))[0];
    const range = { startDate: "2026-10-01", endDate: "2026-10-31" };
    const list = (patch: Record<string, unknown> = {}) =>
      readCalendarWorkspace(owner.userId, owner.merchantId, {
        ...range,
        ...patch,
      });
    const detail = (appointmentId: number) =>
      readCalendarDetails(owner.userId, owner.merchantId, { appointmentId });
    const book = async (p: Record<string, any> = {}) =>
      Number(
        (
          await q(
            "INSERT INTO appointments (merchant_id,service_id,staff_id,customer_name,customer_phone,notes,appointment_date,start_time,end_time,status,calendar_sync_state) VALUES (?,?,?,?,?,'Detail only',?,?,?,?,?)",
            [
              p.merchant ?? owner.merchantId,
              p.service ?? service,
              p.staff ?? staff,
              p.name ?? "Scoped customer",
              "966500987654",
              p.date ?? "2026-10-02 00:00:00",
              p.start ?? "10:00",
              p.end ?? "11:00",
              p.status ?? "pending",
              p.sync ?? "none",
            ]
          )
        ).insertId
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("calendar-space");
      other = await createDisposableMerchant("calendar-other");
      member = await createDisposableMerchant("calendar-viewer");
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, member.userId]
      );
      service = Number(
        (
          await q(
            "INSERT INTO services (merchant_id,name,is_active,duration_minutes) VALUES (?,'Own service',1,60)",
            [owner.merchantId]
          )
        ).insertId
      );
      foreignService = Number(
        (
          await q(
            "INSERT INTO services (merchant_id,name,is_active,duration_minutes) VALUES (?,'Secret foreign service',1,60)",
            [other.merchantId]
          )
        ).insertId
      );
      staff = Number(
        (
          await q(
            "INSERT INTO staff_members (merchant_id,name,is_active) VALUES (?,'Own provider',1)",
            [owner.merchantId]
          )
        ).insertId
      );
      foreignStaff = Number(
        (
          await q(
            "INSERT INTO staff_members (merchant_id,name,is_active) VALUES (?,'Secret foreign provider',1)",
            [other.merchantId]
          )
        ).insertId
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([
        owner.userId,
        other.userId,
        member.userId,
      ]);
    });
    afterAll(closeDb);
    it("counts complete inclusive dates and every status for the selected membership", async () => {
      for(const status of ['pending','confirmed','cancelled','completed','no_show'])await book({status,date:'2026-10-31 23:59:59'});
      await book({date:'2026-11-01 00:00:00'});
      await book({date:'2026-09-30 23:59:59'});
      await book({merchant:other.merchantId,date:'2026-10-31 23:59:59'});
      expect(await readCalendarStats(member.userId,owner.merchantId,range)).toMatchObject({actorId:member.userId,merchantId:owner.merchantId,total:5,pending:1,confirmed:1,cancelled:1,completed:1,noShow:1,unknown:0});
      expect((await readCalendarStats(member.userId,owner.merchantId,{})).total).toBe(7);
      expect((await readCalendarStats(member.userId,owner.merchantId,{startDate:'2026-10-31'})).total).toBe(6);
      expect((await readCalendarStats(member.userId,owner.merchantId,{endDate:'2026-10-31'})).total).toBe(6);
      const caller=calendarRouter.createCaller({user:{id:member.userId,role:'user'},req:{headers:{'x-merchant-id':String(owner.merchantId)}},res:{}} as any);
      expect(await caller.getStats(range)).toMatchObject({merchantId:owner.merchantId,total:5,canManage:false});
      await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[owner.merchantId,member.userId]);
      await expect(caller.getStats(range)).rejects.toMatchObject({code:'FORBIDDEN'});
    });
    it("returns complete empty and out-of-range pages", async () => {
      expect(await list()).toMatchObject({
        actorId: owner.userId,
        merchantId: owner.merchantId,
        rows: [],
        days: [],
        summary: { total: 0 },
        pagination: { pages: 0 },
      });
      await book();
      expect(await list({ page: 1_000_000 })).toMatchObject({
        rows: [],
        days: [{ date: "2026-10-02", total: 1 }],
        summary: { total: 1 },
        pagination: { pages: 1 },
      });
    });
    it("pages and searches every appointment beyond the old 500 limit", async () => {
      const ids: number[] = [];
      for (let i = 0; i < 503; i++)
        ids.push(await book({ name: i === 502 ? "Last needle" : "Customer" }));
      await book({ merchant: other.merchantId, name: "Foreign customer" });
      const first = await list(),
        last = await list({ page: 21 });
      expect(first.rows.map(r => r.id)).toEqual(ids.slice(0, 25));
      expect(last.rows.map(r => r.id)).toEqual(ids.slice(500));
      expect(first.summary.total).toBe(503);
      expect((await readCalendarStats(owner.userId,owner.merchantId,range)).total).toBe(503);
      expect(first.days).toEqual([{ date: "2026-10-02", total: 503 }]);
      expect(
        (await list({ search: "last NEEDLE" })).rows.map(r => r.id)
      ).toEqual([ids[502]]);
      expect(JSON.stringify(first)).not.toContain("Foreign customer");
      expect(JSON.stringify(first)).not.toContain("Detail only");
    });
    it("keeps all filters, day counts and summaries aligned with full inclusive calendar days", async () => {
      await book({
        status: "confirmed",
        sync: "synced",
        date: "2026-10-31 23:59:59",
      });
      await book({ status: "confirmed", sync: "synced" });
      await book({ status: "pending", sync: "create_unknown" });
      await book({ date: "2026-11-01 00:00:00" });
      const value = await list({
        status: "confirmed",
        sync: "synced",
        serviceId: service,
        staffId: staff,
      });
      expect(value.summary).toMatchObject({
        total: 2,
        counts: { confirmed: 2, pending: 0 },
        sync: { synced: 2, none: 0 },
      });
      expect(value.days).toEqual([
        { date: "2026-10-02", total: 1 },
        { date: "2026-10-31", total: 1 },
      ]);
      expect((await list({ startDate: "2026-10-31" })).summary.total).toBe(1);
    });
    it("uses literal search and scoped names without wildcard or SQL expansion", async () => {
      const id = await book({ name: "Literal %_\\' value" });
      await book();
      expect((await list({ search: "%_\\'" })).rows.map(r => r.id)).toEqual([
        id,
      ]);
      for (const search of ["966500987654", "Own service", "Own provider"])
        expect((await list({ search })).summary.total).toBe(2);
      expect((await list({ search: "' OR 1=1 --" })).summary.total).toBe(0);
    });
    it("redacts foreign reference names and rejects foreign details and filters", async () => {
      const id = await book({ service: foreignService, staff: foreignStaff }),
        foreign = await book({ merchant: other.merchantId });
      const v = await detail(id);
      expect(v.appointment.service).toEqual({
        id: foreignService,
        name: null,
        isActive: null,
      });
      expect(v.appointment.staff).toEqual({
        id: foreignStaff,
        name: null,
        isActive: null,
      });
      expect(v.appointment.issues).toEqual(
        expect.arrayContaining(["serviceReference", "staffReference"])
      );
      expect(JSON.stringify(await list())).not.toContain("Secret foreign");
      expect((await list({ search: "Secret foreign" })).summary.total).toBe(0);
      await expect(detail(foreign)).rejects.toThrow(
        "Appointment or reference not found"
      );
      for (const filter of [
        { serviceId: foreignService },
        { staffId: foreignStaff },
      ])
        await expect(list(filter)).rejects.toThrow(
          "Appointment or reference not found"
        );
    });
    it("keeps inactive owned references and all saved public detail fields", async () => {
      const id = await book();
      const integration = Number(
        (
          await q(
            "INSERT INTO google_integrations (merchant_id,integration_type,credentials,calendar_id,is_active) VALUES (?,'calendar','SECRET','owned@example.test',0)",
            [owner.merchantId]
          )
        ).insertId
      );
      await q("UPDATE services SET is_active=0 WHERE id=?", [service]);
      await q("UPDATE staff_members SET is_active=0 WHERE id=?", [staff]);
      await q(
        "UPDATE appointments SET cancellation_reason='Customer request',google_event_id='saved-event',calendar_integration_id=?,calendar_target_id='owned@example.test',calendar_event_reference='local-reference',calendar_review_revision=3,reminder_24h_sent=1,created_at='2026-10-01 09:00:00',updated_at='2026-10-02 10:00:00' WHERE id=?",
        [integration, id]
      );
      const v = await detail(id);
      expect(v.appointment).toMatchObject({
        service: { isActive: false },
        staff: { isActive: false },
        notes: "Detail only",
        cancellationReason: "Customer request",
        googleEventId: "saved-event",
        integrationId: integration,
        calendarTargetId: "owned@example.test",
        eventReference: "local-reference",
        reviewRevision: 3,
        reminder24hSent: true,
        reminder1hSent: false,
        createdAt: "2026-10-01T09:00:00Z",
        updatedAt: "2026-10-02T10:00:00Z",
        issues: [],
      });
      expect(JSON.stringify(v)).not.toContain("SECRET");
      expect(
        (await list({ serviceId: service, staffId: staff })).summary.total
      ).toBe(1);
    });
    it("hides the saved calendar target when its integration belongs to another tenant", async () => {
      const id = await book(),
        integration = Number(
          (
            await q(
              "INSERT INTO google_integrations (merchant_id,integration_type,credentials,calendar_id,is_active) VALUES (?,'calendar','SECRET','foreign@example.test',1)",
              [other.merchantId]
            )
          ).insertId
        );
      await q(
        "UPDATE appointments SET calendar_integration_id=?,calendar_target_id='foreign@example.test' WHERE id=?",
        [integration, id]
      );
      expect((await detail(id)).appointment).toMatchObject({
        integrationId: integration,
        calendarTargetId: null,
        issues: ["integrationReference"],
      });
      expect(JSON.stringify(await detail(id))).not.toContain(
        "foreign@example.test"
      );
    });
    it("keeps malformed legacy status, sync and time explicit instead of dropping the page", async () => {
      const id = await book({ start: "bad", end: "25:00" });
      const connection = await (await getPool())!.getConnection(),
        [modes] = await connection.query<any[]>(
          "SELECT @@SESSION.sql_mode AS value"
        );
      try {
        await connection.query("SET SESSION sql_mode=''");
        await connection.execute(
          "UPDATE appointments SET status='',calendar_sync_state='',reminder_24h_sent=7,calendar_review_revision=-1 WHERE id=?",
          [id]
        );
      } finally {
        await connection.query("SET SESSION sql_mode=?", [modes[0].value]);
        connection.release();
      }
      expect(
        (await list({ status: "unknown", sync: "unknown" })).summary
      ).toMatchObject({
        total: 1,
        counts: { unknown: 1 },
        sync: { unknown: 1 },
      });
      expect((await detail(id)).appointment).toMatchObject({
        status: "unknown",
        sync: "unknown",
        startTime: null,
        endTime: null,
        reminder24hSent: null,
        reviewRevision: null,
      });
      const reversed = await book({ start: "12:00", end: "11:00" });
      expect((await detail(reversed)).appointment.issues).toContain("schedule");
    });
    it("holds aggregates, days, rows and reference labels in one concurrent snapshot", async () => {
      await book();
      const db = (await getDb())!,
        transaction = db.transaction.bind(db);
      let injected = false;
      vi.spyOn(db, "transaction").mockImplementation(((
        callback: any,
        config: any
      ) =>
        transaction(async tx => {
          const execute = tx.execute.bind(tx);
          vi.spyOn(tx, "execute").mockImplementation((async (query: any) => {
            const result = await execute(query);
            if (!injected) {
              injected = true;
              await book({ date: "2026-10-03" });
              await q(
                "UPDATE services SET name='Changed concurrently' WHERE id=?",
                [service]
              );
            }
            return result;
          }) as any);
          return callback(tx);
        }, config)) as any);
      const first = await list();
      expect(first.summary.total).toBe(1);
      expect(first.days).toEqual([{ date: "2026-10-02", total: 1 }]);
      expect(first.rows[0].service.name).toBe("Own service");
      vi.restoreAllMocks();
      const second = await list();
      expect(second.summary.total).toBe(2);
      expect(second.days).toHaveLength(2);
      expect(second.rows[0].service.name).toBe("Changed concurrently");
    });
    it("honors real viewer membership and rejects revoked access", async () => {
      const id = await book(),
        caller = calendarRouter.createCaller({
          user: { id: member.userId, role: "user" },
          req: { headers: { "x-merchant-id": String(owner.merchantId) } },
          res: {},
        } as any);
      expect(await caller.workspace(range)).toMatchObject({
        actorId: member.userId,
        merchantId: owner.merchantId,
        canManage: false,
        canManageIntegration: false,
        summary: { total: 1 },
      });
      expect((await caller.details({ appointmentId: id })).canManage).toBe(
        false
      );
      await q(
        "UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, member.userId]
      );
      await expect(caller.workspace(range)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(caller.details({ appointmentId: id })).rejects.toMatchObject(
        { code: "FORBIDDEN" }
      );
    });
  }
);
