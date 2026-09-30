import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const m = vi.hoisted(() => ({ write: vi.fn(), accepted: vi.fn() }));
vi.mock("./inventory-sheet-export-provider", async original => ({
  ...(await original<typeof import("./inventory-sheet-export-provider")>()),
  writeInventorySheetProvider: m.write,
}));
import {
  exportInventoryToSheet,
  readInventoryExportStatus,
} from "./inventory-sheet-export";
import { productEditorStore as store } from "./product-editor";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "inventory export from disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      config: any,
      productId: number,
      input: any;
    const q = async (sql: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const insert = async (
      merchantId = owner.merchantId,
      name = "=literal",
      stock: number | null = 0
    ) =>
      Number(
        (
          await q(
            "INSERT INTO products (merchantId,name,price,price_unit,currency,stock) VALUES (?,?,1234,'minor','USD',?)",
            [merchantId, name, stock]
          )
        ).insertId
      );
    const send = () =>
      exportInventoryToSheet(owner.merchantId, owner.userId, input);
    const status = () =>
      readInventoryExportStatus(owner.merchantId, owner.userId);
    beforeEach(async () => {
      vi.resetAllMocks();
      owner = await createDisposableMerchant("export110");
      other = await createDisposableMerchant("export110-other");
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,sheet_id,credentials,is_active,last_sync) VALUES (?,'sheets','local-export-110',?,1,'2026-09-29 12:00:00')",
        [owner.merchantId, JSON.stringify({ refresh_token: "private-refresh" })]
      );
      config = {
        id: 110,
        clientId: "private-client",
        clientSecret: "private-secret",
        is_enabled: 1,
      };
      const original = store.transaction;
      vi.spyOn(store, "transaction").mockImplementation((writes, run, serial) =>
        original(
          writes,
          c =>
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
            ),
          serial
        )
      );
      productId = await insert();
      await insert(owner.merchantId, "Unknown", null);
      await insert(other.merchantId, "Private other tenant", 999);
      input = {
        reviewed: true,
        expectedSourceDigest: (await status()).sourceDigest,
      };
      m.write.mockImplementation(async args => {
        await args.assertCurrent();
        m.accepted(args.rows);
        return {
          spreadsheetId: args.spreadsheetId,
          sheetId: 12,
          rows: args.rows.length,
          confirmedAt: new Date().toISOString(),
        };
      });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("reads scoped status and exports visible rows without changing products or leaking credentials", async () => {
      const before = await q(
        "SELECT * FROM products WHERE merchantId=? ORDER BY id",
        [owner.merchantId]
      );
      const s = await status();
      expect(s).toMatchObject({
        merchantId: owner.merchantId,
        actorId: owner.userId,
        isConnected: true,
        spreadsheetId: "local-export-110",
      });
      expect(s.lastSync).toMatch(/^2026-09-29/);
      expect(JSON.stringify(s)).not.toContain("private-");
      const receipt = await send();
      expect(receipt).toMatchObject({
        rows: 2,
        unknownStock: 1,
        unverifiedPrice: 0,
        merchantId: owner.merchantId,
        actorId: owner.userId,
      });
      const rows = m.accepted.mock.calls[0][0];
      expect(rows[0].slice(0, 5)).toEqual([
        String(productId),
        "=literal",
        "",
        "12.34 USD",
        "0",
      ]);
      expect(rows[1][4]).toBe("");
      expect(JSON.stringify(rows)).not.toContain("Private other tenant");
      expect(
        await q("SELECT * FROM products WHERE merchantId=? ORDER BY id", [
          owner.merchantId,
        ])
      ).toEqual(before);
      expect(JSON.stringify(receipt)).not.toContain("private-");
    });
    it("does not include archived external projections", async () => {
      await q(
        "UPDATE products SET sallaProductId='salla:missing:123' WHERE id=?",
        [productId]
      );
      expect((await send()).rows).toBe(1);
      expect(m.accepted.mock.calls[0][0][0][1]).toBe("Unknown");
    });
    it("supports exporting a visible catalog whose platform manages product edits", async () => {
      await q("UPDATE merchants SET integration_source='salla' WHERE id=?", [
        owner.merchantId,
      ]);
      expect((await send()).rows).toBe(2);
    });
    it("does not read another tenant as the actor", async () => {
      await expect(
        readInventoryExportStatus(owner.merchantId, other.userId)
      ).rejects.toThrow();
      await expect(
        exportInventoryToSheet(owner.merchantId, other.userId, input)
      ).rejects.toThrow();
      expect(m.accepted).not.toHaveBeenCalled();
    });
    it.each(["sheet", "credentials", "disabled", "oauth", "actor", "viewer"])(
      "rejects %s changed immediately before the provider writes",
      async kind => {
        m.write.mockImplementation(async args => {
          if (kind === "sheet")
            await q(
              "UPDATE google_integrations SET sheet_id='changed' WHERE merchant_id=?",
              [owner.merchantId]
            );
          if (kind === "credentials")
            await q(
              "UPDATE google_integrations SET credentials='{}' WHERE merchant_id=?",
              [owner.merchantId]
            );
          if (kind === "disabled")
            await q(
              "UPDATE google_integrations SET is_active=0 WHERE merchant_id=?",
              [owner.merchantId]
            );
          if (kind === "oauth") config.clientSecret = "rotated";
          if (kind === "actor")
            await q(
              "UPDATE users SET account_status='deletion_pending' WHERE id=?",
              [owner.userId]
            );
          if (kind === "viewer")
            await q(
              "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
              [owner.merchantId, owner.userId]
            );
          await args.assertCurrent();
          m.accepted();
        });
        await expect(send()).rejects.toThrow();
        expect(m.accepted).not.toHaveBeenCalled();
      }
    );
    it("requires renewed consent to the current connection version", async () => {
      input.expectedSourceDigest = "f".repeat(64);
      await expect(send()).rejects.toThrow();
      expect(m.write).not.toHaveBeenCalled();
    });
    it("distinguishes inactive and disabled OAuth states without a write", async () => {
      config.is_enabled = 0;
      expect(await status()).toMatchObject({
        isConnected: false,
        reason: "oauth_disabled",
      });
      await expect(send()).rejects.toThrow();
      await q(
        "UPDATE google_integrations SET is_active=0 WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await status()).toMatchObject({
        isConnected: false,
        reason: "unlinked",
      });
      expect(m.write).not.toHaveBeenCalled();
    });
    it("does not clear the destination when the catalog is empty", async () => {
      await q("DELETE FROM products WHERE merchantId=?", [owner.merchantId]);
      await expect(send()).rejects.toThrow();
      expect(m.write).not.toHaveBeenCalled();
    });
  }
);
