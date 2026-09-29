import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readOverviewWorkspace } from "./overview-workspace";
describe.skipIf(!process.env.DATABASE_URL)("overview snapshot in MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const inside = "2026-09-28 12:00:00",
    old = "2026-01-01 00:00:00",
    future = "2026-09-29 10:00:01",
    now = new Date("2026-09-29T10:00:00Z");
  const run = async (sql: string, args: any[] = []) => {
    const [r] = await (await getPool())!.execute<any>(sql, args);
    return Number(r.insertId);
  };
  const read = () =>
    readOverviewWorkspace(owner.merchantId, { period: "7d" }, now);
  const order = (
    merchant = owner.merchantId,
    status = "pending",
    payment = "unpaid",
    currency = "SAR",
    amount = 12000,
    date = inside,
    phone = "local"
  ) =>
    run(
      "INSERT INTO orders (merchantId,customerName,customerPhone,items,totalAmount,status,payment_status,currency,createdAt) VALUES (?,'Local',?,'[]',?,?,?,?,?)",
      [merchant, phone, amount, status, payment, currency, date]
    );
  beforeEach(async () => {
    owner = await createDisposableMerchant("overview");
    other = await createDisposableMerchant("overview-other");
  });
  afterEach(async () => {
    // Referrals lack a foreign key: remove only the fixture's leaf records before its codes.
    for (const merchant of [owner, other].filter(Boolean))
      await run(
        "DELETE r FROM referrals r JOIN referral_codes c ON c.id=r.referralCodeId WHERE c.merchantId=?",
        [merchant.merchantId]
      );
    await cleanupDisposableMerchants(
      [owner?.userId, other?.userId].filter(Boolean)
    );
  });
  afterAll(closeDb);
  it("returns real empty samples with null ratios and all status bins", async () => {
    const r = await read();
    expect(r.period).toBe("7d");
    expect(r.from).toBe("2026-09-23T00:00:00.000Z");
    expect(r.through).toBe(now.toISOString());
    expect(r.orders.total).toBe(0);
    expect(r.orders.statuses).toHaveLength(6);
    expect(r.orders.payments).toHaveLength(3);
    expect(
      r.orders.values.every(v => v.totalMinor === 0 && v.averageMinor === null)
    ).toBe(true);
    expect(r.reviews.average).toBeNull();
    expect(r.reviews.distribution).toHaveLength(5);
    expect(r.carts.share).toBeNull();
    expect(r.referrals.share).toBeNull();
    expect(r.association.ratio).toBeNull();
    expect(r.salesProficiency).toBeNull();
  });
  it("separates currencies, paid flags, refunded and cancelled values within the order creation cohort", async () => {
    await order(
      owner.merchantId,
      "pending",
      "unpaid",
      "SAR",
      12000,
      "2026-09-23 00:00:00"
    );
    await order(owner.merchantId, "paid", "paid", "SAR", 3000);
    await order(owner.merchantId, "delivered", "refunded", "SAR", 5000);
    await order(owner.merchantId, "cancelled", "paid", "SAR", 7000);
    await order(owner.merchantId, "processing", "paid", "USD", 2300);
    await order(
      owner.merchantId,
      "shipped",
      "unpaid",
      "USD",
      1700,
      "2026-09-29 10:00:00"
    );
    await order(owner.merchantId, "pending", "unpaid", "SAR", -200);
    await order(other.merchantId);
    await order(owner.merchantId, "pending", "unpaid", "SAR", 999999, old);
    await order(owner.merchantId, "pending", "unpaid", "SAR", 999999, future);
    const r = await read();
    expect(r.orders.total).toBe(7);
    expect(r.orders.statuses.map(v => v.count)).toEqual([2, 1, 1, 1, 1, 1]);
    expect(r.orders.payments.map(v => v.count)).toEqual([3, 3, 1]);
    expect(r.orders.values).toEqual([
      {
        currency: "SAR",
        count: 3,
        totalMinor: 20000,
        averageMinor: 20000 / 3,
        markedPaidCount: 1,
        markedPaidMinor: 3000,
        excludedAmounts: 1,
      },
      {
        currency: "USD",
        count: 2,
        totalMinor: 4000,
        averageMinor: 2000,
        markedPaidCount: 1,
        markedPaidMinor: 2300,
        excludedAmounts: 0,
      },
    ]);
  });
  it("reads actual reviews, counts records rather than customers, and reports invalid ratings", async () => {
    const o = await order(
        owner.merchantId,
        "pending",
        "unpaid",
        "SAR",
        100,
        old
      ),
      foreign = await order(other.merchantId);
    const review = (mid: number, oid: number, rating: number, date = inside) =>
      run(
        "INSERT INTO customer_reviews (merchantId,orderId,customerPhone,rating,isPublic,createdAt) VALUES (?,?,'same',?,0,?)",
        [mid, oid, rating, date]
      );
    await review(owner.merchantId, o, 5);
    await review(owner.merchantId, o, 1);
    await review(owner.merchantId, o, 8);
    await review(owner.merchantId, o, 3, old);
    await review(owner.merchantId, o, 2, future);
    await review(other.merchantId, foreign, 5);
    await review(owner.merchantId, foreign, 5);
    const r = await read();
    expect(r.orders.total).toBe(0);
    expect(r.reviews).toMatchObject({
      total: 3,
      valid: 2,
      invalid: 1,
      average: 3,
      meaning: "stored_review_records_not_unique_customers",
    });
    expect(
      r.reviews.distribution.map(v => [v.stars, v.count, v.share])
    ).toEqual([
      [5, 1, 50],
      [4, 0, 0],
      [3, 0, 0],
      [2, 0, 0],
      [1, 1, 50],
    ]);
  });
  it("counts current cart and referral flags across all owned codes with explicit invalid values", async () => {
    const cart = (mid: number, flag: number, date = inside) =>
      run(
        "INSERT INTO abandoned_carts (merchantId,customerPhone,items,totalAmount,recovered,createdAt) VALUES (?,'local','[]',100,?,?)",
        [mid, flag, date]
      );
    for (const flag of [1, 0, 3]) await cart(owner.merchantId, flag);
    await cart(other.merchantId, 1);
    await cart(owner.merchantId, 1, old);
    await cart(owner.merchantId, 1, future);
    const code = (mid: number, active: number) =>
      run(
        "INSERT INTO referral_codes (merchantId,code,referrerPhone,referrerName,isActive) VALUES (?,?, 'local','Local',?)",
        [mid, `local-${mid}-${active}`, active]
      );
    const a = await code(owner.merchantId, 1),
      b = await code(owner.merchantId, 0),
      c = await code(other.merchantId, 1);
    const referral = (id: number, flag: number, date = inside) =>
      run(
        "INSERT INTO referrals (referralCodeId,referredPhone,referredName,orderCompleted,createdAt) VALUES (?,'local','Local',?,?)",
        [id, flag, date]
      );
    await referral(a, 1);
    await referral(b, 0);
    await referral(b, 3);
    await referral(c, 1);
    await referral(a, 1, old);
    await referral(a, 1, future);
    const r = await read();
    expect(r.carts).toMatchObject({
      total: 3,
      markedRecovered: 1,
      other: 1,
      invalidFlags: 1,
      share: (1 / 3) * 100,
    });
    expect(r.referrals).toMatchObject({
      total: 3,
      markedCompleted: 1,
      pending: 1,
      invalidFlags: 1,
      share: (1 / 3) * 100,
    });
  });
  it("counts exact phone association once per conversation without implying paid conversion", async () => {
    for (const phone of ["same", "none", " "])
      await run(
        "INSERT INTO conversations (merchantId,customerPhone,createdAt) VALUES (?,?,?)",
        [owner.merchantId, phone, inside]
      );
    await order(
      owner.merchantId,
      "cancelled",
      "unpaid",
      "SAR",
      100,
      inside,
      "same"
    );
    await order(
      owner.merchantId,
      "pending",
      "unpaid",
      "SAR",
      100,
      inside,
      "same"
    );
    await order(other.merchantId, "paid", "paid", "SAR", 100, inside, "none");
    await order(owner.merchantId, "paid", "paid", "SAR", 100, inside, " ");
    const r = await read();
    expect(r.association).toMatchObject({
      total: 3,
      positive: 1,
      ratio: (1 / 3) * 100,
      salesConversion: null,
      salesProficiency: null,
      includesAllOrderStatuses: true,
    });
  });
  it("rejects invalid scopes and periods before reading", async () => {
    await expect(readOverviewWorkspace(0, { period: "7d" })).rejects.toThrow();
    await expect(
      readOverviewWorkspace(owner.merchantId, { period: "all" } as any)
    ).rejects.toThrow();
  });
});
