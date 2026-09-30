import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const m = vi.hoisted(() => ({ provider: vi.fn() }));
vi.mock("./product-sheet-provider", async original => ({
  ...(await original<typeof import("./product-sheet-provider")>()),
  readProductSheetProvider: m.provider,
}));
import {
  readProductSheetConnection,
  listProductSheetSource,
  snapshotProductSheetSource,
} from "./product-sheet-source";
import { productEditorStore as store } from "./product-editor";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "Sheets source on disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      config: any;
    const q = async (sql: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const sheet = {
      id: 0,
      title: "Products",
      hidden: false,
      rows: 1000,
      columns: 26,
    };
    const read = () =>
      readProductSheetConnection(owner.merchantId, owner.userId);
    beforeEach(async () => {
      vi.resetAllMocks();
      owner = await createDisposableMerchant("sheet97");
      other = await createDisposableMerchant("sheet97-other");
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,sheet_id,credentials,is_active) VALUES (?,'sheets','local-source-97',?,1)",
        [
          owner.merchantId,
          JSON.stringify({ refresh_token: "private-refresh-97" }),
        ]
      );
      config = {
        id: 97,
        clientId: "private-client-97",
        clientSecret: "private-secret-97",
        is_enabled: 1,
      };
      // Keep global OAuth settings untouched. Execute the real query to validate its schema, then substitute test-only credentials.
      const transaction = store.transaction;
      vi.spyOn(store, "transaction").mockImplementation((writes, run, serial) =>
        transaction(
          writes,
          c =>
            run(
              new Proxy(c, {
                get(target, key) {
                  if (key === "execute")
                    return async (sql: string, values: any[]) => {
                      const result = await target.execute(sql, values);
                      return sql.includes("FROM google_oauth_settings")
                        ? [[config], []]
                        : result;
                    };
                  const value = Reflect.get(target, key);
                  return typeof value === "function"
                    ? value.bind(target)
                    : value;
                },
              })
            ),
          serial
        )
      );
      m.provider.mockImplementation(async input => {
        await input.assertCurrent();
        return [sheet];
      });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("returns scoped source and sheet metadata without any credentials or products", async () => {
      const connection = await read();
      expect(connection.source?.spreadsheetId).toBe("local-source-97");
      const r = await listProductSheetSource(owner.merchantId, owner.userId, {
        expectedSourceDigest: connection.source!.digest,
      });
      expect(r).toMatchObject({
        merchantId: owner.merchantId,
        actorId: owner.userId,
        sheets: [sheet],
      });
      expect(JSON.stringify(r)).not.toContain("private-");
      expect(m.provider.mock.calls[0][0].auth.credentials.refresh_token).toBe(
        "private-refresh-97"
      );
      expect(
        Number(
          (
            await q("SELECT COUNT(*) n FROM products WHERE merchantId=?", [
              owner.merchantId,
            ])
          )[0].n
        )
      ).toBe(0);
    });
    it("rejects another tenant actor before the provider", async () => {
      await expect(
        readProductSheetConnection(owner.merchantId, other.userId)
      ).rejects.toThrow();
      expect(m.provider).not.toHaveBeenCalled();
    });
    it.each([
      "sheet",
      "credentials",
      "oauth",
      "inactive",
      "source",
      "inactiveActor",
      "viewer",
    ])("rejects %s changed while reading before returning data", async kind => {
      const c = await read();
      let changed = false;
      m.provider.mockImplementation(async () => {
        if (kind === "sheet")
          await q(
            "UPDATE google_integrations SET sheet_id='changed' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (kind === "credentials")
          await q(
            "UPDATE google_integrations SET credentials=? WHERE merchant_id=?",
            [JSON.stringify({ refresh_token: "rotated" }), owner.merchantId]
          );
        if (kind === "oauth") config.clientSecret = "rotated-secret";
        if (kind === "inactive")
          await q(
            "UPDATE google_integrations SET is_active=0 WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (kind === "source")
          await q(
            "UPDATE merchants SET integration_source='salla' WHERE id=?",
            [owner.merchantId]
          );
        if (kind === "inactiveActor")
          await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
            owner.userId,
          ]);
        if (kind === "viewer") await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[owner.merchantId,owner.userId]);
        changed = true;
        return [sheet];
      });
      await expect(
        listProductSheetSource(owner.merchantId, owner.userId, {
          expectedSourceDigest: c.source!.digest,
        })
      ).rejects.toThrow();
      expect(changed).toBe(true);
    });
    it("rejects a stale connection digest before calling Google", async () => {
      await expect(
        listProductSheetSource(owner.merchantId, owner.userId, {
          expectedSourceDigest: "a".repeat(64),
        })
      ).rejects.toThrow();
      expect(m.provider).not.toHaveBeenCalled();
    });
    it("distinguishes disabled OAuth and disconnected integration without reading Google", async () => {
      config.is_enabled = 0;
      expect((await read()).reason).toBe("oauth_disabled");
      await q(
        "UPDATE google_integrations SET is_active=0 WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect((await read()).reason).toBe("unlinked");
      expect(m.provider).not.toHaveBeenCalled();
    });
    it("rejects duplicate integration records instead of choosing the first", async () => {
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,sheet_id,credentials,is_active) VALUES (?,'sheets','other','{}',1)",
        [owner.merchantId]
      );
      await expect(read()).rejects.toThrow();
      expect(m.provider).not.toHaveBeenCalled();
    });
    it("checks selection before internal snapshot acquisition", async () => {
      const c = await read();
      await expect(
        snapshotProductSheetSource(owner.merchantId, owner.userId, {
          expectedSourceDigest: c.source!.digest,
          sheet,
          options: { sheetId: 9, currency: "SAR" },
        })
      ).rejects.toThrow();
      expect(m.provider).not.toHaveBeenCalled();
    });
  }
);
