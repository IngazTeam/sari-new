import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({settings:vi.fn(),attach:vi.fn(),post:vi.fn()}));
vi.mock('./db',()=>({getTapSettings:m.settings,attachTapChargeToPaymentTransaction:m.attach}));
vi.mock('./payment/tap-client',()=>({postTapCharge:m.post,TapClientError:class extends Error{}}));
import {createPlatformSubscriptionTapCharge} from './payment/subscription-tap-checkout';
it('never opens a new provider request or stored checkout for a held capture',async()=>{
 const checkoutAttemptId='018f1f50-7b5a-7cc8-9b71-57e9f1180c12';
 await expect(createPlatformSubscriptionTapCharge({transaction:{merchantId:20,checkoutAttemptId,amount:'50.00',currency:'SAR',status:'requires_review'} as any,merchantId:20,checkoutAttemptId,amount:50,currency:'SAR',customerName:'Fixture',description:'Test'})).rejects.toMatchObject({failure:'attempt_already_finished'});
 expect(m.settings).not.toHaveBeenCalled();expect(m.post).not.toHaveBeenCalled();expect(m.attach).not.toHaveBeenCalled();
});
it('appends the review enum after historical ordinals without dropping records',()=>{
 const sql=readFileSync('drizzle/0205_subscription_capture_review.sql','utf8');expect(sql).toContain("ENUM('pending','completed','failed','refunded','requires_review')");expect(sql).not.toMatch(/DROP|DELETE|TRUNCATE/);
 const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')).entries;
 expect(journal.find((e:any)=>e.idx===205)).toMatchObject({tag:'0205_subscription_capture_review'});expect(journal.find((e:any)=>e.idx===205).when).toBeGreaterThan(journal.find((e:any)=>e.idx===204).when);
});
