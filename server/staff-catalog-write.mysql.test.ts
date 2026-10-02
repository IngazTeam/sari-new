import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { staffRouter } from './routers-staff';
import { writeStaffCatalog } from './staff-catalog-write';
describe.skipIf(!process.env.DATABASE_URL)('staff catalog on disposable MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,staffId:number;
  const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const caller=()=>staffRouter.createCaller({user:{id:owner.userId,role:'user'},req:{headers:{'x-merchant-id':String(owner.merchantId)}},res:{}} as any);
  beforeEach(async()=>{owner=await createDisposableMerchant('staff-write');other=await createDisposableMerchant('staff-other');staffId=(await caller().create({name:'Own provider',email:'staff@example.test',phone:'966500987654',role:'Stylist',workingHours:{sunday:{start:'09:00',end:'17:00'}},googleCalendarId:'local-only'})).staffId;});
  afterEach(async()=>{await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
  it('returns the real created record and preserves omitted fields on edits',async()=>{
    const before=(await caller().getById({staffId})).staff;expect(before.name).toBe('Own provider');expect(before.merchantId).toBe(owner.merchantId);
    await caller().update({staffId,name:'Updated',expectedDefinition:before.definition});
    const after=(await caller().getById({staffId})).staff;expect(after).toMatchObject({name:'Updated',email:'staff@example.test',phone:'966500987654',role:'Stylist',googleCalendarId:'local-only',isActive:1});expect(after.workingHours).toBe(before.workingHours);expect(after.definition).not.toBe(before.definition);
  });
  it('refuses stale edits and stale archive without overwriting a saved version',async()=>{
    const {definition}=(await caller().getById({staffId})).staff;await caller().update({staffId,name:'New version',expectedDefinition:definition});
    await expect(caller().update({staffId,name:'Overwrite',expectedDefinition:definition})).rejects.toMatchObject({code:'CONFLICT'});
    await expect(caller().delete({staffId,expectedDefinition:definition})).rejects.toMatchObject({code:'CONFLICT'});expect((await caller().getById({staffId})).staff).toMatchObject({name:'New version',isActive:1});
  });
  it('serializes concurrent edits of the same reviewed definition',async()=>{
    const {definition}=(await caller().getById({staffId})).staff;
    const results=await Promise.allSettled(['First','Second'].map(name=>caller().update({staffId,name,expectedDefinition:definition})));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  });
  it('keeps historical booking and service references on archive and can reactivate',async()=>{
    const serviceId=Number((await q("INSERT INTO services (merchant_id,name,duration_minutes,staff_ids) VALUES (?,'Local service',60,?)",[owner.merchantId,JSON.stringify([staffId])])).insertId);
    const bookingId=Number((await q("INSERT INTO bookings (merchant_id,service_id,staff_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price) VALUES (?,?,?,'966500987654','2026-12-20','10:00','11:00',60,1000,1000)",[owner.merchantId,serviceId,staffId])).insertId);
    await caller().delete({staffId});expect((await caller().list({activeOnly:true})).staff).toHaveLength(0);expect((await caller().list({})).staff).toHaveLength(1);
    expect((await q('SELECT staff_id FROM bookings WHERE id=?',[bookingId]))[0].staff_id).toBe(staffId);expect((await q('SELECT staff_ids FROM services WHERE id=?',[serviceId]))[0].staff_ids).toBe(JSON.stringify([staffId]));
    await caller().update({staffId,isActive:true});expect((await caller().list({activeOnly:true})).staff).toHaveLength(1);
  });
  it('denies foreign writes inside storage with merchant predicate',async()=>{
    await expect(writeStaffCatalog(other.merchantId,{name:'Foreign edit'},staffId)).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(writeStaffCatalog(other.merchantId,{isActive:false},staffId)).rejects.toMatchObject({code:'NOT_FOUND'});
    expect((await caller().getById({staffId})).staff).toMatchObject({name:'Own provider',isActive:1});
  });
  it('clears optional values deliberately and preserves zero false updates',async()=>{
    await caller().update({staffId,phone:'',email:'',role:null,workingHours:null,googleCalendarId:'',isActive:false});
    expect((await caller().getById({staffId})).staff).toMatchObject({phone:null,email:null,role:null,workingHours:null,googleCalendarId:null,isActive:0});
  });
  it('allows archiving corrupt legacy settings without silently rewriting them',async()=>{
    await q("UPDATE staff_members SET working_hours='legacy-bad-json' WHERE id=?",[staffId]);await caller().delete({staffId});
    expect((await caller().getById({staffId})).staff).toMatchObject({workingHours:'legacy-bad-json',isActive:0});
  });
});
