import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from '../tests/helpers/disposable-merchant';
import { getPool, closeDb } from '../db/connection';
import { readInsightSignals } from './insight-signals';
describe.skipIf(!process.env.DATABASE_URL)(
  'insight scoped aggregates (MySQL)',
  () => {
    const users: number[] = [];
    let merchantId: number;
    const run = async (text: string, args: unknown[] = []) =>
      (await (await getPool())!.execute(text, args))[0] as any;
    const account = async () => {
      const a = await createDisposableMerchant('insight-signals');
      users.push(a.userId);
      return a.merchantId;
    };
    const clock = new Date('2026-10-01T12:00:00Z');
    beforeEach(async () => {
      merchantId = await account();
    });
    afterEach(async () => {
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    it('reads a truly empty store without inventing growth', async () => {
      const v = await readInsightSignals(merchantId, clock);
      expect(v).toMatchObject({
        orders: 0,
        orderGrowthPercent: null,
        orderValueGrowthPercent: null,
        averageOrderValueMinor: null,
        topProductInSample: null,
        storeLifetimeCounts: {
          conversations: 0,
          campaigns: 0,
          activeProducts: 0,
        },
      });
    });
    it('isolates tenant, order currency, active product counts and trusted product samples', async () => {
      const other = await account();
      await run("UPDATE merchants SET currency='USD' WHERE id=?", [merchantId]);
      for (const id of [merchantId, other]) {
        await run(
          "INSERT INTO conversations (merchantId,customerPhone,customerName) VALUES (?,'fixture','private customer')",
          [id]
        );
        await run(
          "INSERT INTO campaigns (merchantId,name,message) VALUES (?,'Fixture','private campaign')",
          [id]
        );
        await run(
          "INSERT INTO products (merchantId,name,price,isActive) VALUES (?,'Visible',150,1),(?,'Hidden',150,0)",
          [id, id]
        );
        for (const currency of ['USD', 'SAR'])
          await run(
            "INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status,createdAt) VALUES (?,'fixture','private customer',?,150,?,'delivered','2026-09-30 12:00:00')",
            [
              id,
              JSON.stringify([
                { name: 'Sample', quantity: 3, unitPriceMinor: 50 },
              ]),
              currency,
            ]
          );
      }
      const v = await readInsightSignals(merchantId, clock);
      expect(v).toMatchObject({
        currency: 'USD',
        orders: 1,
        knownOrderValueMinor: 150,
        topProductInSample: 'Sample',
        storeLifetimeCounts: {
          conversations: 1,
          campaigns: 1,
          activeProducts: 1,
        },
      });
      expect(JSON.stringify(v)).not.toContain('private customer');
      expect(JSON.stringify(v)).not.toContain('private campaign');
    });
  }
);
