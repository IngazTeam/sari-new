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
  readSheetsSettings,
  writeSheetsReportSettings,
  disconnectSheets,
  sheetsSettingsStore,
} from "./sheets-settings";
import { createSessionId, hashSessionId } from "./_core/session-security";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "Sheets settings on disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      sessionId: string;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const scope = () => ({ ...owner, sessionId });
    const view = () => readSheetsSettings(scope());
    beforeEach(async () => {
      owner = await createDisposableMerchant("settings115");
      other = await createDisposableMerchant("settings-other");
      sessionId = createSessionId();
      await q(
        "INSERT INTO auth_sessions (user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))",
        [owner.userId, hashSessionId(sessionId)]
      );
      for (const tenant of [owner, other])
        await q(
          "INSERT INTO google_integrations (merchant_id,integration_type,credentials,sheet_id,settings) VALUES (?,'sheets',?,'local',?)",
          [
            tenant.merchantId,
            JSON.stringify({ refresh_token: "private" }),
            JSON.stringify({ sendDailyReports: false, custom: "keep" }),
          ]
        );
      const original = sheetsSettingsStore.transaction;
      vi.spyOn(sheetsSettingsStore, "transaction").mockImplementation(run =>
        original(c =>
          run(
            new Proxy(c, {
              get(target, key) {
                if (key === "execute")
                  return async (sql: string, args: any[]) => {
                    const result = await target.execute(sql, args);
                    return sql.includes("FROM google_oauth_settings")
                      ? [
                          [
                            {
                              id: 115,
                              clientId: "private",
                              clientSecret: "private",
                              is_enabled: 1,
                            },
                          ],
                          [],
                        ]
                      : result;
                  };
                const v = Reflect.get(target, key);
                return typeof v === "function" ? v.bind(target) : v;
              },
            })
          )
        )
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("writes the selected connection only and rejects stale concurrent updates", async () => {
      const v = await view(),
        before = await q(
          "SELECT * FROM google_integrations WHERE merchant_id=?",
          [other.merchantId]
        );
      const results = await Promise.allSettled([
        writeSheetsReportSettings(scope(), {
          expectedDigest: v.digest,
          reviewed: true,
          changes: { sendDailyReports: true },
        }),
        writeSheetsReportSettings(scope(), {
          expectedDigest: v.digest,
          reviewed: true,
          changes: { sendWeeklyReports: true },
        }),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await q("SELECT * FROM google_integrations WHERE merchant_id=?", [
          other.merchantId,
        ])
      ).toEqual(before);
      const latest = await view();
      expect(latest.digest).not.toBe(v.digest);
      expect(
        Number(latest.reports.sendDailyReports) +
          Number(latest.reports.sendWeeklyReports)
      ).toBe(1);
    });
    it("disconnects with a verified snapshot and cancels pending grants", async () => {
      const v = await view();
      await q(
        "INSERT INTO sheets_oauth_states (merchant_id,user_id,state_hash,session_hash,source_hash,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE))",
        [
          owner.merchantId,
          owner.userId,
          "a".repeat(64),
          "b".repeat(64),
          "c".repeat(64),
        ]
      );
      const result = await disconnectSheets(scope(), {
        expectedDigest: v.digest,
        reviewed: true,
      });
      expect(result.state).toBe("unlinked");
      const [row] = await q(
        "SELECT * FROM google_integrations WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(row.credentials).toBeNull();
      expect(row.sheet_id).toBeNull();
      expect(JSON.parse(row.settings)).toEqual({
        custom: "keep",
        sendDailyReports: false,
        sendWeeklyReports: false,
        sendMonthlyReports: false,
      });
      const [attempt] = await q(
        "SELECT consumed_at FROM sheets_oauth_states WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(attempt.consumed_at).not.toBeNull();
    });
    it.each(["viewer", "inactive", "revoked", "other-tenant"])(
      "blocks read and write after %s",
      async mode => {
        const v = await view();
        let target = scope();
        if (mode === "viewer" || mode === "inactive")
          await q(
            "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,?)",
            [
              owner.merchantId,
              owner.userId,
              mode === "viewer" ? "viewer" : "owner",
              mode === "inactive" ? 0 : 1,
            ]
          );
        if (mode === "revoked")
          await q("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=?", [
            owner.userId,
          ]);
        if (mode === "other-tenant")
          target = { ...target, merchantId: other.merchantId };
        const before = await q(
          "SELECT * FROM google_integrations WHERE merchant_id IN (?,?)",
          [owner.merchantId, other.merchantId]
        );
        await expect(readSheetsSettings(target)).rejects.toMatchObject({
          reason: "forbidden",
        });
        await expect(
          writeSheetsReportSettings(target, {
            expectedDigest: v.digest,
            reviewed: true,
            changes: { sendDailyReports: true },
          })
        ).rejects.toMatchObject({ reason: "forbidden" });
        await expect(
          disconnectSheets(target, { expectedDigest: v.digest, reviewed: true })
        ).rejects.toMatchObject({ reason: "forbidden" });
        expect(
          await q(
            "SELECT * FROM google_integrations WHERE merchant_id IN (?,?)",
            [owner.merchantId, other.merchantId]
          )
        ).toEqual(before);
      }
    );
    it("does not overwrite reconnection with a stale disconnect", async () => {
      const v = await view();
      await q(
        "UPDATE google_integrations SET credentials=? WHERE merchant_id=?",
        [JSON.stringify({ refresh_token: "new" }), owner.merchantId]
      );
      await expect(
        disconnectSheets(scope(), { expectedDigest: v.digest, reviewed: true })
      ).rejects.toMatchObject({ reason: "changed" });
      expect((await view()).isConnected).toBe(true);
    });
  }
);
