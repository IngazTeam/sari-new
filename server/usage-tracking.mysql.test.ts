import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, createDisposableTrialSubscription, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { hasReachedConversationLimit, hasReachedVoiceMessageLimit } from './usage-tracking';
describe.skipIf(!process.env.DATABASE_URL)('isolated local conversation and voice quota checks',()=>{
 let a: Awaited<ReturnType<typeof createDisposableMerchant>>, b: typeof a;
 let subscriptionId: number;
 const q=async(sql:string,args:any[]=[])=> (await (await getPool())!.execute(sql,args))[0];
 beforeEach(async()=>{a=await createDisposableMerchant('usage485');b=await createDisposableMerchant('usage485-other');subscriptionId=await createDisposableTrialSubscription(a.merchantId);await createDisposableTrialSubscription(b.merchantId);});
 afterEach(()=>cleanupDisposableMerchants([a?.userId,b?.userId].filter(Boolean)));afterAll(closeDb);
 it('allows known trial capacity and blocks its exact finite limits',async()=>{
  expect(await hasReachedConversationLimit(a.merchantId)).toBe(false);expect(await hasReachedVoiceMessageLimit(a.merchantId)).toBe(false);
  await q('UPDATE merchant_subscriptions SET conversations_used=100,voice_messages_used=20 WHERE id=?',[subscriptionId]);
  expect(await hasReachedConversationLimit(a.merchantId)).toBe(true);expect(await hasReachedVoiceMessageLimit(a.merchantId)).toBe(true);
 });
 it('blocks malformed negative counters instead of treating them as remaining capacity',async()=>{
  await q('UPDATE merchant_subscriptions SET conversations_used=-1,voice_messages_used=-1 WHERE id=?',[subscriptionId]);
  expect(await hasReachedConversationLimit(a.merchantId)).toBe(true);expect(await hasReachedVoiceMessageLimit(a.merchantId)).toBe(true);
 });
 it('keeps another tenant capacity independent of an exhausted subscription',async()=>{
  await q('UPDATE merchant_subscriptions SET conversations_used=100,voice_messages_used=20 WHERE id=?',[subscriptionId]);
  expect(await hasReachedConversationLimit(a.merchantId)).toBe(true);expect(await hasReachedVoiceMessageLimit(a.merchantId)).toBe(true);
  expect(await hasReachedConversationLimit(b.merchantId)).toBe(false);expect(await hasReachedVoiceMessageLimit(b.merchantId)).toBe(false);
 });
});
