import { reviewedLoyaltyFixture } from './tests/helpers/loyalty-reviewed-fixture';
import { beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
import { getPool, closeDb } from './db/connection';
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from './tests/helpers/disposable-merchant';
import { createSessionId, hashSessionId } from './_core/session-security';
import { loyaltyRouter } from './routers-loyalty';
import * as db from './db_loyalty';
import { withLoyaltyTransaction } from './loyalty/transaction';
import { loadLoyaltySalesEvidence } from './loyalty/sales-evidence';
import { loyaltyDefaults } from '../shared/loyalty-input';
describe.skipIf(!process.env.DATABASE_URL)(
  'Loyalty authority and atomic balances on disposable MySQL',
  () => {
    let a: Awaited<ReturnType<typeof createDisposableMerchant>>,
      b: typeof a,
      sessionId: string,
      caller: ReturnType<typeof loyaltyRouter.createCaller>;
    let writes: ReturnType<typeof reviewedLoyaltyFixture>;
    const scoped = <T>(work: () => Promise<T>) =>
      withLoyaltyTransaction(a.merchantId, work, {
        merchantId: a.merchantId,
        actorId: a.userId,
        sessionId,
        permission: 'campaigns.manage',
      });
    const atomicCredit = (input: any) =>
      scoped(() =>
        db.addPointsToCustomer(
          a.merchantId,
          input.customerPhone,
          input.points,
          input.reason,
          input.reasonAr,
          input.orderId
        )
      );
    const phone = '966500000522',
      adjust = {
        customerPhone: phone,
        points: 100,
        reason: 'Test adjustment',
        reasonAr: 'تعديل اختباري',
      };
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const reward = async (merchantId = a.merchantId, extra = '') => {
      await db.updateLoyaltySettings(merchantId, { isEnabled: 1 });
      return Number(
        (
          await q(
            "INSERT INTO loyalty_rewards(merchant_id,title,title_ar,type,points_cost,max_redemptions) VALUES (?,'Reward','مكافأة','gift',50," +
              (extra || 'NULL') +
              ')',
            [merchantId]
          )
        ).insertId
      );
    };
    const order = async (merchantId = a.merchantId) =>
      Number(
        (
          await q(
            "INSERT INTO orders(merchantId,customerPhone,customerName,items,totalAmount) VALUES (?,?,'Test','[]',100)",
            [merchantId, phone]
          )
        ).insertId
      );
    beforeEach(async () => {
      a = await createDisposableMerchant('loyalty522');
      b = await createDisposableMerchant('loyalty522other');
      sessionId = createSessionId();
      await q(
        'INSERT INTO auth_sessions(user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))',
        [a.userId, hashSessionId(sessionId)]
      );
      caller = loyaltyRouter.createCaller({
        user: { id: a.userId, role: 'user' },
        session: { sessionId },
        req: { headers: { 'x-merchant-id': String(a.merchantId) } },
      } as any);
      writes = reviewedLoyaltyFixture(caller, phone);
    });
    afterEach(async () => {
      // Remove leaf rows before fixture cascades; never touch another account's records.
      for (const x of [a, b])
        if (x) {
          await q('DELETE FROM loyalty_transactions WHERE merchant_id=?', [
            x.merchantId,
          ]);
          await q('DELETE FROM loyalty_redemptions WHERE merchant_id=?', [
            x.merchantId,
          ]);
          await q('DELETE FROM loyalty_points WHERE merchant_id=?', [
            x.merchantId,
          ]);
        }
      await cleanupDisposableMerchants([a?.userId, b?.userId].filter(Boolean));
    });
    afterAll(closeDb);
    it('reads absent settings/customer without creating or enabling anything', async () => {
      expect(await caller.getSettings()).toBeNull();
      expect(
        await caller.getCustomerPoints({ customerPhone: phone })
      ).toBeNull();
      expect(await caller.getTiers()).toEqual([]);
      for (const table of [
        'loyalty_settings',
        'loyalty_points',
        'loyalty_tiers',
      ])
        expect(
          await q('SELECT id FROM ' + table + ' WHERE merchant_id=?', [
            a.merchantId,
          ])
        ).toEqual([]);
    });
    it('initializes settings/tiers once and preserves explicit zeros and disabled defaults', async () => {
      await Promise.all([
        scoped(() =>
          db.updateLoyaltySettings(a.merchantId, {
            pointsPerCurrency: 0,
            pointsExpiryDays: 0,
          })
        ),
        scoped(() =>
          db.updateLoyaltySettings(a.merchantId, { referralBonusPoints: 0 })
        ),
      ]);
      expect(await caller.getSettings()).toMatchObject({
        ...loyaltyDefaults,
        pointsPerCurrency: 0,
        pointsExpiryDays: 0,
        referralBonusPoints: 0,
      });
      expect(await caller.getTiers()).toHaveLength(3);
      expect(
        await q('SELECT id FROM loyalty_settings WHERE merchant_id=?', [
          a.merchantId,
        ])
      ).toHaveLength(1);
    });
    it.each(['revoked', 'expired', 'foreign', 'missing'])(
      'rejects %s sessions before reads and writes',
      async mode => {
        if (mode === 'revoked')
          await q(
            'UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?',
            [a.userId]
          );
        if (mode === 'expired')
          await q(
            'UPDATE auth_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE user_id=?',
            [a.userId]
          );
        if (mode === 'foreign')
          await q('UPDATE auth_sessions SET user_id=? WHERE user_id=?', [
            b.userId,
            a.userId,
          ]);
        if (mode === 'missing')
          await q('DELETE FROM auth_sessions WHERE user_id=?', [a.userId]);
        await expect(caller.getSettings()).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
        await expect(writes.addPoints(adjust)).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
        expect(await db.getCustomerPoints(a.merchantId, phone)).toBeNull();
      }
    );
    it.each(['viewer', 'sales_supervisor', 'inactive'])(
      'blocks %s membership and never falls back to legacy ownership',
      async role => {
        await q(
          'INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,?)',
          [
            a.merchantId,
            a.userId,
            role === 'inactive' ? 'owner' : role,
            role === 'inactive' ? 0 : 1,
          ]
        );
        await expect(writes.addPoints(adjust)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
        expect(await db.getCustomerPoints(a.merchantId, phone)).toBeNull();
      }
    );
    it('allows the selected manager and rechecks authority after a downgrade', async () => {
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [a.merchantId, a.userId]
      );
      await writes.addPoints(adjust);
      await q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=?", [
        a.merchantId,
      ]);
      await expect(
        withLoyaltyTransaction(
          a.merchantId,
          () =>
            db.addPointsToCustomer(
              a.merchantId,
              phone,
              100,
              'Again',
              'مرة أخرى'
            ),
          {
            merchantId: a.merchantId,
            actorId: a.userId,
            sessionId,
            permission: 'campaigns.manage',
          }
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(
        (await db.getCustomerPoints(a.merchantId, phone))?.totalPoints
      ).toBe(100);
    });
    it('rejects foreign reward redemption without touching either tenant', async () => {
      await writes.addPoints(adjust);
      const id = await reward(b.merchantId);
      await expect(
        writes.redeemReward({
          customerPhone: phone,
          customerName: 'Test',
          rewardId: id,
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(
        (await db.getCustomerPoints(a.merchantId, phone))?.totalPoints
      ).toBe(100);
      expect(await caller.getRedemptions({})).toEqual([]);
      expect(
        (
          await q(
            'SELECT current_redemptions FROM loyalty_rewards WHERE id=?',
            [id]
          )
        )[0].current_redemptions
      ).toBe(0);
    });
    it('rejects foreign tier, reward, product, order, and redemption references', async () => {
      await db.getOrCreateLoyaltySettings(b.merchantId);
      const tier = (await db.getLoyaltyTiers(b.merchantId))[0],
        id = await reward(b.merchantId),
        foreignOrder = await order(b.merchantId);
      await expect(
        writes.updateTier({ id: tier.id, minPoints: 900 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        writes.updateReward({ id, title: 'Wrong' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(writes.deleteReward({ id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(
        atomicCredit({ ...adjust, orderId: foreignOrder })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const product = Number(
        (
          await q(
            "INSERT INTO products(merchantId,name,price) VALUES (?,'Product',100)",
            [b.merchantId]
          )
        ).insertId
      );
      await expect(
        writes.createReward({
          title: 'Free',
          titleAr: 'مجاني',
          type: 'free_product',
          pointsCost: 1,
          isActive: 1,
          productId: product,
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const redemption = Number(
        (
          await q(
            'INSERT INTO loyalty_redemptions(merchant_id,customer_phone,reward_id,points_spent) VALUES (?,?,?,50)',
            [b.merchantId, phone, id]
          )
        ).insertId
      );
      await expect(
        writes.updateRedemption({ id: redemption, status: 'used' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('scopes linked tiers even if a historical points row references another tenant', async () => {
      await db.getOrCreateLoyaltySettings(b.merchantId);
      const tier = (await db.getLoyaltyTiers(b.merchantId))[0];
      await writes.addPoints(adjust);
      await q(
        'UPDATE loyalty_points SET current_tier_id=? WHERE merchant_id=?',
        [tier.id, a.merchantId]
      );
      expect(
        (await caller.getCustomerPoints({ customerPhone: phone }))?.tier
      ).toBeNull();
      expect((await caller.getAllCustomersPoints({}))[0].tier).toBeNull();
    });
    it('serializes concurrent internal ledger credits and initial customer creation', async () => {
      await Promise.all(Array.from({ length: 8 }, () => atomicCredit(adjust)));
      expect(await db.getCustomerPoints(a.merchantId, phone)).toMatchObject({
        totalPoints: 800,
        lifetimePoints: 800,
      });
      expect(await caller.getTransactions({})).toHaveLength(8);
      expect(
        await q('SELECT id FROM loyalty_points WHERE merchant_id=?', [
          a.merchantId,
        ])
      ).toHaveLength(1);
    });
    it('prevents double spending under concurrent deductions', async () => {
      await writes.addPoints(adjust);
      const results = await Promise.allSettled([
        writes.deductPoints({ ...adjust, points: 70 }),
        writes.deductPoints({ ...adjust, points: 70 }),
      ]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (await db.getCustomerPoints(a.merchantId, phone))?.totalPoints
      ).toBe(30);
      expect(await caller.getTransactions({})).toHaveLength(2);
    });
    it('atomically enforces reward stock and links the redemption to its ledger row', async () => {
      await writes.addPoints(adjust);
      const id = await reward(a.merchantId, '1');
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          writes.redeemReward({
            customerPhone: phone,
            customerName: 'Test',
            rewardId: id,
          })
        )
      );
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (await db.getCustomerPoints(a.merchantId, phone))?.totalPoints
      ).toBe(50);
      const redemptions = await caller.getRedemptions({});
      expect(redemptions).toHaveLength(1);
      expect(
        (await caller.getTransactions({})).find(t => t.type === 'redeem')
          ?.redemptionId
      ).toBe(redemptions[0].id);
    });
    it('rolls back redemption insertion, debit and stock if a later operation fails', async () => {
      await writes.addPoints(adjust);
      const id = await reward();
      await expect(
        withLoyaltyTransaction(a.merchantId, async () => {
          await db.redeemReward(a.merchantId, phone, 'Test', id);
          throw new Error('Injected failure');
        })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'loyalty:unavailable',
      });
      expect(
        (await db.getCustomerPoints(a.merchantId, phone))?.totalPoints
      ).toBe(100);
      expect(await caller.getRedemptions({})).toEqual([]);
      expect(await caller.getTransactions({})).toHaveLength(1);
      expect(
        (
          await q(
            'SELECT current_redemptions FROM loyalty_rewards WHERE id=?',
            [id]
          )
        )[0].current_redemptions
      ).toBe(0);
    });
    it('applies an order credit once and rejects changed repeat payloads', async () => {
      const orderId = await order();
      const results = await Promise.all([
        atomicCredit({ ...adjust, orderId }),
        atomicCredit({ ...adjust, orderId }),
      ]);
      expect(results.filter(r => r.alreadyApplied)).toHaveLength(1);
      expect(
        (await db.getCustomerPoints(a.merchantId, phone))?.totalPoints
      ).toBe(100);
      await expect(
        atomicCredit({ ...adjust, orderId, points: 99 })
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      expect(await caller.getTransactions({})).toHaveLength(1);
    });
    it('preserves reward history and refuses terminal redemption resurrection', async () => {
      await writes.addPoints(adjust);
      const id = await reward();
      await writes.redeemReward({
        customerPhone: phone,
        customerName: 'Test',
        rewardId: id,
      });
      const redemption = (await caller.getRedemptions({}))[0];
      await expect(writes.deleteReward({ id })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'loyalty:reward_has_history',
      });
      await writes.updateRedemption({ id: redemption.id, status: 'used' });
      await expect(
        writes.updateRedemption({ id: redemption.id, status: 'approved' })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(await caller.getRedemptions({})).toHaveLength(1);
    });
    it('fails closed for duplicate historical balances instead of adjusting both', async () => {
      await q(
        'INSERT INTO loyalty_points(merchant_id,customer_phone) VALUES (?,?),(?,?)',
        [a.merchantId, phone, a.merchantId, phone]
      );
      await expect(writes.addPoints(adjust)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'loyalty:duplicate_record',
      });
      expect(await caller.getTransactions({})).toEqual([]);
    });
    it.each([
      { points: -1 },
      { points: 0.5 },
      { points: 10000001 },
      { customerPhone: 'bad' },
      { reason: '' },
    ])('rejects invalid adjustment %j', async invalid => {
      await expect(
        writes.addPoints({ ...adjust, ...invalid })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(await db.getCustomerPoints(a.merchantId, phone)).toBeNull();
    });
    it('bounds pagination and numeric settings without converting invalid input', async () => {
      for (const input of [
        { limit: 101 },
        { limit: -1 },
        { offset: 0.5 },
        { offset: 1000001 },
      ])
        await expect(caller.getAllCustomersPoints(input)).rejects.toMatchObject(
          { code: 'BAD_REQUEST' }
        );
      for (const input of [
        { isEnabled: 2 },
        { pointsExpiryDays: 3651 },
        { currencyPerPoint: 0 },
      ])
        await expect(writes.updateSettings(input)).rejects.toMatchObject({
          code: 'BAD_REQUEST',
        });
    });
    it('requires an enabled program and does not advertise disabled or expired benefits', async () => {
      await writes.addPoints(adjust);
      const id = await reward();
      await writes.updateSettings({ isEnabled: 0 });
      expect(await loadLoyaltySalesEvidence(a.merchantId, phone)).toEqual({
        loyaltyPoints: 0,
        loyaltyTier: null,
        availableRewards: [],
      });
      await expect(
        writes.redeemReward({
          customerPhone: phone,
          customerName: 'Test',
          rewardId: id,
        })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'loyalty:program_disabled',
      });
      await writes.updateSettings({ isEnabled: 1 });
      await q(
        'UPDATE loyalty_rewards SET valid_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',
        [id]
      );
      expect(
        (await loadLoyaltySalesEvidence(a.merchantId, phone)).availableRewards
      ).toEqual([]);
    });
    it('returns fresh tier evidence after thresholds change', async () => {
      await writes.updateSettings({ isEnabled: 1 });
      await writes.addPoints({ ...adjust, points: 500 });
      const tier = (await caller.getTiers()).find(t => t.name === 'Silver')!;
      await writes.updateTier({ id: tier.id, minPoints: 1000 });
      expect(
        (await loadLoyaltySalesEvidence(a.merchantId, phone)).loyaltyTier?.name
      ).toBe('برونزي');
    });
    it('validates complete reward edits and leaves prior values on rejection', async () => {
      const result = await writes.createReward({
        title: 'Discount',
        titleAr: 'خصم',
        type: 'discount',
        pointsCost: 10,
        discountAmount: 20,
        discountType: 'percentage',
        isActive: 1,
      });
      await expect(
        writes.updateReward({
          id: Number(result.insertId),
          discountAmount: 101,
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect((await caller.getRewards({}))[0].discountAmount).toBe(20);
    });
    it('denies suspended stores and disabled canonical owners to workers as well', async () => {
      await q("UPDATE merchants SET status='suspended' WHERE id=?", [
        a.merchantId,
      ]);
      await expect(
        db.addPointsToCustomer(a.merchantId, phone, 1, 'Test', 'اختبار')
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await q("UPDATE merchants SET status='active' WHERE id=?", [
        a.merchantId,
      ]);
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        a.userId,
      ]);
      await expect(
        db.addPointsToCustomer(a.merchantId, phone, 1, 'Test', 'اختبار')
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  }
);
