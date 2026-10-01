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
import { readConversationInbox } from "./conversation-inbox";

describe.skipIf(!process.env.DATABASE_URL)(
  "tenant inbox snapshot in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const now = new Date("2026-10-01T12:00:00Z");
    const query = async (sql: string, values: unknown[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    async function conversation(changes: Record<string, unknown> = {}) {
      const row = {
        merchantId: owner.merchantId,
        customerPhone: "local-test",
        customerName: "Local customer",
        lastMessageAt: "2026-10-01 10:00:00",
        deal_stage: "ready",
        ...changes,
      };
      return Number(
        (
          await query(
            `INSERT INTO conversations (${Object.keys(row)
              .map(k => "`" + k + "`")
              .join(",")}) VALUES (${Object.keys(row)
              .map(() => "?")
              .join(",")})`,
            Object.values(row)
          )
        ).insertId
      );
    }
    const escalation = (
      id: number,
      merchantId = owner.merchantId,
      status = "pending"
    ) =>
      query(
        "INSERT INTO sari_escalation_queue (merchant_id,conversation_id,customer_phone,question,status) VALUES (?,?,'local-test','local example',?)",
        [merchantId, id, status]
      );
    const read = (input = {}) =>
      readConversationInbox(owner.merchantId, input, now);
    beforeEach(async () => {
      owner = await createDisposableMerchant("inbox209");
      other = await createDisposableMerchant("inbox209-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("isolates all rows and totals and paginates equal timestamps deterministically", async () => {
      const a = await conversation(),
        b = await conversation(),
        c = await conversation();
      await conversation({ merchantId: other.merchantId });
      const first = await read({ pageSize: 2 }),
        second = await read({ page: 2, pageSize: 2 });
      expect(first).toMatchObject({
        merchantId: owner.merchantId,
        total: 3,
        totalPages: 2,
        checkedAt: now.toISOString(),
      });
      expect(first.items.map(r => r.id)).toEqual([c, b]);
      expect(second.items.map(r => r.id)).toEqual([a]);
    });
    it("treats wildcard and SQL-looking search as literal text across the whole inbox", async () => {
      await conversation({ customerName: "عميل عادي" });
      const wanted = await conversation({ customerName: "عميل %_' OR 1=1" });
      await conversation({
        merchantId: other.merchantId,
        customerName: "عميل %_' OR 1=1",
      });
      const result = await read({ search: "  %_' OR 1=1  " });
      expect(result.total).toBe(1);
      expect(result.items.map(r => r.id)).toEqual([wanted]);
    });
    it("combines stage and human need, deduplicates escalations and rejects foreign escalation records", async () => {
      const wanted = await conversation(),
        wrongStage = await conversation({ deal_stage: "new" }),
        forged = await conversation();
      await escalation(wanted);
      await escalation(wanted, owner.merchantId, "notified");
      await escalation(wrongStage);
      await escalation(forged, other.merchantId);
      const result = await read({ stage: "ready", needsHuman: true });
      expect(result.total).toBe(1);
      expect(result.items.map(r => r.id)).toEqual([wanted]);
      expect((await read({ needsHuman: true })).total).toBe(2);
    });
    it("uses one UTC cutoff for ready and excludes future activity", async () => {
      await conversation({ lastMessageAt: "2026-09-29 12:00:00" });
      const wanted = await conversation({
        lastMessageAt: "2026-09-29 12:00:01",
      });
      await conversation({ lastMessageAt: "2026-10-01 12:00:01" });
      const current = await conversation({
        lastMessageAt: "2026-10-01 12:00:00",
      });
      expect((await read({ stage: "ready" })).items.map(r => r.id)).toEqual([
        current,
        wanted,
      ]);
    });
    it("keeps stalled leads strictly before 48 hours and excludes known losses", async () => {
      const wanted = await conversation({
        deal_stage: "qualified",
        lastMessageAt: "2026-09-29 11:59:59",
      });
      await conversation({
        deal_stage: "interested",
        lastMessageAt: "2026-09-29 12:00:00",
      });
      await conversation({
        deal_stage: "interested",
        lastMessageAt: "2026-09-28 10:00:00",
        loss_reason: "price",
      });
      await conversation({
        deal_stage: "new",
        lastMessageAt: "2026-09-28 10:00:00",
      });
      expect((await read({ stage: "stalled" })).items.map(r => r.id)).toEqual([
        wanted,
      ]);
    });
  it("keeps empty lists real and out-of-range pages honest", async () => {
      expect(await read()).toMatchObject({
        total: 0,
        totalPages: 0,
        items: [],
      });
    const a = await conversation(),
      b = await conversation();
      expect((await read()).items.map(r => r.id)).toEqual([b, a]);
      expect(await read({ page: 4, pageSize: 1 })).toMatchObject({
        total: 2,
        totalPages: 2,
        page: 4,
        items: [],
      });
    });
    it("uses the same repeatable snapshot when another connection inserts between count and rows", async () => {
      const first = await conversation();
      const db = (await getDb())!,
        transaction = db.transaction.bind(db);
      let inserted = false;
      vi.spyOn(db, "transaction").mockImplementation(
        (callback: any, config: any) =>
          transaction(async (tx: any) => {
            let selects = 0;
            const proxy = new Proxy(tx, {
              get(target, key) {
                if (key !== "select") return Reflect.get(target, key);
                return (...args: any[]) => {
                  const selection = target.select(...args);
                  selects++;
                  if (selects !== 1) return selection;
                  const from = selection.from.bind(selection);
                  selection.from = (...tables: any[]) => {
                    const builder = from(...tables),
                      where = builder.where.bind(builder);
                    builder.where = (...conditions: any[]) => {
                      const statement = where(...conditions);
                      return {
                        then: (resolve: any, reject: any) =>
                          Promise.resolve(statement)
                            .then(async value => {
                              await conversation({
                                customerName: "Arrived during read",
                              });
                              inserted = true;
                              return value;
                            })
                            .then(resolve, reject),
                      };
                    };
                    return builder;
                  };
                  return selection;
                };
              },
            });
            return callback(proxy);
          }, config)
      );
      const result = await read();
      expect(inserted).toBe(true);
      expect(result.total).toBe(1);
      expect(result.items.map(r => r.id)).toEqual([first]);
      vi.restoreAllMocks();
      expect((await read()).total).toBe(2);
    });
  }
);
