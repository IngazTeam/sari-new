import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const m = vi.hoisted(() => ({
  merchant: vi.fn(),
  pool: vi.fn(),
  db: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("./db", () => ({
  getMerchantByUserId: m.merchant,
  getPool: m.pool,
  getDb: m.db,
}));
vi.mock("./_core/googleSheets", () => ({
  readFromSheet: m.read,
  writeToSheet: m.write,
}));
import { sheetsRouter } from "./routers-sheets";
import { productsRouter } from "./routers-products";
import * as sync from "./sheetsSync";
beforeEach(() => vi.clearAllMocks());
describe("retired direct inventory import", () => {
  it.each([null, { id: 7 }])(
    "rejects the retired route before database or provider work for %j",
    async user => {
      const caller: any = sheetsRouter.createCaller({
        user,
        req: {},
        res: {},
      } as any);
      await expect(caller.updateInventoryFromSheets()).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      for (const fn of Object.values(m)) expect(fn).not.toHaveBeenCalled();
    }
  );
  it("keeps reviewed inventory and independent export/report operations registered", () => {
    for (const name of [
      "connection",
      "list",
      "prepare",
      "read",
      "commit",
      "receipt",
      "discard",
    ])
      expect(Object.keys(productsRouter._def.procedures)).toContain(
        "sheetInventory." + name
      );
    for (const name of [
      "syncInventory",
      "getStatus",
      "generateDailyReport",
      "generateWeeklyReport",
      "generateMonthlyReport",
    ])
      expect(Object.keys(sheetsRouter._def.procedures)).toContain(name);
    expect("updateInventoryFromSheets" in sync).toBe(false);
    expect(typeof sync.syncInventoryToSheets).toBe("function");
  });
  it("has no client consumer or direct product update in the old Sheets sync module", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(item =>
        item.isDirectory()
          ? walk(path.join(dir, item.name))
          : /\.tsx?$/.test(item.name)
            ? [path.join(dir, item.name)]
            : []
      );
    for (const file of walk("client/src"))
      expect(readFileSync(file, "utf8"), file).not.toContain(
        "sheets.updateInventoryFromSheets"
      );
    expect(readFileSync("server/sheetsSync.ts", "utf8")).not.toMatch(
      /updateProduct|syncProductsFromSheets|updateInventoryFromSheets/
    );
  });
});
