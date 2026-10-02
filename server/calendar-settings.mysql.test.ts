import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  readCalendarSettings,
  disconnectCalendar,
  calendarSettingsStore,
} from "./calendar-settings";
import {
  beginCalendarOAuth,
  completeCalendarOAuth,
  calendarOAuthStore,
} from "./calendar-oauth";
import { createSessionId, hashSessionId } from "./_core/session-security";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "calendar settings and reviewed disconnect on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      sessionId: string,
      config: any;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const scope = () => ({ ...owner, sessionId });
    const read = () => readCalendarSettings(scope());
    const create = async (p: Record<string, any> = {}) =>
      Number(
        (
          await q(
            "INSERT INTO google_integrations (merchant_id,integration_type,credentials,calendar_id,is_active,settings) VALUES (?,'calendar',?,?,?,?)",
            [
              p.merchant ?? owner.merchantId,
              p.credentials ??
                JSON.stringify({ refresh_token: "PRIVATE_REFRESH" }),
              p.calendar ?? "primary",
              p.active ?? 1,
              JSON.stringify({ custom: "preserve" }),
            ]
          )
        ).insertId
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("calendar-settings");
      other = await createDisposableMerchant("calendar-other");
      sessionId = createSessionId();
      await q(
        "INSERT INTO auth_sessions (user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))",
        [owner.userId, hashSessionId(sessionId)]
      );
      config = {
        id: 280,
        clientId: "PRIVATE_CLIENT",
        clientSecret: "PRIVATE_SECRET",
        is_enabled: 1,
      };
      const wrap =
        (original: typeof calendarSettingsStore.transaction) =>
        <T>(run: Parameters<typeof original<T>>[0]) =>
          original<T>(c =>
            run(
              new Proxy(c, {
                get(target, key) {
                  if (key === "execute")
                    return async (sql: string, args: any[]) => {
                      const result = await target.execute(sql, args);
                      return sql.includes("FROM google_oauth_settings")
                        ? [[config], []]
                        : result;
                    };
                  const v = Reflect.get(target, key);
                  return typeof v === "function" ? v.bind(target) : v;
                },
              })
            )
          );
      const settingsTransaction = calendarSettingsStore.transaction,
        oauthTransaction = calendarOAuthStore.transaction;
      vi.spyOn(calendarSettingsStore, "transaction").mockImplementation(
        wrap(settingsTransaction)
      );
      vi.spyOn(calendarOAuthStore, "transaction").mockImplementation(
        wrap(oauthTransaction)
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);
    it("reports unlinked and configured states without returning credentials", async () => {
      expect(await read()).toMatchObject({
        state: "unlinked",
        active: false,
        hasIntegration: false,
        oauthReady: true,
        retainedAppointments: 0,
      });
      await create();
      const v = await read();
      expect(v).toMatchObject({
        state: "configured",
        active: true,
        calendarId: "primary",
      });
      expect(JSON.stringify(v)).not.toContain("PRIVATE");
    });
    it.each([
      ["invalid", "not-json", "primary", 1, "credentials_invalid"],
      [
        "expired",
        JSON.stringify({ access_token: "old", expiry_date: 1 }),
        "primary",
        1,
        "credentials_invalid",
      ],
      [
        "missing-target",
        JSON.stringify({ refresh_token: "valid" }),
        "",
        1,
        "needs_destination",
      ],
      ["inactive", "broken", "primary", 0, "unlinked"],
    ])(
      "distinguishes %s state",
      async (_, credentials, calendar, active, state) => {
        await create({ credentials, calendar, active });
        expect((await read()).state).toBe(state);
      }
    );
    it("shows disabled OAuth without preventing a reviewed disconnect", async () => {
      await create();
      config.is_enabled = 0;
      const v = await read();
      expect(v.state).toBe("oauth_disabled");
      expect(
        await disconnectCalendar(scope(), {
          expectedDigest: v.digest,
          reviewed: true,
        })
      ).toMatchObject({ state: "unlinked", active: false });
    });
    it("rejects duplicate account rows instead of choosing one arbitrarily", async () => {
      await create();
      await create();
      await expect(read()).rejects.toMatchObject({ reason: "changed" });
    });
    it("rejects stale source evidence and retains other tenant credentials", async () => {
      await create();
      const otherId = await create({ merchant: other.merchantId }),
        v = await read();
      config.clientId = "CHANGED";
      await expect(
        disconnectCalendar(scope(), {
          expectedDigest: v.digest,
          reviewed: true,
        })
      ).rejects.toMatchObject({ reason: "changed" });
      expect(
        (
          await q("SELECT credentials FROM google_integrations WHERE id=?", [
            otherId,
          ])
        )[0].credentials
      ).toContain("PRIVATE_REFRESH");
    });
    it("disables local credentials but retains integration identity, appointments and saved targets", async () => {
      const integration = await create(),
        service = (
          await q(
            "INSERT INTO services (merchant_id,name,duration_minutes) VALUES (?,'Test',60)",
            [owner.merchantId]
          )
        ).insertId;
      await q(
        "INSERT INTO appointments (merchant_id,service_id,customer_phone,appointment_date,start_time,end_time,status,calendar_sync_state,calendar_integration_id,calendar_target_id,google_event_id) VALUES (?,?,'966500000000','2026-12-20','10:00','11:00','confirmed','synced',?,'primary','stored-event')",
        [owner.merchantId, service, integration]
      );
      const before = (
          await q("SELECT * FROM appointments WHERE merchant_id=?", [
            owner.merchantId,
          ])
        )[0],
        v = await read();
      expect(v.retainedAppointments).toBe(1);
      const result = await disconnectCalendar(scope(), {
        expectedDigest: v.digest,
        reviewed: true,
      });
      expect(result).toMatchObject({
        success: true,
        state: "unlinked",
        active: false,
        calendarId: "primary",
        retainedAppointments: 1,
      });
      expect(
        (
          await q("SELECT * FROM appointments WHERE merchant_id=?", [
            owner.merchantId,
          ])
        )[0]
      ).toEqual(before);
      const row = (
        await q("SELECT * FROM google_integrations WHERE id=?", [integration])
      )[0];
      expect(row.credentials).toBeNull();
      expect(row.is_active).toBe(0);
      expect(JSON.parse(row.settings)).toEqual({ custom: "preserve" });
    });
    it("invalidates pending and already exchanged grants on disconnect", async () => {
      await create();
      const begun = await beginCalendarOAuth(scope()),
        state = new URL(begun.authorizationUrl).searchParams.get("state")!;
      const exchange = vi.fn().mockImplementation(async () => {
        const v = await read();
        await disconnectCalendar(scope(), {
          expectedDigest: v.digest,
          reviewed: true,
        });
        return {
          access_token: "new",
          refresh_token: "new-refresh",
          token_type: "Bearer",
          expiry_date: Date.now() + 3600000,
        };
      });
      await expect(
        completeCalendarOAuth(
          { userId: owner.userId, sessionId, state, code: "test-code" },
          exchange
        )
      ).rejects.toMatchObject({ reason: "changed" });
      expect((await read()).active).toBe(false);
      expect(
        await q("SELECT id FROM calendar_oauth_states WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("rechecks role and session under the write lock", async () => {
      await create();
      const v = await read();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, owner.userId]
      );
      await expect(
        disconnectCalendar(scope(), {
          expectedDigest: v.digest,
          reviewed: true,
        })
      ).rejects.toMatchObject({ reason: "forbidden" });
      await q(
        "UPDATE merchant_members SET role='owner' WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, owner.userId]
      );
      await q("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=?", [
        owner.userId,
      ]);
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
    });
  }
);
