import { beforeEach,afterEach,afterAll,describe,it,expect } from 'vitest';
import { getPool,closeDb } from './db/connection';
import { getMerchantNotificationEmail } from './_core/notificationService';
import { createDisposableMerchant,cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
describe.skipIf(!process.env.DATABASE_URL)('merchant notification verified email ownership on MySQL',()=>{
  const q=async(sql:string,args:any[]=[])=>(await(await getPool())!.execute(sql,args))[0];let merchant:number,user:number,users:number[];
  beforeEach(async()=>{const m=await createDisposableMerchant('notice-email');merchant=m.merchantId;user=m.userId;users=[user];await q("UPDATE users SET email='synthetic@example.test',email_verified_at=UTC_TIMESTAMP() WHERE id=?",[user]);});
  afterEach(async()=>cleanupDisposableMerchants(users));afterAll(closeDb);
  it('uses the active merchant owner rather than an absent merchant email column',async()=>{expect(await getMerchantNotificationEmail(merchant)).toEqual({userId:user,email:'synthetic@example.test'});});
  it.each(['unverified','deleted','suspended','invalid'])('does not return %s recipients',async mode=>{
    if(mode==='unverified')await q('UPDATE users SET email_verified_at=NULL WHERE id=?',[user]);
    if(mode==='deleted')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);
    if(mode==='suspended')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
    if(mode==='invalid')await q("UPDATE users SET email='invalid' WHERE id=?",[user]);
    expect(await getMerchantNotificationEmail(merchant)).toBeNull();
  });
  it('does not substitute another merchant owner and resolves an actual ownership transfer',async()=>{
    const other=await createDisposableMerchant('notice-other');users.push(other.userId);expect(await getMerchantNotificationEmail(other.merchantId)).toBeNull();
    await q('UPDATE merchants SET userId=? WHERE id=?',[other.userId,merchant]);expect(await getMerchantNotificationEmail(merchant)).toBeNull();
    await q("UPDATE users SET email='new-owner@example.test',email_verified_at=UTC_TIMESTAMP() WHERE id=?",[other.userId]);expect(await getMerchantNotificationEmail(merchant)).toEqual({userId:other.userId,email:'new-owner@example.test'});
  });
});
