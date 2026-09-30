import { afterAll, afterEach, beforeEach, describe, it, expect } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readOrderWorkspace, readOrderDetail } from "./order-workspace";
describe.skipIf(!process.env.DATABASE_URL)("order workspace MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const query = async (q: string, params: any[] = []) =>
    (await (await getPool())!.execute<any>(q, params))[0];
  const add = async (values: Record<string, unknown> = {}) => {
    const record = {
      merchantId: owner.merchantId,
      customerName: "Local fixture",
      customerPhone: "+12025550159",
      items: '[{"name":"Legacy","quantity":2,"price":100}]',
      totalAmount: 200,
      currency: "SAR",
      status: "pending",
      createdAt: "2026-09-29 12:00:00",
      ...values,
    };
    const keys = Object.keys(record);
    return Number(
      (
        await query(
          `INSERT INTO orders (${keys.map(v => "`" + v + "`").join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
          Object.values(record)
        )
      ).insertId
    );
  };
  beforeEach(async () => {
    owner = await createDisposableMerchant("order-source");
    other = await createDisposableMerchant("order-other");
  });
  afterEach(async () =>
    cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
  );
  afterAll(closeDb);
  it("isolates the list, counts and missing detail across tenants", async () => {
    const mine = await add(),
      foreign = await add({ merchantId: other.merchantId });
    const result = await readOrderWorkspace(owner.merchantId, {});
    expect(result.total).toBe(1);
    expect(result.items.map(v => v.id)).toEqual([mine]);
    expect(await readOrderDetail(owner.merchantId, foreign)).toBeNull();
    expect(await readOrderDetail(owner.merchantId, 2147483647)).toBeNull();
  });
  it("pages25 rows stably and clamps a stale page without losing the previous control", async () => {
    const ids = [];
    for (let i = 0; i < 26; i++)
      ids.push(await add({ orderNumber: `Order ${i}` }));
    const first = await readOrderWorkspace(owner.merchantId, {}),
      last = await readOrderWorkspace(owner.merchantId, { page: 99 });
    expect(first).toMatchObject({ page: 1, pages: 2, filtered: 26, total: 26 });
    expect(first.items).toHaveLength(25);
    expect(last).toMatchObject({
      page: 2,
      pages: 2,
      filtered: 26,
      selection: { page: 99 },
    });
    expect(last.items.map(v => v.id)).toEqual([ids[0]]);
    expect(new Set([...first.items, ...last.items].map(v => v.id)).size).toBe(
      26
    );
  });
  it("returns a usable empty page and no synthetic financial metrics", async () => {
    const result = await readOrderWorkspace(owner.merchantId, { page: 99 });
    expect(result).toMatchObject({
      page: 1,
      pages: 1,
      total: 0,
      filtered: 0,
      items: [],
      values: [],
      unmeasured: {
        settledRevenue: null,
        profit: null,
        salesConversion: null,
        salesProficiency: null,
      },
    });
  });
  it("searches literal percent, underscores, quotes and Arabic in all named columns", async () => {
    const expected = await add({
      customerName: "عميل %_ خاص",
      orderNumber: "O'Reilly",
      customerPhone: "literal_phone",
    });
    await add({
      customerName: "عميل آخر",
      orderNumber: "Other",
      customerPhone: "literalXphone",
    });
    for (const search of ["%_", "O'Reilly", "literal_phone", "خاص"]) {
      const v = await readOrderWorkspace(owner.merchantId, { search });
      expect(v.filtered).toBe(1);
      expect(v.items[0].id).toBe(expected);
    }
    expect(
      (await readOrderWorkspace(owner.merchantId, { search: "' OR 1=1 --" }))
        .filtered
    ).toBe(0);
  });
  it("keeps order state separate from recorded payment and totals each currency", async () => {
    await add({ status: "paid", payment_status: "unpaid", totalAmount: 100 });
    await add({
      status: "processing",
      payment_status: "paid",
      totalAmount: 250,
    });
    await add({
      status: "delivered",
      payment_status: "refunded",
      totalAmount: 500,
      currency: "USD",
    });
    await add({
      status: "cancelled",
      payment_status: "paid",
      totalAmount: 999,
    });
    await add({ status: "pending", totalAmount: -10 });
    const v = await readOrderWorkspace(owner.merchantId, {});
    expect(v.total).toBe(5);
    expect(v.statuses.reduce((n, r) => n + r.count, 0)).toBe(5);
    expect(v.payments.reduce((n, r) => n + r.count, 0)).toBe(5);
    expect(v.values).toEqual([
      {
        currency: "SAR",
        count: 2,
        totalMinor: 350,
        markedPaidMinor: 250,
        excludedAmounts: 1,
      },
      {
        currency: "USD",
        count: 1,
        totalMinor: 500,
        markedPaidMinor: 0,
        excludedAmounts: 0,
      },
    ]);
    const filtered = await readOrderWorkspace(owner.merchantId, {
      status: "paid",
      payment: "unpaid",
    });
    expect(filtered.filtered).toBe(1);
    expect(filtered.values[0].markedPaidMinor).toBe(0);
    expect(
      (
        await readOrderWorkspace(owner.merchantId, {
          status: "paid",
          payment: "paid",
        })
      ).filtered
    ).toBe(0);
  });
  it("returns details on demand without silently dropping gifts, discounts or raw legacy items", async () => {
    const id = await add({
      customerEmail: "local@example.test",
      address: "Road\nFull",
      city: "Local",
      notes: "Note",
      trackingNumber: "TRACK",
      isGift: 1,
      giftRecipientName: "Gift",
      giftMessage: "Gift text",
      reviewRequested: 1,
      reviewRequestedAt: "2026-09-29 13:00:00",
      checkout_review_required: 1,
      checkout_subtotal_minor: 250,
      checkout_discount_minor: 50,
      discountCode: "LOCAL",
      paymentUrl: "https://example.test/local-only",
      sallaOrderId: "EXTERNAL-59",
    });
    const row = await readOrderDetail(owner.merchantId, id);
    expect(row).toMatchObject({
      id,
      merchantId: owner.merchantId,
      totalMinor: 200,
      paymentStatus: "unpaid",
      checkoutReviewRequired: true,
      address: "Road\nFull",
      city: "Local",
      customerEmail: "local@example.test",
      notes: "Note",
      trackingNumber: "TRACK",
      isGift: true,
      giftMessage: "Gift text",
      giftRecipientName: "Gift",
      reviewRequested: true,
      reviewRequestedAt: "2026-09-29T13:00:00.000Z",
      subtotalMinor: 250,
      discountMinor: 50,
      discountCode: "LOCAL",
      externalReference: "EXTERNAL-59",
      itemsState: "legacy",
      truncatedFields: [],
    });
    expect(row?.rawItems).toContain('"price":100');
    expect(row?.items[0].unitPriceMinor).toBeNull();
    expect(
      (await readOrderWorkspace(owner.merchantId, {})).items[0]
    ).not.toHaveProperty("rawItems");
    await query("UPDATE orders SET notes='Changed later' WHERE id=?", [id]);
    expect((await readOrderDetail(owner.merchantId, id))?.notes).toBe(
      "Changed later"
    );
  });
  it("bounds long text and exposes each clipped field", async () => {
    const id = await add({
      address: "a".repeat(5000),
      notes: "n".repeat(9000),
      paymentUrl: "p".repeat(2100),
      giftMessage: "g".repeat(9000),
    });
    const r = await readOrderDetail(owner.merchantId, id);
    expect(r?.truncatedFields).toEqual([
      "address",
      "notes",
      "paymentUrl",
      "giftMessage",
    ]);
    expect(r?.address?.length).toBe(4096);
    expect(r?.notes?.length).toBe(8192);
    expect(r?.paymentUrl?.length).toBe(2048);
  });
});
