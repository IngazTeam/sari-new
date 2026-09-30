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
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readProductDetails,
  writeProductDetail,
  readProductDetailReceipt,
} from "./product-details";
const optionFields = {
  name: "Size",
  nameEn: "Size",
  values: ["S", "L"],
  sortOrder: 0,
};
const variantFields = {
  name: "Small",
  sku: "S-1",
  price: "12.34",
  compareAtPrice: "15",
  costPrice: "0",
  stock: null,
  barcode: null,
  weight: null,
  imageUrl: null,
  selections: [],
  isActive: 1,
  sortOrder: 0,
};
describe.skipIf(!process.env.DATABASE_URL)("product details MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner,
    productId: number;
  const q = async (sql: string, values: any[] = []) =>
    (await (await getPool())!.execute<any>(sql, values))[0];
  const read = () =>
    readProductDetails(owner.merchantId, owner.userId, { productId });
  const write = async (
    partial: any,
    expectedDigest?: string,
    requestId = randomUUID()
  ) =>
    writeProductDetail(owner.merchantId, owner.userId, {
      productId,
      requestId,
      reviewed: true,
      expectedDigest: expectedDigest ?? (await read()).digest,
      ...partial,
    });
  const addOption = () =>
    write({ kind: "option_create", fields: optionFields });
  const addVariant = (fields = {}) =>
    write({ kind: "variant_create", fields: { ...variantFields, ...fields } });
  beforeEach(async () => {
    owner = await createDisposableMerchant("details128");
    other = await createDisposableMerchant("details-other");
    const product = await q(
      "INSERT INTO products (merchantId,name,price,price_unit,currency) VALUES (?,'Test',1000,'minor','SAR')",
      [owner.merchantId]
    );
    productId = product.insertId;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupDisposableMerchants(
      [owner?.userId, other?.userId].filter(Boolean)
    );
  });
  afterAll(closeDb);
  it("saves all option and variant fields, parent flag and receipt atomically", async () => {
    const option = await addOption();
    const saved = await addVariant({
      selections: [{ optionId: option.detailId, value: "S" }],
      barcode: "BAR",
      weight: "2kg",
      imageUrl: "https://example.test/a.png",
    });
    const current = await read();
    expect(current.hasVariants).toBe(1);
    expect(current.variants[0]).toMatchObject({
      price: 1234,
      priceUnit: "minor",
      costPrice: 0,
      stock: null,
      barcode: "BAR",
      weight: "2kg",
      options: JSON.stringify([{ optionId: option.detailId, value: "S" }]),
    });
    expect(
      await readProductDetailReceipt(owner.merchantId, owner.userId, {
        requestId: saved.requestId,
      })
    ).toEqual(saved);
    await write({
      kind: "variant_update",
      id: saved.detailId,
      fields: { price: null, stock: 4, isActive: 0, sortOrder: 3 },
    });
    expect((await read()).variants[0]).toMatchObject({
      price: null,
      stock: 4,
      isActive: 0,
      sortOrder: 3,
    });
    await expect(
      write({ kind: "option_delete", id: option.detailId })
    ).rejects.toMatchObject({ reason: "in_use" });
    await write({ kind: "variant_delete", id: saved.detailId });
    expect((await read()).hasVariants).toBe(0);
    await write({ kind: "option_delete", id: option.detailId });
    expect((await read()).options).toEqual([]);
  });
  it("deduplicates concurrent submissions and rejects changed UUID payloads", async () => {
    const digest = (await read()).digest,
      requestId = randomUUID(),
      input = { kind: "variant_create", fields: variantFields };
    const [a, b] = await Promise.all([
      write(input, digest, requestId),
      write(input, digest, requestId),
    ]);
    expect(a).toEqual(b);
    expect((await read()).variants).toHaveLength(1);
    await expect(
      write(
        { ...input, fields: { ...variantFields, name: "Other" } },
        digest,
        requestId
      )
    ).rejects.toThrow();
  });
  it("rejects stale reviews after competing or legacy changes", async () => {
    const option = await addOption(),
      digest = (await read()).digest;
    const result = await Promise.allSettled([
      write(
        { kind: "option_update", id: option.detailId, fields: { name: "A" } },
        digest
      ),
      write(
        { kind: "option_update", id: option.detailId, fields: { name: "B" } },
        digest
      ),
    ]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const old = (await read()).digest;
    await q("UPDATE product_options SET name='Legacy' WHERE id=?", [
      option.detailId,
    ]);
    await expect(
      write(
        {
          kind: "option_update",
          id: option.detailId,
          fields: { sortOrder: 4 },
        },
        old
      )
    ).rejects.toThrow();
    const parent = (await read()).digest;
    await q("UPDATE products SET price=1200 WHERE id=?", [productId]);
    await expect(
      write(
        {
          kind: "option_update",
          id: option.detailId,
          fields: { sortOrder: 4 },
        },
        parent
      )
    ).rejects.toThrow();
  });
  it("rejects foreign products, child rows and actor receipt access", async () => {
    const variant = await addVariant();
    await expect(
      readProductDetails(other.merchantId, other.userId, { productId })
    ).rejects.toThrow();
    expect(
      await readProductDetailReceipt(other.merchantId, other.userId, {
        requestId: variant.requestId,
      })
    ).toBeNull();
    await q(
      "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
      [owner.merchantId, other.userId]
    );
    await expect(
      readProductDetailReceipt(owner.merchantId, other.userId, {
        requestId: variant.requestId,
      })
    ).rejects.toThrow();
    await q("UPDATE product_variants SET merchant_id=? WHERE id=?", [
      other.merchantId,
      variant.detailId,
    ]);
    await expect(read()).rejects.toThrow();
  });
  it("blocks external products, integration changes and live viewer or inactive accounts", async () => {
    const digest = (await read()).digest,
      input = { kind: "variant_create", fields: variantFields };
    await q("UPDATE products SET sallaProductId='external:1' WHERE id=?", [
      productId,
    ]);
    expect((await read()).locked).toBe(true);
    await expect(write(input, digest)).rejects.toThrow();
    await q("UPDATE products SET sallaProductId=NULL WHERE id=?", [productId]);
    await q("UPDATE merchants SET integration_source='salla' WHERE id=?", [
      owner.merchantId,
    ]);
    await expect(write(input, digest)).rejects.toThrow();
    await q("UPDATE merchants SET integration_source='none' WHERE id=?", [
      owner.merchantId,
    ]);
    await q(
      "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
      [owner.merchantId, other.userId]
    );
    expect(
      (await readProductDetails(owner.merchantId, other.userId, { productId }))
        .canManage
    ).toBe(false);
    await expect(
      writeProductDetail(owner.merchantId, other.userId, {
        ...input,
        productId,
        reviewed: true,
        expectedDigest: digest,
        requestId: randomUUID(),
      })
    ).rejects.toThrow();
    await q(
      "UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?",
      [owner.merchantId, other.userId]
    );
    await expect(
      readProductDetails(owner.merchantId, other.userId, { productId })
    ).rejects.toThrow();
  });
  it("preserves and explicitly repairs malformed legacy selections and unverified money", async () => {
    const option = await addOption(),
      v = await addVariant();
    await q(
      "UPDATE product_variants SET options='legacy',price_unit='unverified',price=12,cost_price=5,compare_at_price=15 WHERE id=?",
      [v.detailId]
    );
    await write({
      kind: "variant_update",
      id: v.detailId,
      fields: { name: "Renamed" },
    });
    expect((await read()).variants[0]).toMatchObject({
      price: 12,
      priceUnit: "unverified",
      options: "legacy",
    });
    await expect(
      write({ kind: "option_delete", id: option.detailId })
    ).rejects.toMatchObject({ reason: "unreadable" });
    await write({
      kind: "variant_update",
      id: v.detailId,
      fields: {
        price: "12.34",
        selections: [{ optionId: option.detailId, value: "L" }],
      },
    });
    expect((await read()).variants[0]).toMatchObject({
      price: 1234,
      priceUnit: "minor",
      costPrice: null,
      compareAtPrice: null,
    });
  });
  it("rolls back the detail and parent flag if receipt insertion fails", async () => {
    const digest = (await read()).digest,
      pool = (await getPool())!,
      original = pool.getConnection.bind(pool);
    const spy = vi.spyOn(pool, "getConnection").mockImplementation(async () => {
      const connection = await original(),
        execute = connection.execute.bind(connection);
      vi.spyOn(connection, "execute").mockImplementation((...args: any[]) => {
        if (String(args[0]).startsWith("INSERT INTO product_detail_receipts"))
          throw Error("receipt unavailable");
        return (execute as any)(...args);
      });
      return connection;
    });
    await expect(
      write({ kind: "variant_create", fields: variantFields }, digest)
    ).rejects.toThrow("receipt unavailable");
    spy.mockRestore();
    vi.restoreAllMocks();
    expect((await read()).variants).toEqual([]);
    expect((await read()).hasVariants).toBe(0);
    expect(
      await q("SELECT id FROM product_detail_receipts WHERE merchant_id=?", [
        owner.merchantId,
      ])
    ).toEqual([]);
  });
  it("recovers a committed result after the commit acknowledgement is lost", async () => {
    const digest = (await read()).digest,
      requestId = randomUUID(),
      input = { kind: "variant_create", fields: variantFields },
      pool = (await getPool())!,
      original = pool.getConnection.bind(pool);
    const spy = vi.spyOn(pool, "getConnection").mockImplementation(async () => {
      const connection = await original(),
        commit = connection.commit.bind(connection);
      vi.spyOn(connection, "commit").mockImplementation(async () => {
        await commit();
        throw Error("ack lost");
      });
      return connection;
    });
    await expect(write(input, digest, requestId)).rejects.toThrow("ack lost");
    spy.mockRestore();
    vi.restoreAllMocks();
    const receipt = await readProductDetailReceipt(
      owner.merchantId,
      owner.userId,
      { requestId }
    );
    expect(receipt?.kind).toBe("variant_create");
    await expect(write(input, digest, requestId)).resolves.toEqual(receipt);
    expect((await read()).variants).toHaveLength(1);
  });
});
