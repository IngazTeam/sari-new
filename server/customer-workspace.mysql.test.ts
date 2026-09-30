import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getDb, getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readCustomerList,
  readCustomerDetail,
  exportCustomerWorkspace,
} from "./customer-workspace";

const now = new Date("2026-09-30T12:00:00.000Z");
describe.skipIf(!process.env.DATABASE_URL)("customer workspace MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const query = async (sql: string, values: unknown[] = []) =>
    (await (await getPool())!.execute<any>(sql, values))[0];
  const insert = async (
    table:
      | "conversations"
      | "orders"
      | "zid_customers"
      | "customer_profiles"
      | "loyalty_points",
    changes: Record<string, unknown> = {}
  ) => {
    const defaults: Record<string, Record<string, unknown>> = {
      conversations: {
        merchantId: owner.merchantId,
        customerPhone: "0500000073",
        customerName: "Conversation name",
        createdAt: "2026-09-01 10:00:00",
        lastMessageAt: "2026-09-30 10:00:00",
      },
      orders: {
        merchantId: owner.merchantId,
        customerPhone: "+966500000073",
        customerName: "Order name",
        items: "[]",
        totalAmount: 125,
        status: "processing",
        currency: "SAR",
        createdAt: "2026-09-29 10:00:00",
      },
      zid_customers: {
        merchant_id: owner.merchantId,
        zid_customer_id: "test73",
        phone: "00966500000073",
        name: "Zid name",
        last_synced_at: "2026-09-30 11:00:00",
        created_at: "2026-08-01 10:00:00",
      },
      customer_profiles: {
        merchant_id: owner.merchantId,
        customer_phone: "500000073",
        display_name: "Profile name",
        last_seen_at: "2026-09-29 09:00:00",
        created_at: "2026-08-02 10:00:00",
      },
      loyalty_points: {
        merchant_id: owner.merchantId,
        customer_phone: "966500000073",
        customer_name: "Loyalty name",
        total_points: 12,
        created_at: "2026-08-03 10:00:00",
      },
    };
    const row = { ...defaults[table], ...changes },
      keys = Object.keys(row);
    return Number(
      (
        await query(
          `INSERT INTO ${table} (${keys.map(k => "`" + k + "`").join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
          Object.values(row)
        )
      ).insertId
    );
  };
  const list = (selection = {}) =>
    readCustomerList(owner.merchantId, selection, now);
  const detail = (selection = {}) =>
    readCustomerDetail(
      owner.merchantId,
      { key: "966500000073", ...selection },
      now
    );
  beforeEach(async () => {
    owner = await createDisposableMerchant("customer73");
    other = await createDisposableMerchant("customer73-other");
  });
  afterEach(async () =>
    cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
  );
  afterAll(closeDb);
  it("exports all matched rows in one scope with currency values and literal search", async () => {
    await insert("conversations", { customerName: "=50%_off" });
    await insert("orders");
    await insert("orders", { currency: "USD", totalAmount: 225 });
    await insert("orders", { status: "cancelled", totalAmount: 9999 });
    await insert("conversations", {
      customerPhone: "other-contact",
      customerName: "Different",
    });
    await insert("orders", {
      merchantId: other.merchantId,
      totalAmount: 88888,
    });
    const result = await exportCustomerWorkspace(
      owner.merchantId,
      { search: "%_", language: "en" },
      now
    );
    expect(result.count).toBe(1);
    expect(result.data).toContain('"\'=50%_off"');
    expect(result.data).toContain('"1.25","2.25"');
    expect(result.data).not.toContain("Different");
    expect(result.data).not.toContain("888.88");
  });
  it("unifies safe phone spellings across all five sources without writing stored identities", async () => {
    for (const table of [
      "conversations",
      "orders",
      "zid_customers",
      "customer_profiles",
      "loyalty_points",
    ] as const)
      await insert(table);
    await insert("conversations", {
      merchantId: other.merchantId,
      customerName: "Other tenant",
    });
    const result = await list();
    expect(result.totals).toMatchObject({
      all: 1,
      active: 1,
      firstRecordedThisMonth: 0,
    });
    expect(result.rows[0]).toMatchObject({
      key: "966500000073",
      name: "Conversation name",
      sources: ["conversation", "order", "profile", "zid", "loyalty"],
      conversationCount: 1,
      orderCount: 1,
      firstRecordedAt: "2026-08-01T10:00:00.000Z",
    });
    for (const key of [
      "0500000073",
      "+966500000073",
      "00966500000073",
      "500000073",
      "966500000073",
    ]) {
      expect((await detail({ key })).customer?.key).toBe("966500000073");
    }
    expect((await detail()).loyalty).toEqual({ records: 1, points: 12 });
    expect(
      (
        await query(
          "SELECT customerPhone FROM conversations WHERE merchantId=?",
          [owner.merchantId]
        )
      )[0].customerPhone
    ).toBe("0500000073");
    expect(
      (await readCustomerList(other.merchantId, {}, now)).rows[0].name
    ).toBe("Other tenant");
  });
  it("includes order-only, profile-only, loyalty-only and active Zid customers; does not count sync as engagement", async () => {
    await insert("orders", { customerPhone: "order_customer" });
    await insert("customer_profiles", { customer_phone: "profile_customer" });
    await insert("loyalty_points", { customer_phone: "loyalty_customer" });
    await insert("zid_customers", { phone: "zid_customer" });
    await insert("zid_customers", {
      phone: "hidden_customer",
      zid_customer_id: "hidden",
      is_active: 0,
    });
    const result = await list();
    expect(result.totals).toMatchObject({ all: 4, active: 2, unknown: 2 });
    expect(
      result.rows.find(r => r.key === "zid_customer")?.lastInteractionAt
    ).toBeNull();
    expect((await detail({ key: "loyalty_customer" })).loyalty.points).toBe(12);
  });
  it("does not infer money, sum currencies or count pending/cancelled amounts", async () => {
    await insert("orders");
    await insert("orders", { totalAmount: 375, payment_status: "paid" });
    await insert("orders", { totalAmount: 777, currency: "USD" });
    await insert("orders", { totalAmount: -1 });
    await insert("orders", { totalAmount: 99999, status: "cancelled" });
    await insert("orders", { totalAmount: 99999, status: "pending" });
    await insert("orders", {
      totalAmount: 99999,
      merchantId: other.merchantId,
    });
    const result = await detail();
    expect(result.customer?.orderCount).toBe(6);
    expect(result.amounts).toEqual([
      {
        currency: "SAR",
        eligibleOrders: 3,
        excludedAmounts: 1,
        totalMinor: 500,
        markedPaidMinor: 375,
      },
      {
        currency: "USD",
        eligibleOrders: 1,
        excludedAmounts: 0,
        totalMinor: 777,
        markedPaidMinor: 0,
      },
    ]);
    expect(result.orders.rows.find(r => r.totalMinor === null)).toBeDefined();
    expect(result).not.toHaveProperty("totalSpent");
  });
  it("keeps group identifiers case-sensitive, excludes blanks, and searches SQL metacharacters literally", async () => {
    await insert("conversations", {
      customerPhone: "group_A",
      customerName: "50%_off",
    });
    await insert("conversations", {
      customerPhone: "group_a",
      customerName: "Another",
    });
    await insert("conversations", { customerPhone: "  " });
    await insert("conversations", { customerPhone: "legacy\u0000phone" });
    expect((await list()).totals).toMatchObject({
      all: 2,
      excludedEmptyIdentifiers: 1,
      excludedInvalidIdentifiers: 1,
    });
    expect((await list({ search: "%_" })).pagination.total).toBe(1);
    expect((await list({ search: "' OR 1=1 --" })).rows).toEqual([]);
    expect((await detail({ key: "group_A" })).customer?.name).toBe("50%_off");
    expect((await detail({ key: "missing" })).customer).toBeNull();
  });
  it("bounds future records, distinguishes activity from first recorded month, and uses stable pagination", async () => {
    for (let i = 0; i < 27; i++)
      await insert("conversations", {
        customerPhone: `customer_${String(i).padStart(2, "0")}`,
      });
    await insert("conversations", {
      customerPhone: "future",
      createdAt: "2026-09-30 12:00:01",
    });
    await insert("conversations", {
      customerPhone: "old",
      createdAt: "2026-07-01 10:00:00",
      lastMessageAt: "2026-08-01 10:00:00",
    });
    await insert("conversations", {
      customerPhone: "recent",
      lastMessageAt: "2026-09-15 10:00:00",
    });
    const first = await list(),
      second = await list({ page: 2 });
    expect(first.pagination).toEqual({
      page: 1,
      pageSize: 25,
      total: 29,
      pages: 2,
    });
    expect(second.rows).toHaveLength(4);
    expect(new Set([...first.rows, ...second.rows].map(r => r.key)).size).toBe(
      29
    );
    expect(first.totals).toMatchObject({
      all: 29,
      active: 27,
      recent: 1,
      inactive: 1,
      firstRecordedThisMonth: 28,
    });
    expect((await list({ activity: "recent" })).rows[0].key).toBe("recent");
    expect((await list({ page: 999 })).rows).toEqual([]);
  });
  it("paginates details with true totals and avoids a fabricated sum for duplicate loyalty records", async () => {
    for (let i = 0; i < 27; i++) {
      await insert("conversations");
      await insert("orders");
    }
    await insert("loyalty_points");
    await insert("loyalty_points", {
      customer_phone: "+966500000073",
      total_points: 99,
    });
    const result = await detail({ ordersPage: 2, conversationsPage: 2 });
    expect(result.orders.rows).toHaveLength(2);
    expect(result.conversations.rows).toHaveLength(2);
    expect(result.orders.pagination.total).toBe(27);
    expect(result.conversations.pagination.total).toBe(27);
    expect(result.loyalty).toEqual({ records: 2, points: null });
  });
  it("keeps totals and page rows in one repeatable snapshot during a concurrent insert", async () => {
    await insert("conversations");
    const database = (await getDb())!,
      original = database.transaction.bind(database);
    let calls = 0;
    const spy = vi.spyOn(database, "transaction").mockImplementation(((
      run: any,
      options: any
    ) =>
      original(
        async tx =>
          run(
            new Proxy(tx, {
              get(target, key, receiver) {
                if (key === "execute")
                  return async (statement: any) => {
                    const result = await target.execute(statement);
                    if (++calls === 2)
                      await insert("conversations", {
                        customerPhone: "new_customer",
                      });
                    return result;
                  };
                return Reflect.get(target, key, receiver);
              },
            })
          ),
        options
      )) as typeof database.transaction);
    try {
      const result = await list();
      expect(result.totals.all).toBe(1);
      expect(result.rows).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
    expect((await list()).totals.all).toBe(2);
  });
});
