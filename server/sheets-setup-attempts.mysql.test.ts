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
const m = vi.hoisted(() => ({
  create: vi.fn(),
  accepted: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("./sheets-setup-provider", async original => ({
  ...(await original<typeof import("./sheets-setup-provider")>()),
  createSheetsWorkspace: m.create,
}));
vi.mock("./api/distributed-rate-limit", () => ({
  reserveApiRateLimit: m.rate,
}));
import { SheetsSetupProviderError } from "./sheets-setup-provider";
import {
  startSheetsSetup,
  readSheetsSetup,
  recoverSheetsSetup,
  acknowledgeSheetsSetup,
} from "./sheets-setup-attempts";
import { sheetsSettingsStore, readSheetsSettings } from "./sheets-settings";
import { createSessionId, hashSessionId } from "./_core/session-security";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "durable Sheets creation attempts",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      sessionId: string,
      input: any;
    const scope = () => ({ ...owner, sessionId });
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const status = () => readSheetsSettings(scope());
    const start = () => startSheetsSetup(scope(), input);
    const read = () => readSheetsSetup(scope(), { requestId: input.requestId });
    const receipt = (requestId: string) => ({
      requestId,
      spreadsheetId: "local-created",
      templateVersion: 1,
      confirmedAt: new Date().toISOString(),
    });
    beforeEach(async () => {
      vi.resetAllMocks();
      m.rate.mockResolvedValue({ allowed: true });
      owner = await createDisposableMerchant("setup117");
      other = await createDisposableMerchant("setup-other");
      sessionId = createSessionId();
      await q(
        "INSERT INTO auth_sessions (user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 DAY))",
        [owner.userId, hashSessionId(sessionId)]
      );
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,credentials,settings) VALUES (?,'sheets',?,?)",
        [
          owner.merchantId,
          JSON.stringify({ refresh_token: "private" }),
          JSON.stringify({ sendDailyReports: false }),
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
                              id: 117,
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
      input = {
        requestId: randomUUID(),
        expectedDigest: (await status()).digest,
        reviewed: true,
      };
      m.create.mockImplementation(async args => {
        await args.assertCurrent();
        await args.beforeDispatch();
        m.accepted();
        return receipt(args.requestId);
      });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("saves a verified receipt and destination, then replays without creating again", async () => {
      const result = await start();
      expect(result).toMatchObject({
        state: "completed",
        merchantId: owner.merchantId,
        actorId: owner.userId,
        receipt: { requestId: input.requestId, spreadsheetId: "local-created" },
      });
      expect((await status()).spreadsheetId).toBe("local-created");
      expect(await start()).toEqual(result);
      expect(await read()).toEqual(result);
      expect(m.create).toHaveBeenCalledTimes(1);
      expect(m.accepted).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain("private");
      expect(
        await q("SELECT id FROM google_integrations WHERE merchant_id=?", [
          other.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("serializes simultaneous starts with the same request ID", async () => {
      const results = await Promise.all([start(), start(), start(), start()]);
      expect(results).toHaveLength(4);
      expect(m.create).toHaveBeenCalledTimes(1);
      expect(m.accepted).toHaveBeenCalledTimes(1);
      expect((await read())?.state).toBe("completed");
    });
    it("blocks a different request while the first creation is in flight", async () => {
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>(r => (enter = r)),
        held = new Promise<void>(r => (release = r));
      m.create.mockImplementation(async args => {
        await args.beforeDispatch();
        enter();
        await held;
        m.accepted();
        return receipt(args.requestId);
      });
      const first = start();
      await entered;
      try {
        await expect(
          startSheetsSetup(scope(), { ...input, requestId: randomUUID() })
        ).rejects.toMatchObject({ reason: "pending" });
        expect((await read())?.state).toBe("dispatching");
      } finally {
        release();
      }
      expect((await first)?.state).toBe("completed");
      expect(m.accepted).toHaveBeenCalledTimes(1);
    });
    it("never retries unknown creation; explicit review after the lease unblocks a new request", async () => {
      m.create.mockImplementation(async args => {
        await args.beforeDispatch();
        m.accepted();
        throw new SheetsSetupProviderError("unconfirmed", "local-possible");
      });
      expect(await start()).toMatchObject({
        state: "uncertain",
        canAcknowledge: false,
        spreadsheetId: "local-possible",
      });
      expect((await start())?.state).toBe("uncertain");
      expect(m.accepted).toHaveBeenCalledTimes(1);
      await expect(
        acknowledgeSheetsSetup(scope(), {
          requestId: input.requestId,
          reviewed: true,
        })
      ).rejects.toMatchObject({ reason: "pending" });
      await q(
        "UPDATE sheets_setup_attempts SET lease_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect((await read())?.canAcknowledge).toBe(true);
      expect(
        (
          await acknowledgeSheetsSetup(scope(), {
            requestId: input.requestId,
            reviewed: true,
          })
        ).state
      ).toBe("acknowledged");
      const next = { ...input, requestId: randomUUID() };
      await startSheetsSetup(scope(), next);
      expect(m.accepted).toHaveBeenCalledTimes(2);
    });
    it("distinguishes failure before dispatch from uncertain external creation", async () => {
      m.create.mockRejectedValue(
        new SheetsSetupProviderError("authentication")
      );
      const result = await start();
      expect(result).toMatchObject({
        state: "rejected",
        reason: "authentication",
        receipt: null,
      });
      expect((await status()).state).toBe("needs_destination");
      expect(m.accepted).not.toHaveBeenCalled();
    });
    it("never sends if the source changes before dispatch", async () => {
      m.create.mockImplementation(async args => {
        await q(
          "UPDATE google_integrations SET credentials=? WHERE merchant_id=?",
          [JSON.stringify({ refresh_token: "new" }), owner.merchantId]
        );
        await args.beforeDispatch();
        m.accepted();
        return receipt(args.requestId);
      });
      expect(await start()).toMatchObject({
        state: "rejected",
        reason: "changed",
      });
      expect(m.accepted).not.toHaveBeenCalled();
    });
    it("keeps an external creation receipt detached if a new connection wins", async () => {
      m.create.mockImplementation(async args => {
        await args.beforeDispatch();
        m.accepted();
        await q(
          "UPDATE google_integrations SET credentials=?,sheet_id='other-file' WHERE merchant_id=?",
          [JSON.stringify({ refresh_token: "new" }), owner.merchantId]
        );
        return receipt(args.requestId);
      });
      expect(await start()).toMatchObject({
        state: "detached",
        reason: "changed",
        receipt: { spreadsheetId: "local-created" },
      });
      expect((await status()).spreadsheetId).toBe("other-file");
    });
    it("persists creation evidence after permission revocation and allows explicit recovery later", async () => {
      m.create.mockImplementation(async args => {
        await args.beforeDispatch();
        m.accepted();
        await q(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
          [owner.merchantId, owner.userId]
        );
        return receipt(args.requestId);
      });
      await expect(start()).rejects.toMatchObject({ reason: "forbidden" });
      const [stored] = await q(
        "SELECT state,receipt FROM sheets_setup_attempts WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(stored.state).toBe("created");
      expect(stored.receipt).toBeTruthy();
      await q(
        "UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, owner.userId]
      );
      expect(
        (await recoverSheetsSetup(scope(), { requestId: input.requestId }))
          .state
      ).toBe("completed");
      expect(m.create).toHaveBeenCalledTimes(1);
    });
    it("shows an interrupted dispatch as uncertain after its lease expires", async () => {
      m.create.mockImplementation(async args => {
        await args.beforeDispatch();
        throw new SheetsSetupProviderError("unconfirmed");
      });
      await start();
      await q(
        "UPDATE sheets_setup_attempts SET state='dispatching',lease_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await read()).toMatchObject({
        state: "uncertain",
        canAcknowledge: true,
      });
      await start();
      expect(m.create).toHaveBeenCalledTimes(1);
    });
    it.each(["source", "scope", "review", "rate", "already-linked"])(
      "blocks invalid %s before the provider",
      async mode => {
        if (mode === "source") input.expectedDigest = "a".repeat(64);
        if (mode === "review") input.reviewed = false;
        if (mode === "rate") m.rate.mockResolvedValue({ allowed: false });
        if (mode === "already-linked") {
          await q(
            "UPDATE google_integrations SET sheet_id='existing' WHERE merchant_id=?",
            [owner.merchantId]
          );
          input.expectedDigest = (await status()).digest;
        }
        await expect(
          mode === "scope"
            ? startSheetsSetup(
                { ...scope(), merchantId: other.merchantId },
                input
              )
            : start()
        ).rejects.toBeTruthy();
        expect(m.create).not.toHaveBeenCalled();
      }
    );
    it.each(["before-receipt", "after-receipt-commit", "during-attachment"])(
      "recovers safely from database failure %s",
      async phase => {
        const original = vi
          .mocked(sheetsSettingsStore.transaction)
          .getMockImplementation()!;
        let fail = true;
        vi.mocked(sheetsSettingsStore.transaction).mockImplementation(
          async run => {
            let persisted = false;
            const result = await original(c =>
              run(
                new Proxy(c, {
                  get(target, key) {
                    if (key === "execute")
                      return async (sql: string, args: any[]) => {
                        if (sql.includes("SET state=?,receipt=")) {
                          persisted = true;
                          if (fail && phase === "before-receipt") {
                            fail = false;
                            throw Error("simulated database failure");
                          }
                        }
                        if (
                          sql.startsWith(
                            "UPDATE google_integrations SET sheet_id="
                          ) &&
                          fail &&
                          phase === "during-attachment"
                        ) {
                          fail = false;
                          throw Error("simulated database failure");
                        }
                        return target.execute(sql, args);
                      };
                    const value = Reflect.get(target, key);
                    return typeof value === "function"
                      ? value.bind(target)
                      : value;
                  },
                })
              )
            );
            if (persisted && fail && phase === "after-receipt-commit") {
              fail = false;
              throw Error("simulated lost commit acknowledgement");
            }
            return result;
          }
        );
        await expect(start()).rejects.toBeTruthy();
        expect(m.accepted).toHaveBeenCalledTimes(1);
        const saved = await read();
        expect(saved?.state).toBe(
          phase === "before-receipt" ? "dispatching" : "created"
        );
        expect((await status()).spreadsheetId).toBeUndefined();
        await start();
        expect(m.create).toHaveBeenCalledTimes(1);
        if (phase !== "before-receipt")
          expect(
            (await recoverSheetsSetup(scope(), { requestId: input.requestId }))
              .state
          ).toBe("completed");
      }
    );
    it("rejects tampered receipts instead of presenting success", async () => {
      await start();
      await q(
        "UPDATE sheets_setup_attempts SET receipt_hash=? WHERE merchant_id=?",
        ["f".repeat(64), owner.merchantId]
      );
      await expect(read()).rejects.toThrow("Invalid setup receipt");
      expect(m.create).toHaveBeenCalledTimes(1);
    });
    it("rejects reuse of an ID with different input", async () => {
      await start();
      input.expectedDigest = "a".repeat(64);
      await expect(start()).rejects.toMatchObject({ reason: "changed" });
      expect(m.create).toHaveBeenCalledTimes(1);
    });
  }
);
