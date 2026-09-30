import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getPool, closeDb } from "./db/connection";
import { createProduct, getProductById, upsertProductFromZid } from "./db";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { formatProductPrice } from "../shared/product-money";
import { syncExternalProducts } from "./integrations/product-source-sync";
import { createOrder } from "./db";
import { issueCanonicalOrderPaymentLink } from "./payment/order-payment-link";
import { createPaymentLink } from "./db_payments";
import { randomUUID } from "node:crypto";

describe.skipIf(!process.env.DATABASE_URL)(
  "product currency and price contracts (MySQL)",
  () => {
    let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
    const caller = () =>
      appRouter.createCaller({
        user: { id: fixture.userId, role: "user" },
        req: { headers: { "x-merchant-id": String(fixture.merchantId) } },
        res: {},
      } as any);
    const create = (fields: Record<string, unknown>) =>
      caller().products.editor.write({
        kind: "create",
        requestId: randomUUID(),
        fields: {
          name: "Item",
          description: null,
          price: "1",
          currency: "SAR",
          imageUrl: null,
          stock: null,
          sku: null,
          barcode: null,
          compareAtPrice: null,
          costPrice: null,
          weight: null,
          category: null,
          categoryId: null,
          tags: null,
          productType: "physical",
          status: "active",
          lowStockAlert: 5,
          trackInventory: 1,
          ...fields,
        } as any,
      });
    const patch = async (id: number, fields: Record<string, unknown>) => {
      const current = await caller().products.editor.read({ id });
      return caller().products.editor.write({
        kind: "update",
        id,
        expectedDigest: current.digest,
        requestId: randomUUID(),
        fields,
      });
    };
    beforeEach(async () => {
      fixture = await createDisposableMerchant("currency");
    });
    afterEach(async () => {
      if (fixture) await cleanupDisposableMerchants([fixture.userId]);
    });
    afterAll(closeDb);
    it("stores a 99.99 manual price as exactly 9999 and displays 99.99 in the product currency", async () => {
      const result = await create({
        name: "Fractional",
        price: "99.99",
        currency: "USD",
        stock: 2,
      });
      const stored = await getProductById(result.productId);
      expect(stored).toMatchObject({
        price: 9999,
        currency: "USD",
        priceUnit: "minor",
      });
      expect(formatProductPrice(stored!, "en-US")).toBe("$99.99");
      expect((await caller().products.list()).items[0].price).toBe(9999);
    });
    it("updates prices once, preserving minor units across subsequent non-price edits", async () => {
      const result = await create({ name: "Item", price: "9.99" });
      await patch(result.productId, { price: "12.34" });
      await patch(result.productId, { name: "Renamed" });
      expect(await getProductById(result.productId)).toMatchObject({
        price: 1234,
        priceUnit: "minor",
      });
    });
    it("preserves historical values as unverified until an explicit price save", async () => {
      const [row] = await (await getPool())!.execute<any>(
        "INSERT INTO products (merchantId,name,price,compare_at_price) VALUES (?, ?, 100, 200)",
        [fixture.merchantId, "Legacy"]
      );
      expect(await getProductById(row.insertId)).toMatchObject({
        price: 100,
        priceUnit: "unverified",
      });
      await patch(row.insertId, { name: "Legacy updated" });
      expect(await getProductById(row.insertId)).toMatchObject({
        price: 100,
        priceUnit: "unverified",
      });
      await patch(row.insertId, { price: "100" });
      expect(await getProductById(row.insertId)).toMatchObject({
        price: 10000,
        priceUnit: "minor",
        compareAtPrice: null,
      });
    });
    it("preserves an explicit free price instead of substituting a base price", async () => {
      const result = await create({ name: "Free", price: "0" });
      expect(await getProductById(result.productId)).toMatchObject({
        price: 0,
        priceUnit: "minor",
      });
    });
    it("rejects fractional minor units and over-precise native prices without inserting a product", async () => {
      await expect(
        createProduct({
          merchantId: fixture.merchantId,
          name: "Bad minor",
          price: 1.01,
        })
      ).rejects.toThrow();
      await expect(
        create({ name: "Bad major", price: "1.005" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller().products.addVariant({
          productId: 1,
          name: "Over precise",
          price: 1.005,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect((await caller().products.list()).items).toHaveLength(0);
    });
    it("stores variant prices in minor units and keeps inherited prices null", async () => {
      const result = await create({ name: "Variant base", price: "99.99" });
      await caller().products.addVariant({
        productId: result.productId,
        name: "Paid",
        price: 10.01,
      });
      await caller().products.addVariant({
        productId: result.productId,
        name: "Inherit",
      });
      const [rows] = await (await getPool())!.execute<any[]>(
        "SELECT price, price_unit FROM product_variants WHERE product_id = ? ORDER BY id",
        [result.productId]
      );
      expect(rows[0]).toMatchObject({ price: 1001, price_unit: "minor" });
      expect(rows[1].price).toBeNull();
    });
    it("resynchronizes a historical Zid price from a trusted major-unit provider payload", async () => {
      await upsertProductFromZid(fixture.merchantId, {
        store_id: "11",
        id: "price-test",
        name: "Zid item",
        price: "99.99",
        currency: "SAR",
        quantity: 5,
      });
      const [rows] = await (await getPool())!.execute<any[]>(
        "SELECT price,price_unit FROM products WHERE merchantId=?",
        [fixture.merchantId]
      );
      expect(rows).toEqual([{ price: 9999, price_unit: "minor" }]);
    });
    it("keeps API/Byaan prices unverified until a declared-unit resync", async () => {
      await syncExternalProducts(
        fixture.merchantId,
        [{ id: "course", name: "Legacy feed", price: 100 }],
        "append",
        "byaan"
      );
      let [rows] = await (await getPool())!.execute<any[]>(
        "SELECT price,price_unit FROM products WHERE merchantId=?",
        [fixture.merchantId]
      );
      expect(rows).toEqual([{ price: 100, price_unit: "unverified" }]);
      await syncExternalProducts(
        fixture.merchantId,
        [
          {
            id: "course",
            name: "Verified feed",
            price: 99.99,
            priceUnit: "major",
          },
        ],
        "append",
        "byaan"
      );
      [rows] = await (await getPool())!.execute<any[]>(
        "SELECT price,price_unit FROM products WHERE merchantId=?",
        [fixture.merchantId]
      );
      expect(rows).toEqual([{ price: 9999, price_unit: "minor" }]);
    });
    it("blocks both issuing and redeeming a separate Tap link for a Salla-owned order", async () => {
      const order = await createOrder({
        merchantId: fixture.merchantId,
        sallaOrderId: "fixture-123",
        customerPhone: "966500000009",
        customerName: "Fixture",
        items: "[]",
        totalAmount: 9999,
        status: "pending",
      });
      expect(
        await issueCanonicalOrderPaymentLink({
          merchantId: fixture.merchantId,
          orderId: order!.id,
        })
      ).toEqual({ issued: false, reason: "order_not_payable" });
      const linkId = "link_" + randomUUID().replaceAll("-", "");
      await createPaymentLink({
        merchantId: fixture.merchantId,
        orderId: order!.id,
        linkId,
        title: "Legacy fixture",
        amount: 9999,
        currency: "SAR",
        isFixedAmount: 1,
        maxUsageCount: 1,
        status: "active",
        isActive: 1,
        tapPaymentUrl: "https://fixture.test/link",
      });
      await expect(
        caller().payments.checkoutLink({
          linkId,
          customerName: "Fixture",
          customerPhone: "966500000009",
          checkoutAttemptId: randomUUID(),
        })
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: "رابط الدفع لا يطابق طلبًا محليًا قابلًا للدفع",
      });
    });
    it("rejects an invalid analysis replacement before deleting the existing catalogue", async () => {
      const existing = await createProduct({
        merchantId: fixture.merchantId,
        name: "Keep",
        price: 9999,
      });
      await expect(
        caller().analysis.applyAnalysis({
          websiteUrl: "https://fixture.test",
          platform: "custom",
          productsAction: "replace",
          products: [{ name: "Over precise", price: 1.005 }],
          faqsAction: "skip",
          pagesAction: "skip",
        })
      ).rejects.toThrow();
      expect(await getProductById(existing!.id)).toMatchObject({
        name: "Keep",
        price: 9999,
      });
    });
  }
);
