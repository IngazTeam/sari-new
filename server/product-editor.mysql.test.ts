import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readProductEditor,
  writeProductEditor,
  readProductEditorReceipt,
  ProductEditorConflict,
  ProductEditorMissing,
  ProductEditorForbidden,
  ProductEditorLocked,
  ProductEditorInvalid,
} from "./product-editor";
const base = {
  name: "منتج",
  description: "Description",
  price: "99.99",
  currency: "SAR",
  imageUrl: "https://example.test/image.png",
  stock: 0,
  sku: "SKU",
  barcode: "BAR",
  compareAtPrice: "120",
  costPrice: "50",
  weight: "1kg",
  category: "Category",
  categoryId: null,
  tags: "tag",
  productType: "physical",
  status: "active",
  lowStockAlert: 5,
  trackInventory: 1,
};
describe.skipIf(!process.env.DATABASE_URL)("product editor MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const q = async (statement: string, values: any[] = []) =>
    (await (await getPool())!.execute<any>(statement, values))[0];
  const create = (fields = {}, requestId = randomUUID()) =>
    writeProductEditor(owner.merchantId, owner.userId, {
      kind: "create",
      requestId,
      fields: { ...base, ...fields },
    });
  const read = (id: number) =>
    readProductEditor(owner.merchantId, owner.userId, { id });
  const patch = (
    id: number,
    expectedDigest: string,
    fields: any,
    requestId = randomUUID()
  ) =>
    writeProductEditor(owner.merchantId, owner.userId, {
      kind: "update",
      requestId,
      id,
      expectedDigest,
      fields,
    });
  beforeEach(async () => {
    owner = await createDisposableMerchant("editor79");
    other = await createDisposableMerchant("editor79-other");
  });
  afterEach(async () =>
    cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
  );
  afterAll(closeDb);
  it("saves exact prices and advanced fields with one durable receipt, then clears nullable fields", async () => {
    const saved = await create(),
      current = await read(saved.productId);
    expect(current.digest).toBe(saved.digest);
    expect(current.product).toMatchObject({
      price: 9999,
      priceUnit: "minor",
      compareAtPrice: 12000,
      costPrice: 5000,
      stock: 0,
      sku: "SKU",
    });
    expect(
      await readProductEditorReceipt(owner.merchantId, owner.userId, {
        requestId: saved.requestId,
      })
    ).toEqual(saved);
    const cleared = await patch(saved.productId, saved.digest, {
      description: null,
      imageUrl: null,
      sku: null,
      barcode: null,
      compareAtPrice: null,
      costPrice: null,
      weight: null,
      category: null,
      tags: null,
      stock: null,
      lowStockAlert: null,
    });
    expect((await read(saved.productId)).product).toMatchObject({
      price: 9999,
      description: null,
      sku: null,
      stock: null,
      compareAtPrice: null,
    });
    expect(cleared.digest).not.toBe(saved.digest);
  });
  it("concurrent retries create one row, and request reuse with different data is rejected", async () => {
    const requestId = randomUUID();
    const results = await Promise.all([
      create({}, requestId),
      create({}, requestId),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(
      create({ name: "Different" }, requestId)
    ).rejects.toBeInstanceOf(ProductEditorConflict);
    expect(
      (
        await q("SELECT COUNT(*) AS n FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      )[0].n
    ).toBe(1);
  });
  it("keeps draft and archived products inactive for assistant catalog readers", async () => {
    const saved = await create({ status: "draft" });
    let current = await read(saved.productId);
    expect(current.product).toMatchObject({ status: "draft", isActive: 0 });
    await patch(saved.productId, current.digest, { status: "active" });
    current = await read(saved.productId);
    expect(current.product).toMatchObject({ status: "active", isActive: 1 });
    await patch(saved.productId, current.digest, { status: "archived" });
    expect((await read(saved.productId)).product).toMatchObject({
      status: "archived",
      isActive: 0,
    });
  });
  it("competing edits preserve one winner and reject the stale digest, including old API changes", async () => {
    const saved = await create();
    const results = await Promise.allSettled([
      patch(saved.productId, saved.digest, { name: "A" }),
      patch(saved.productId, saved.digest, { name: "B" }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find(r => r.status === "rejected") as PromiseRejectedResult)
        .reason
    ).toBeInstanceOf(ProductEditorConflict);
    const current = await read(saved.productId);
    await q("UPDATE products SET description='External change' WHERE id=?", [
      saved.productId,
    ]);
    await expect(
      patch(saved.productId, current.digest, { name: "C" })
    ).rejects.toBeInstanceOf(ProductEditorConflict);
  });
  it("preserves unverified prices for non-price changes and clears historical auxiliary prices on verification", async () => {
    const saved = await create();
    await q(
      "UPDATE products SET price=100,price_unit='unverified',compare_at_price=200,cost_price=50 WHERE id=?",
      [saved.productId]
    );
    let current = await read(saved.productId);
    await patch(saved.productId, current.digest, { name: "Renamed" });
    current = await read(saved.productId);
    expect(current.product).toMatchObject({
      price: 100,
      priceUnit: "unverified",
      compareAtPrice: 200,
    });
    await expect(
      patch(saved.productId, current.digest, { costPrice: "5" })
    ).rejects.toBeInstanceOf(ProductEditorInvalid);
    await patch(saved.productId, current.digest, { price: "0" });
    expect((await read(saved.productId)).product).toMatchObject({
      price: 0,
      priceUnit: "minor",
      compareAtPrice: null,
      costPrice: null,
    });
  });
  it("rejects currency relabeling and foreign categories and product IDs", async () => {
    const saved = await create();
    await expect(
      patch(saved.productId, saved.digest, { currency: "USD", price: "99.99" })
    ).rejects.toBeInstanceOf(ProductEditorInvalid);
    const category = await q(
      "INSERT INTO product_categories (merchant_id,name) VALUES (?,'Private')",
      [other.merchantId]
    );
    await expect(
      patch(saved.productId, saved.digest, { categoryId: category.insertId })
    ).rejects.toBeInstanceOf(ProductEditorInvalid);
    await expect(
      readProductEditor(other.merchantId, other.userId, { id: saved.productId })
    ).rejects.toBeInstanceOf(ProductEditorMissing);
    await expect(
      writeProductEditor(other.merchantId, other.userId, {
        kind: "update",
        requestId: randomUUID(),
        id: saved.productId,
        expectedDigest: saved.digest,
        fields: { name: "Bad" },
      })
    ).rejects.toBeInstanceOf(ProductEditorMissing);
    expect(
      await readProductEditorReceipt(other.merchantId, other.userId, {
        requestId: saved.requestId,
      })
    ).toBeNull();
  });
  it("blocks externally managed products and stale global integration identity", async () => {
    const saved = await create();
    await q("UPDATE merchants SET integration_source='byaan' WHERE id=?", [
      owner.merchantId,
    ]);
    expect((await read(saved.productId)).locked).toBe(true);
    await expect(create()).rejects.toBeInstanceOf(ProductEditorLocked);
    await expect(
      patch(saved.productId, saved.digest, { name: "Bad" })
    ).rejects.toBeInstanceOf(ProductEditorLocked);
    await q("UPDATE merchants SET integration_source='none' WHERE id=?", [
      owner.merchantId,
    ]);
    await q("UPDATE products SET sallaProductId='external-course' WHERE id=?", [
      saved.productId,
    ]);
    const current = await read(saved.productId);
    expect(current.locked).toBe(true);
    await expect(
      patch(saved.productId, current.digest, { name: "Bad" })
    ).rejects.toBeInstanceOf(ProductEditorLocked);
  });
  it("checks the live role and account inside the transaction and scopes receipt access to its actor", async () => {
    const saved = await create();
    await q(
      "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
      [owner.merchantId, other.userId]
    );
    await expect(
      readProductEditorReceipt(owner.merchantId, other.userId, {
        requestId: saved.requestId,
      })
    ).rejects.toBeInstanceOf(ProductEditorConflict);
    await q(
      "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
      [owner.merchantId, owner.userId]
    );
    expect((await read(saved.productId)).canManage).toBe(false);
    await expect(create()).rejects.toBeInstanceOf(ProductEditorForbidden);
    await q(
      "UPDATE merchant_members SET role='manager',is_active=0 WHERE merchant_id=? AND user_id=?",
      [owner.merchantId, owner.userId]
    );
    await expect(create()).rejects.toBeInstanceOf(ProductEditorForbidden);
    await q(
      "UPDATE merchant_members SET is_active=1 WHERE merchant_id=? AND user_id=?",
      [owner.merchantId, owner.userId]
    );
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
      owner.userId,
    ]);
    await expect(create()).rejects.toBeInstanceOf(ProductEditorForbidden);
  });
  it("rolls back the product if the receipt cannot be stored", async () => {
    const pool = (await getPool())!,
      original = pool.getConnection.bind(pool);
    const spy = vi.spyOn(pool, "getConnection").mockImplementation(
      async () =>
        new Proxy(await original(), {
          get(target, prop) {
            if (prop === "execute")
              return async (statement: string, values: any[]) => {
                if (statement.startsWith("INSERT INTO product_editor_receipts"))
                  throw Error("receipt failed");
                return target.execute(statement, values);
              };
            const value = Reflect.get(target, prop);
            return typeof value === "function" ? value.bind(target) : value;
          },
        })
    );
    try {
      await expect(create()).rejects.toThrow("receipt failed");
    } finally {
      spy.mockRestore();
    }
    expect(
      (
        await q("SELECT COUNT(*) AS n FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      )[0].n
    ).toBe(0);
  });
  it("recovers a committed product after acknowledgement loss with no duplicate creation", async () => {
    const pool = (await getPool())!,
      original = pool.getConnection.bind(pool),
      requestId = randomUUID();
    const spy = vi.spyOn(pool, "getConnection").mockImplementation(
      async () =>
        new Proxy(await original(), {
          get(target, prop) {
            if (prop === "commit")
              return async () => {
                await target.commit();
                throw Error("ack lost");
              };
            const value = Reflect.get(target, prop);
            return typeof value === "function" ? value.bind(target) : value;
          },
        })
    );
    try {
      await expect(create({}, requestId)).rejects.toThrow("ack lost");
    } finally {
      spy.mockRestore();
    }
    const receipt = await readProductEditorReceipt(
      owner.merchantId,
      owner.userId,
      { requestId }
    );
    expect(receipt?.productId).toBeGreaterThan(0);
    expect(await create({}, requestId)).toEqual(receipt);
    expect(
      (
        await q("SELECT COUNT(*) AS n FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      )[0].n
    ).toBe(1);
  });
});
