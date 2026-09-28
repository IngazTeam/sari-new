import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
import { closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { listWorkspaceRequests, reconnectWorkspaceInstance } from './whatsapp/tenant-workspace';
describe.skipIf(!process.env.DATABASE_URL)('WhatsApp workspace MySQL contracts',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
  beforeEach(async()=>{owner=await createDisposableMerchant('wa-workspace');other=await createDisposableMerchant('wa-other');});
  afterEach(async()=>{vi.unstubAllGlobals();await cleanupDisposableMerchants([owner?.userId,other?.userId].filter(Boolean));});afterAll(closeDb);
  it('merges actual legacy and current tables without crossing tenant boundaries or exposing secrets',async()=>{
    await db.createWhatsAppConnectionRequest({merchantId:owner.merchantId,countryCode:'+999',phoneNumber:'00000001',fullNumber:'+99900000001',status:'pending',apiToken:'test-only-old-secret'});
    await db.createWhatsAppRequest({merchantId:owner.merchantId,status:'approved',phoneNumber:'+99900000002',token:'test-only-current-secret',adminNotes:'internal-only',qrCodeUrl:'private-qr'});
    await db.createWhatsAppRequest({merchantId:other.merchantId,status:'pending',phoneNumber:'+99900000003'});
    const rows=await listWorkspaceRequests(owner.merchantId);expect(rows).toHaveLength(2);expect(rows.map(r=>r.source).sort()).toEqual(['current','legacy']);
    expect(JSON.stringify(rows)).not.toMatch(/secret|internal-only|private-qr|99900000003/);
  });
  it('failed provider logout retains both actual connection records; success pauses only the reviewed one',async()=>{
    const first=await db.createWhatsAppInstance({merchantId:owner.merchantId,provider:'green_api',instanceId:`7999${owner.merchantId}`,token:'test-only-token',apiUrl:'https://api.green-api.com',phoneNumber:`999${owner.merchantId}01`,status:'active',isPrimary:1});
    const second=await db.createWhatsAppInstance({merchantId:owner.merchantId,provider:'green_api',instanceId:`7998${owner.merchantId}`,token:'test-only-token',apiUrl:'https://api.green-api.com',phoneNumber:`999${owner.merchantId}02`,status:'active',isPrimary:0});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({isLogout:false})}));
    await expect(reconnectWorkspaceInstance(owner.merchantId,first!.id)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect((await db.getWhatsAppInstanceById(first!.id))?.status).toBe('active');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({isLogout:true})}));
    await reconnectWorkspaceInstance(owner.merchantId,first!.id);
    expect(await db.getWhatsAppInstanceById(first!.id)).toMatchObject({status:'inactive',phoneNumber:`999${owner.merchantId}01`,isPrimary:0});
    expect(await db.getWhatsAppInstanceById(second!.id)).toMatchObject({status:'active',isPrimary:1});
    expect(await db.getWhatsAppInstancesByMerchantId(owner.merchantId)).toHaveLength(2);
  });
});
