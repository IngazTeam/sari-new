import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { getZidSettings, isZidConnected } from '../db_zid';
import { zidCheckoutProvider } from './zid-checkout-agreements';
import { checkoutTransaction } from './checkout-agreements';
import { encryptSecret } from '../security/secrets';
import { checkExistingIntegrations } from '../integrations/platform-checker';

describe.skipIf(!process.env.DATABASE_URL)('Zid canonical authority SQL',()=>{
  let fixture:Awaited<ReturnType<typeof createDisposableMerchant>>;
  const query=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  beforeEach(async()=>{
    fixture=await createDisposableMerchant('zid-provider');
    await query(`INSERT INTO zid_settings (merchant_id,store_id,is_active,access_token,manager_token)
      VALUES (?,'11',1,'legacy-manager','legacy-authorization')`,[fixture.merchantId]);
  });
  afterEach(async()=>cleanupDisposableMerchants([fixture.userId]));
  afterAll(closeDb);
  async function canonical() {
    return query(`INSERT INTO platform_integrations (merchant_id,platform_type,is_active,access_token,settings)
      VALUES (?,'zid',1,'canonical-authorization',?)`,[fixture.merchantId,JSON.stringify({storeId:'12',managerToken:'canonical-manager'})]);
  }
  it('does not revive active legacy credentials when canonical Zid is disabled',async()=>{
    await query(`INSERT INTO platform_integrations (merchant_id,platform_type,is_active,access_token,settings)
      VALUES (?,'zid',0,'canonical-authorization',?)`,[fixture.merchantId,JSON.stringify({storeId:'12',managerToken:'canonical-manager'})]);
    expect(await getZidSettings(fixture.merchantId)).toBeUndefined();
    expect(await isZidConnected(fixture.merchantId)).toBe(false);
    expect((await checkExistingIntegrations(fixture.merchantId)).filter(p=>p.platform==='zid')).toHaveLength(0);
  });
  it.each(['legacy','canonical'])('keeps the valid %s connection usable with the actual adapter',async kind=>{
    if(kind==='canonical')await canonical();
    const provider=await zidCheckoutProvider(fixture.merchantId);
    expect(provider.storeId).toBe(kind==='canonical'?'12':'11');
    await expect(checkoutTransaction(provider.assertCurrent)).resolves.toBeUndefined();
  });
  it.each(['inactive','deleted','replaced','store','manager','authorization','malformed','array','merchant'])
    ('rejects a canonical %s change after credentials were loaded',async mode=>{
      await canonical();const provider=await zidCheckoutProvider(fixture.merchantId);
      if(mode==='inactive')await query("UPDATE platform_integrations SET is_active=0 WHERE merchant_id=?",[fixture.merchantId]);
      if(mode==='deleted'||mode==='replaced')await query("DELETE FROM platform_integrations WHERE merchant_id=?",[fixture.merchantId]);
      if(mode==='replaced')await canonical();
      if(mode==='store')await query("UPDATE platform_integrations SET settings=JSON_SET(settings,'$.storeId','13') WHERE merchant_id=?",[fixture.merchantId]);
      if(mode==='manager')await query("UPDATE platform_integrations SET settings=JSON_SET(settings,'$.managerToken','changed-manager') WHERE merchant_id=?",[fixture.merchantId]);
      if(mode==='authorization')await query("UPDATE platform_integrations SET access_token='changed-authorization' WHERE merchant_id=?",[fixture.merchantId]);
      if(mode==='malformed'||mode==='array')await query('UPDATE platform_integrations SET settings=? WHERE merchant_id=?',[mode==='array'?'[]':'{broken',fixture.merchantId]);
      if(mode==='merchant')await query("UPDATE merchants SET status='suspended' WHERE id=?",[fixture.merchantId]);
      await expect(checkoutTransaction(provider.assertCurrent)).rejects.toThrow('Zid connection changed');
    });
  it('permits harmless metadata updates and re-encryption of the same canonical credentials',async()=>{
    const prior=process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY='synthetic-zid-authority-encryption-key-32';
    try {
      await canonical();const provider=await zidCheckoutProvider(fixture.merchantId);
      await query('UPDATE platform_integrations SET access_token=?,settings=? WHERE merchant_id=?',[
        encryptSecret('canonical-authorization'),JSON.stringify({syncProducts:false,storeId:'12',managerToken:encryptSecret('canonical-manager')}),fixture.merchantId]);
      await expect(checkoutTransaction(provider.assertCurrent)).resolves.toBeUndefined();
    } finally {if(prior===undefined)delete process.env.FIELD_ENCRYPTION_KEY;else process.env.FIELD_ENCRYPTION_KEY=prior;}
  });
  it.each(['legacy-disable','canonical-insert','canonical-disable'])('holds %s until the authority transaction completes',async mode=>{
    if(mode==='canonical-disable')await canonical();const provider=await zidCheckoutProvider(fixture.merchantId);
    let entered!:()=>void,resume!:()=>void;const held=new Promise<void>(r=>{entered=r;}),continueTransaction=new Promise<void>(r=>{resume=r;});
    const transaction=checkoutTransaction(async c=>{await provider.assertCurrent(c);entered();await continueTransaction;});
    const editor=await (await getPool())!.getConnection();
    try {
      await held;await editor.query('SET SESSION innodb_lock_wait_timeout=1');
      const update=mode==='legacy-disable'
        ? editor.execute('UPDATE zid_settings SET is_active=0 WHERE merchant_id=?',[fixture.merchantId])
        : mode==='canonical-disable'
          ? editor.execute('UPDATE platform_integrations SET is_active=0 WHERE merchant_id=?',[fixture.merchantId])
          : editor.execute("INSERT INTO platform_integrations (merchant_id,platform_type,is_active) VALUES (?,'zid',0)",[fixture.merchantId]);
      await expect(update).rejects.toMatchObject({code:'ER_LOCK_WAIT_TIMEOUT'});
    } finally {await editor.query('SET SESSION innodb_lock_wait_timeout=DEFAULT');editor.release();resume();}
    await transaction;
    if(mode==='canonical-insert')await canonical();
    else await query(`UPDATE ${mode==='legacy-disable'?'zid_settings':'platform_integrations'} SET is_active=0 WHERE merchant_id=?`,[fixture.merchantId]);
    await expect(checkoutTransaction(provider.assertCurrent)).rejects.toThrow('Zid connection changed');
  });
});
