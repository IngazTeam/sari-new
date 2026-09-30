import { describe, expect, it } from "vitest";
import { ProductPreviewStore, productPreviewId } from "../prototypes/tenant-dashboard/src/product-model";
import { ProductDetailPreviewStore } from "../prototypes/tenant-dashboard/src/product-detail-model";
import { ProductStockPreviewStore, stockModes } from "../prototypes/tenant-dashboard/src/product-stock-model";
import { productStockSnapshot } from "../shared/product-stock";
const uuid = (n: number) => `${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
function setup() {
  const products = new ProductPreviewStore(), details = new ProductDetailPreviewStore(products), stock = new ProductStockPreviewStore(products, details);
  return { products, details, stock };
}
describe("stock preview source", () => {
  it.each(Object.keys(stockModes) as (keyof typeof stockModes)[])("models %s explicitly", mode => {
    const { stock } = setup(); stock.setMode(mode);
    if (["error", "forbidden", "session"].includes(mode)) expect(() => stock.read({})).toThrow();
    else {
      const result = stock.read({});
      if (mode === "malformed") expect(productStockSnapshot.safeParse(result).success).toBe(false);
      else if (mode === "wrongTenant") expect(result.merchantId).not.toBe(productPreviewId);
      else if (mode === "wrongSelection") expect(result.selection.page).toBe(2);
      else expect(productStockSnapshot.safeParse(result).success).toBe(true);
    }
  });
  it("takes quantities from active variants and omits base and out-of-scope products", () => {
    const { products, stock } = setup(), result = stock.read({});
    expect(result.items.find(r => r.productId === 1)).toMatchObject({ kind: "variant", variantId: 1001, state: "unknown" });
    expect(result.items.some(r => r.productId === 1 && r.kind === "product")).toBe(false);
    for (const row of result.items) expect(products.read({ id: row.productId }).product).toMatchObject({ status: "active", isActive: 1, trackInventory: 1, productType: "physical" });
  });
  it("filters literal names and SKU, pages stably and keeps summary independent", () => {
    const { stock } = setup(), all = stock.read({});
    expect(stock.read({ pageSize: 2 }).items).toEqual(all.items.slice(0,2));
    expect(stock.read({ pageSize: 2, page: 2 }).items).toEqual(all.items.slice(2,4));
    expect(stock.read({ search: "%_" }).total).toBe(0);
    expect(stock.read({ search: "var-1-1" }).items).toHaveLength(1);
    expect(stock.read({ kind: "variant" }).summary).toEqual(all.summary);
    expect(stock.read({ kind: "product", state: "out" }).items.every(r => r.kind === "product" && r.stock === 0)).toBe(true);
  });
  it("reflects a reviewed variant change, inherited threshold and disabled variants without doubling the parent", async () => {
    const { products, details, stock } = setup();
    await details.write({ productId: 1, kind: "variant_update", id: 1001, requestId: uuid(1), reviewed: true, expectedDigest: details.read({ productId: 1 }).digest, fields: { stock: 3 } });
    expect(stock.read({ kind: "variant" }).items).toMatchObject([{ variantId: 1001, stock: 3, state: "low", threshold: 5 }]);
    await products.write({ kind: "update", id: 1, requestId: uuid(2), expectedDigest: products.read({ id: 1 }).digest, fields: { lowStockAlert: 1 } });
    expect(stock.read({ kind: "variant" }).total).toBe(0);
    for (const [n,id] of [1001,1002].entries()) await details.write({ productId: 1, kind: "variant_update", id, requestId: uuid(n+3), reviewed: true, expectedDigest: details.read({ productId: 1 }).digest, fields: { isActive: 0 } });
    expect(stock.read({}).items.find(r=>r.productId===1)).toMatchObject({kind:"product",stock:null,state:"unknown",issue:"no_available_variants"});
  });
  it("uses current product quantities and excludes inactive products after editing", async () => {
    const { products, stock } = setup();
    await products.write({ kind: "update", id: 5, requestId: uuid(1), expectedDigest: products.read({ id: 5 }).digest, fields: { stock: 20 } });
    expect(stock.read({}).items.some(r=>r.productId===5)).toBe(false);
    await products.write({ kind: "update", id: 5, requestId: uuid(2), expectedDigest: products.read({ id: 5 }).digest, fields: { stock: 0, status:"draft" } });
    expect(stock.read({}).items.some(r=>r.productId===5)).toBe(false);
  });
  it("keeps viewer reads available and rejects unknown input keys", () => {
    const { products, stock } = setup(); products.setMode("viewer");
    expect(stock.read({}).total).toBeGreaterThan(0);
    expect(()=>stock.read({ merchantId:1 })).toThrow();
  });
  it("recovers transient read errors without changing quantities", async () => {
    const { stock } = setup(), before = stock.read({}); stock.setMode("error");
    await stock.refresh(); expect(stock.read({}).items).toEqual(before.items);
  });
});
