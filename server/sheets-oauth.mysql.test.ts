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
  beginSheetsOAuth,
  completeSheetsOAuth,
  sheetsOAuthStore,
} from "./sheets-oauth";
import { createSessionId, hashSessionId } from "./_core/session-security";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "Sheets OAuth in disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      sessionId: string,
      config: any;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const begin = () => beginSheetsOAuth({ ...owner, sessionId });
    const stateFrom = (r: { authorizationUrl: string }) =>
      new URL(r.authorizationUrl).searchParams.get("state")!;
    const exchange = vi.fn();
    const finish = (state: string, rest: any = {}) =>
      completeSheetsOAuth(
        { userId: owner.userId, sessionId, state, code: "fake-code", ...rest },
        exchange
      );
    const connection = () =>
      q(
        "SELECT * FROM google_integrations WHERE merchant_id=? AND integration_type='sheets'",
        [owner.merchantId]
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("oauth114");
      other = await createDisposableMerchant("oauth114-other");
      sessionId = createSessionId();
      await q(
        "INSERT INTO auth_sessions (user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))",
        [owner.userId, hashSessionId(sessionId)]
      );
      config = {
        id: 114,
        clientId: "private-client",
        clientSecret: "private-secret",
        is_enabled: 1,
      };
      const original = sheetsOAuthStore.transaction;
      vi.spyOn(sheetsOAuthStore, "transaction").mockImplementation(run =>
        original(c =>
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
        )
      );
      exchange
        .mockReset()
        .mockResolvedValue({
          access_token: "new-access",
          refresh_token: "new-refresh",
          token_type: "Bearer",
          expiry_date: Date.now() + 3600000,
        });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("stores only state/session/source digests and returns a fully resolved URL with the registered callback", async () => {
      const r = await begin(),
        url = new URL(r.authorizationUrl),
        state = stateFrom(r);
      expect(url.origin + url.pathname).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth"
      );
      expect(new URL(url.searchParams.get("redirect_uri")!).pathname).toBe(
        "/api/auth/oauth/google/sheets/callback"
      );
      expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const rows = await q(
        "SELECT * FROM sheets_oauth_states WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(rows).toHaveLength(1);
      const stored = JSON.stringify(rows);
      for (const secret of [state, sessionId, "private-secret"])
        expect(stored).not.toContain(secret);
      expect(rows[0].state_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(await finish(state)).toMatchObject({
        cancelled: false,
        merchantId: owner.merchantId,
      });
      const saved = await connection();
      expect(saved).toHaveLength(1);
      expect(JSON.parse(saved[0].credentials).access_token).toBe("new-access");
      expect(
        await q("SELECT id FROM google_integrations WHERE merchant_id=?", [
          other.merchantId,
        ])
      ).toHaveLength(0);
    });
    it.each([
      "different-session",
      "different-user",
      "numeric-state",
      "expired",
    ])("blocks %s before exchanging", async mode => {
      const state = stateFrom(await begin());
      if (mode === "expired")
        await q(
          "UPDATE sheets_oauth_states SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE merchant_id=?",
          [owner.merchantId]
        );
      await expect(
        finish(
          mode === "numeric-state" ? String(owner.merchantId) : state,
          mode === "different-session"
            ? { sessionId: createSessionId() }
            : mode === "different-user"
              ? { userId: other.userId }
              : {}
        )
      ).rejects.toMatchObject({ reason: "invalid_state" });
      expect(exchange).not.toHaveBeenCalled();
      expect(await connection()).toHaveLength(0);
    });
    it("allows only one concurrent exchange and never replays a consumed attempt", async () => {
      const state = stateFrom(await begin());
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => finish(state))
      );
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(exchange).toHaveBeenCalledTimes(1);
      await expect(finish(state)).rejects.toMatchObject({
        reason: "invalid_state",
      });
      expect(await connection()).toHaveLength(1);
    });
    it("serializes concurrent begins and replaces an older expired request after the cooldown", async () => {
      const results = await Promise.allSettled([begin(), begin(), begin()]);
      const accepted = results.filter(
        r => r.status === "fulfilled"
      ) as PromiseFulfilledResult<Awaited<ReturnType<typeof begin>>>[];
      expect(accepted).toHaveLength(1);
      await q(
        "UPDATE sheets_oauth_states SET created_at=DATE_SUB(NOW(),INTERVAL 11 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      const next = stateFrom(await begin());
      await expect(finish(stateFrom(accepted[0].value))).rejects.toMatchObject({
        reason: "invalid_state",
      });
      await finish(next);
      expect(exchange).toHaveBeenCalledTimes(1);
    });
    it("consumes cancellation without changing the previous connection", async () => {
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,credentials,sheet_id,settings) VALUES (?,'sheets','old','old-sheet',?)",
        [owner.merchantId, JSON.stringify({ sendDailyReports: true })]
      );
      const before = await connection(),
        state = stateFrom(await begin());
      expect(
        await finish(state, { code: undefined, denied: true })
      ).toMatchObject({ cancelled: true });
      expect(await connection()).toEqual(before);
      expect(exchange).not.toHaveBeenCalled();
      await expect(finish(state)).rejects.toMatchObject({
        reason: "invalid_state",
      });
    });
    it("clears the old account destination and schedules only after a successful new grant", async () => {
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,credentials,sheet_id,settings) VALUES (?,'sheets','old','old-sheet',?)",
        [owner.merchantId, JSON.stringify({ sendDailyReports: true })]
      );
      await finish(stateFrom(await begin()));
      const [saved] = await connection();
      expect(saved.sheet_id).toBeNull();
      expect(saved.settings).toBeNull();
      expect(saved.last_sync).toBeNull();
      expect(saved.is_active).toBe(1);
    });
    it.each([
      "viewer",
      "inactive-member",
      "suspended",
      "revoked-session",
      "disabled-oauth",
    ])("rejects %s before creating a state", async mode => {
      if (mode === "viewer" || mode === "inactive-member")
        await q(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,?)",
          [
            owner.merchantId,
            owner.userId,
            mode === "viewer" ? "viewer" : "owner",
            mode === "viewer" ? 1 : 0,
          ]
        );
      if (mode === "suspended")
        await q("UPDATE merchants SET status='suspended' WHERE id=?", [
          owner.merchantId,
        ]);
      if (mode === "revoked-session")
        await q("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=?", [
          owner.userId,
        ]);
      if (mode === "disabled-oauth") config.is_enabled = 0;
      await expect(begin()).rejects.toBeTruthy();
      expect(
        await q("SELECT id FROM sheets_oauth_states WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
    });
    it.each(["permission", "session", "credentials", "config", "new-request"])(
      "does not save after %s changes while waiting for the provider",
      async mode => {
        await q(
          "INSERT INTO google_integrations (merchant_id,integration_type,credentials,sheet_id) VALUES (?,'sheets','old','old-sheet')",
          [owner.merchantId]
        );
        const state = stateFrom(await begin());
        exchange.mockImplementation(async () => {
          if (mode === "permission")
            await q(
              "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
              [owner.merchantId, owner.userId]
            );
          if (mode === "session")
            await q(
              "UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=?",
              [owner.userId]
            );
          if (mode === "credentials")
            await q(
              "UPDATE google_integrations SET credentials='changed' WHERE merchant_id=?",
              [owner.merchantId]
            );
          if (mode === "config") config.clientSecret = "changed";
          if (mode === "new-request") {
            await q(
              "UPDATE sheets_oauth_states SET created_at=DATE_SUB(NOW(),INTERVAL 11 SECOND) WHERE merchant_id=?",
              [owner.merchantId]
            );
            await begin();
          }
          return {
            access_token: "new-access",
            refresh_token: "new-refresh",
            token_type: "Bearer",
            expiry_date: Date.now() + 3600000,
          };
        });
        await expect(finish(state)).rejects.toBeTruthy();
        const [saved] = await connection();
        expect(saved.credentials).toBe(
          mode === "credentials" ? "changed" : "old"
        );
        expect(saved.sheet_id).toBe("old-sheet");
      }
    );
    it("never retries a rejected code exchange and preserves existing credentials", async () => {
      const state = stateFrom(await begin());
      exchange.mockRejectedValue(Error("provider unavailable"));
      await expect(finish(state)).rejects.toThrow();
      await expect(finish(state)).rejects.toMatchObject({
        reason: "invalid_state",
      });
      expect(exchange).toHaveBeenCalledTimes(1);
      expect(await connection()).toHaveLength(0);
    });
  }
);
