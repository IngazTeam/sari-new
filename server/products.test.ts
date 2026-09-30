import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  pool: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./db", () => ({ getPool: mocks.pool, getDb: mocks.getDb }));
import { productsRouter } from "./routers-products";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    merchantId: 20,
    memberId: 3,
    role: "owner",
  });
});
describe("retired product writes", () => {
  it.each(["create", "update", "delete", "bulkDelete"])(
    "does not register %s or reach a data writer",
    async operation => {
      const caller: any = productsRouter.createCaller({
        user: { id: 7 },
        req: {},
        res: {},
      } as any);
      await expect(
        caller[operation]({
          productId: 1,
          productIds: [1],
          name: "Old write",
          price: 1,
          variants: [{ name: "Variant" }],
          options: [{ name: "Size", values: "S" }],
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mocks.pool).not.toHaveBeenCalled();
      expect(mocks.getDb).not.toHaveBeenCalled();
    }
  );
  it("keeps reviewed writes, import, sync and product details registered", () => {
    const procedures = productsRouter._def.procedures;
    for (const name of [
      "list",
      "getById",
      "addVariant",
      "updateVariant",
      "deleteVariant",
      "uploadCSV",
      "uploadExcel",
      "editor.read",
      "editor.write",
      "editor.receipt",
      "editor.deleteReview",
      "editor.deleteWrite",
      "editor.deleteReceipt",
    ])
      expect(Object.keys(procedures), name).toContain(name);
    expect(Object.keys(procedures).some(name => /sync/i.test(name))).toBe(true);
  });
  it("has no client calls to retired writes or unused single-product deletion helpers", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(item =>
        item.isDirectory()
          ? walk(path.join(dir, item.name))
          : /\.tsx?$/.test(item.name)
            ? [path.join(dir, item.name)]
            : []
      );
    for (const file of walk("client/src"))
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /\bproducts\.(?:create|update|delete|bulkDelete)\b/
      );
    for (const file of ["server/db.ts", "server/db/products.ts"])
      expect(readFileSync(file, "utf8"), file).not.toContain(
        "export async function deleteProduct("
      );
  });
});
