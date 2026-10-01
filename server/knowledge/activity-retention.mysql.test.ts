import { beforeEach, afterEach, afterAll, describe, it, expect } from "vitest";
import { createDisposableMerchant, cleanupDisposableMerchants } from "../tests/helpers/disposable-merchant";
import { getPool, closeDb } from "../db/connection";
import { purgeExpiredKnowledgeActivity } from "./activity-retention";
import { readKnowledgeActivity } from "./activity-readout";
describe.skipIf(!process.env.DATABASE_URL)("activity retention bounded maintenance (MySQL)", () => {
  const users: number[] = [];
  let merchantId: number, otherId: number;
  const query = async (sql: string, args: unknown[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  beforeEach(async () => {
    const own = await createDisposableMerchant("activity-ttl"); users.push(own.userId); merchantId = own.merchantId;
    const other = await createDisposableMerchant("activity-ttl"); users.push(other.userId); otherId = other.merchantId;
  });
  afterEach(async () => { await cleanupDisposableMerchants(users); users.length = 0; });
  afterAll(closeDb);
  const add = async (id: number, days: number) => query(`INSERT INTO sari_activity_log (merchant_id,action_type,description,details,created_at) VALUES (?,'test','History','legacy text',TIMESTAMPADD(DAY,?,UTC_TIMESTAMP()))`, [id, -days]);
  it("reading retains old history; only explicit scoped maintenance removes expired rows", async () => {
    await add(merchantId, 91); await add(merchantId, 89); await add(merchantId, 0); await add(otherId, 91);
    expect((await readKnowledgeActivity(merchantId, undefined)).total).toBe(3);
    expect(await purgeExpiredKnowledgeActivity({ merchantId })).toBe(1);
    expect((await readKnowledgeActivity(merchantId, undefined)).total).toBe(2);
    expect((await readKnowledgeActivity(otherId, undefined)).total).toBe(1);
    expect(await purgeExpiredKnowledgeActivity({ merchantId })).toBe(0);
  });
  it("deletes no more than the batch and safely continues through retries", async () => {
    for (let i = 0; i < 7; i++) await add(merchantId, 100);
    await add(merchantId, 0);
    expect(await purgeExpiredKnowledgeActivity({ merchantId }, 3)).toBe(3);
    expect(await purgeExpiredKnowledgeActivity({ merchantId }, 3)).toBe(3);
    expect(await purgeExpiredKnowledgeActivity({ merchantId }, 3)).toBe(1);
    expect((await readKnowledgeActivity(merchantId, undefined)).total).toBe(1);
  });
});
