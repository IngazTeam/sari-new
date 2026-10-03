import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getPool } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants, assertDisposableDatabase } from './tests/helpers/disposable-merchant';
import { readOrderNoticeWorkspace, readOrderNoticeDetail } from './order-notification-workspace';
describe.skipIf(!process.env.DATABASE_URL)('order notification complete evidence source', () => {
  let a: Awaited<ReturnType<typeof createDisposableMerchant>>, b: typeof a;
  const q = async (sql:string,args:any[]=[]) => { assertDisposableDatabase(); return (await (await getPool())!.execute<any>(sql,args))[0]; };
  const read = (input:object={},actor=a.userId,merchant=a.merchantId) => readOrderNoticeWorkspace(actor,merchant,input);
  const create = async (message='Synthetic message',merchant=a.merchantId) => {
    const order = Number((await q("INSERT INTO orders (merchantId,customerName,customerPhone,orderNumber,items,totalAmount) VALUES (?,'Synthetic','+966500000000','TEST-ORDER','[]',100)",[merchant])).insertId);
    const event = randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
    const id = Number((await q("INSERT INTO order_notifications (merchant_id,order_id,event_key,customer_phone,status,message,created_at,updated_at,available_at) VALUES (?,?,?,'+966500000000','paid',?,'2026-10-01 10:00:00','2026-10-01 10:00:00','2026-10-01 10:00:00')",[merchant,order,event,message])).insertId);
    return { id,order,event,message,merchant };
  };
  const receipt = async (f: Awaited<ReturnType<typeof create>>, status='sent', provider='green_api', merchant=f.merchant) => {
    const instance = Number((await q("INSERT INTO whatsapp_instances (merchant_id,provider,instance_id,token,status) VALUES (?,?,?,'synthetic-unusable','inactive')",[merchant,provider,randomUUID()])).insertId);
    const id = Number((await q(`INSERT INTO whatsapp_message_deliveries (merchant_id,instance_id,provider,idempotency_key,direction,status,request_json,provider_message_id,created_at,status_updated_at)
      VALUES (?,?,?,?,'outgoing',?,?,?,'2026-10-01 10:00:01','2026-10-01 10:00:02')`,[merchant,instance,provider,`order-status:${f.merchant}:${f.event}`,status,JSON.stringify({ to:'+966500000000',kind:'text',text:f.message }),randomUUID()])).insertId);
    return { id,instance };
  };
  beforeEach(async () => { a=await createDisposableMerchant('notice-source'); b=await createDisposableMerchant('notice-foreign'); });
  afterEach(() => cleanupDisposableMerchants([a.userId,b.userId])); afterAll(closeDb);
  it('covers all 106 rows with stable pages and global statistics unaffected by filters', async () => {
    const first=await create('oldest_%_target'); for(let i=0;i<105;i++)await create('Message '+i); await create('FOREIGN',b.merchantId);
    const pages=[]; for(let page=1;page<=5;page++)pages.push(await read({page}));
    expect(pages[0]).toMatchObject({matched:106,pages:5,stats:{total:106,linked:106,evidence:{unverified:106}}}); expect(new Set(pages.flatMap(p=>p.rows.map(r=>r.id))).size).toBe(106);
    expect(pages[4].rows).toHaveLength(6); expect((await read({page:999})).currentPage).toBe(5);
    const one=await read({query:'%'});expect(one.rows.map(r=>r.id)).toEqual([first.id]);expect(one.stats.total).toBe(106); expect((await read({sort:'oldest'})).rows[0].id).toBe(first.id);
  });
  it('preserves six suggested templates plus unsupported and invalid stored templates', async () => {
    await q("INSERT INTO notification_templates (merchant_id,status,template,enabled,updated_at) VALUES (?,'paid','',3,NULL),(?,'confirmed','Legacy {{customerName}}',1,'2026-10-01 10:00:00')",[a.merchantId,a.merchantId]);
    const w=await read();expect(w.templates).toHaveLength(7);expect(w.templates.find(t=>t.status==='paid')).toMatchObject({stored:true,template:'',enabled:null,issues:['template','enabled','updatedAt']});
    expect(w.templates.find(t=>t.status==='confirmed')).toMatchObject({canonicalStatus:null,template:'Legacy {{customerName}}',issues:['status']});
    expect(w.templates.find(t=>t.status==='pending')).toMatchObject({stored:false,enabled:false});
  });
  it('redacts conflicting parent references from details and search while counting the issue', async () => {
    const local=await create('CROSS_PRIVATE'),foreign=await create('FOREIGN',b.merchantId);await receipt(local,'read');await q('UPDATE order_notifications SET order_id=? WHERE id=?',[foreign.order,local.id]);
    const w=await read();expect(w).toMatchObject({stats:{total:1,linked:0,unlinked:1,evidence:{unverified:1}}});expect(w.rows[0]).toMatchObject({integrity:'unlinked',message:null,customerPhone:null,order:null,evidence:'unverified'});
    expect(JSON.stringify(w)).not.toContain('CROSS_PRIVATE');expect((await read({query:'CROSS_PRIVATE'})).matched).toBe(0);expect((await read({integrity:'unlinked'})).matched).toBe(1);
    expect((await readOrderNoticeDetail(a.userId,a.merchantId,{id:local.id})).row.message).toBeNull();await expect(readOrderNoticeDetail(a.userId,a.merchantId,{id:foreign.id})).rejects.toMatchObject({reason:'missing'});
  });
  it('separates provider acceptance, delivery, read, failed and simulated receipts from worker state', async () => {
    const absent=await create();await q("UPDATE order_notifications SET delivery_status='sent',sent=1 WHERE id=?",[absent.id]);
    for(const status of ['sent','delivered','read','failed'])await receipt(await create('Evidence '+status),status);
    await receipt(await create('Simulation'),'read','mock');const w=await read();expect(w.stats.evidence).toEqual({unverified:1,accepted:1,delivered:1,read:1,failed:1,simulated:1});
    expect(w.rows.find(r=>r.id===absent.id)).toMatchObject({state:'sent',evidence:'unverified',issues:['missing_receipt']});
    for(const evidence of ['accepted','delivered','read','failed','simulated']){const f=await read({evidence});expect(f.matched).toBe(1);expect(f.stats.total).toBe(6);expect((await readOrderNoticeDetail(a.userId,a.merchantId,{id:f.rows[0].id})).row.evidence).toBe(evidence);}
  });
  it.each(['recipient','text','case','kind','empty_id','incoming','foreign_instance','foreign_receipt','missing_instance','media','template','future','older','queued','uppercase_event'])('rejects %s receipt evidence',async change=>{
    const f=await create('CaseSensitive message');const r=await receipt(f,'delivered','green_api',change==='foreign_receipt'?b.merchantId:a.merchantId);
    const requests:any={recipient:{to:'+966599999999'},text:{text:'Other message'},case:{text:'casesensitive message'},kind:{kind:'image'},media:{mediaUrl:'https://example.test/private.png'},template:{template:{name:'other'}}};
    if(requests[change])await q('UPDATE whatsapp_message_deliveries SET request_json=? WHERE id=?',[JSON.stringify({to:'+966500000000',kind:'text',text:f.message,...requests[change]}),r.id]);
    if(change==='empty_id')await q("UPDATE whatsapp_message_deliveries SET provider_message_id=' ' WHERE id=?",[r.id]);
    if(change==='incoming')await q("UPDATE whatsapp_message_deliveries SET direction='incoming' WHERE id=?",[r.id]);
    if(change==='foreign_instance')await q('UPDATE whatsapp_instances SET merchant_id=? WHERE id=?',[b.merchantId,r.instance]);
    if(change==='missing_instance')await q('UPDATE whatsapp_message_deliveries SET instance_id=NULL WHERE id=?',[r.id]);
    if(change==='future')await q('UPDATE whatsapp_message_deliveries SET status_updated_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',[r.id]);
    if(change==='older')await q("UPDATE whatsapp_message_deliveries SET created_at='2026-09-30 10:00:00' WHERE id=?",[r.id]);
    if(change==='queued')await q("UPDATE whatsapp_message_deliveries SET status='queued' WHERE id=?",[r.id]);
    if(change==='uppercase_event')await q('UPDATE order_notifications SET event_key=UPPER(event_key) WHERE id=?',[f.id]);
    const w=await read();expect(w.rows[0]).toMatchObject({evidence:'unverified',provider:null,providerMessageId:null});expect(w.stats.evidence.delivered).toBe(0);expect((await read({evidence:'delivered'})).matched).toBe(0);
  });
  it('keeps full message content and nullable timestamps without guessing',async()=>{
    const f=await create('<b>literal</b> '.repeat(1500));await q('UPDATE order_notifications SET event_key=NULL,attempts=-2,created_at=NULL WHERE id=?',[f.id]);
    const r=(await readOrderNoticeDetail(a.userId,a.merchantId,{id:f.id})).row;expect(r.message).toBe(f.message);expect(r).toMatchObject({attempts:null,hasEvent:false,createdAt:null,issues:expect.arrayContaining(['event','attempts','timestamp'])});
  });
  it('rechecks team role, actor, owner and merchant status within the read transaction',async()=>{
    await expect(read({},a.userId,b.merchantId)).rejects.toMatchObject({reason:'forbidden'});
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[b.merchantId,a.userId]);expect((await read({},a.userId,b.merchantId)).canManage).toBe(false);
    await q("UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?",[b.merchantId,a.userId]);expect((await read({},a.userId,b.merchantId)).canManage).toBe(true);
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[b.userId]);await expect(read({},a.userId,b.merchantId)).rejects.toMatchObject({reason:'forbidden'});
    await q("UPDATE users SET account_status='active' WHERE id=?",[b.userId]);await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[b.merchantId,a.userId]);await expect(read({},a.userId,b.merchantId)).rejects.toMatchObject({reason:'forbidden'});
    await q("UPDATE merchants SET status='pending' WHERE id=?",[a.merchantId]);expect((await read()).canManage).toBe(false);await q("UPDATE merchants SET status='suspended' WHERE id=?",[a.merchantId]);await expect(read()).rejects.toMatchObject({reason:'forbidden'});
  });
  it('preserves an empty state and clamps page selection without a fake successful count',async()=>{
    expect(await read({page:80})).toMatchObject({matched:0,pages:0,currentPage:1,rows:[],stats:{total:0}});
  });
});
