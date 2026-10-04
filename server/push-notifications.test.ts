import {describe,it,expect} from 'vitest';
import {pushSubscriptionInput,pushTestInput,pushUnsubscribeInput} from '../shared/push-workspace';
const subscription={endpoint:'https://fcm.googleapis.com/push/synthetic',p256dh:'A'.repeat(87),auth:'A'.repeat(22),reviewed:true};
describe('Browser push input boundaries, without production keys or a fixed merchant',()=>{
 it('requires explicit registration review',()=>expect(pushSubscriptionInput.safeParse({...subscription,reviewed:false}).success).toBe(false));
 it.each(['endpoint','p256dh','auth'] as const)('rejects missing %s',field=>expect(pushSubscriptionInput.safeParse({...subscription,[field]:''}).success).toBe(false));
 it('bounds user agent and endpoint before database access',()=>{
  expect(pushSubscriptionInput.safeParse({...subscription,userAgent:'x'.repeat(501)}).success).toBe(false);
  expect(pushSubscriptionInput.safeParse({...subscription,endpoint:'x'.repeat(4097)}).success).toBe(false);
 });
 it.each([{},undefined,{reviewed:true},{deviceHash:'a'.repeat(64),requestId:'bad',reviewed:true,language:'en'}])('rejects a test without exact device review and request ID',raw=>expect(pushTestInput.safeParse(raw).success).toBe(false));
 it('does not accept a user supplied tenant or actor override',()=>{
  expect(pushSubscriptionInput.safeParse({...subscription,merchantId:123}).success).toBe(false);
  expect(pushUnsubscribeInput.safeParse({deviceHash:'a'.repeat(64),reviewed:true,actorId:123}).success).toBe(false);
 });
 it('accepts a reviewed exact device and one request ID',()=>{
  expect(pushTestInput.safeParse({deviceHash:'a'.repeat(64),reviewed:true,language:'ar',requestId:'11234567-1234-4234-8234-123456789abc'}).success).toBe(true);
 });
});
