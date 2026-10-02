import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),write:vi.fn(),all:vi.fn(),active:vi.fn(),one:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./staff-catalog-write',async original=>({...await original<typeof import('./staff-catalog-write')>(),writeStaffCatalog:m.write}));
vi.mock('./db',async original=>({...await original<typeof import('./db')>(),getStaffMembersByMerchant:m.all,getActiveStaffByMerchant:m.active,getStaffMemberById:m.one}));
import { appRouter } from './routers';
import { staffRouter } from './routers-staff';
const record={id:11,merchantId:20,name:'Provider',phone:null,email:null,role:null,workingHours:null,googleCalendarId:null,isActive:1};
const writes=[['create',{name:'Provider'}],['update',{staffId:11,name:'Updated'}],['delete',{staffId:11}]] as const;
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'owner'});m.all.mockResolvedValue([record]);m.active.mockResolvedValue([record]);m.one.mockResolvedValue(record);m.write.mockResolvedValue(11);});
for(const surface of ['mounted','standalone'])describe('staff '+surface,()=>{
  const caller=(user:any={id:7,role:'user'},headers:any={'x-merchant-id':'20'})=>{const ctx={user,merchantId:999,merchantRole:'owner',req:{headers},res:{}} as any;return surface==='mounted'?appRouter.createCaller(ctx).staff:staffRouter.createCaller(ctx);};
  it.each(['owner','manager','sales_supervisor'])('uses resolved %s authority for all writes',async role=>{
    m.access.mockResolvedValue({merchantId:20,role});for(const [name,input]of writes)await (caller() as any)[name](input);
    expect(m.write.mock.calls).toEqual([[20,{name:'Provider'}],[20,{name:'Updated'},11,undefined],[20,{isActive:false},11,undefined]]);expect(m.access).toHaveBeenCalledWith(7,20);
  });
  it.each(writes)('denies viewer, revoked and anonymous %s',async(name,input)=>{
    for(const role of ['viewer',null]){m.access.mockResolvedValue(role?{merchantId:20,role}:null);await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'FORBIDDEN'});}
    await expect((caller(null) as any)[name](input)).rejects.toMatchObject({code:'UNAUTHORIZED'});expect(m.write).not.toHaveBeenCalled();
  });
  it.each(writes)('rejects scope injection in %s',async(name,input)=>{await expect((caller() as any)[name]({...input,merchantId:999})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.write).not.toHaveBeenCalled();});
  it('permits viewer reads with explicit identity, strips foreign rows and preserves active filtering',async()=>{
    m.access.mockResolvedValue({merchantId:20,role:'viewer'});m.all.mockResolvedValue([record,{...record,id:12,merchantId:99}]);
    const list=await caller().list({});expect(list).toMatchObject({merchantId:20,actorUserId:7,canManage:false});expect(list.staff).toHaveLength(1);expect(list.staff[0].definition).toMatch(/^[a-f0-9]{64}$/);
    await caller().list({activeOnly:true});expect(m.active).toHaveBeenCalledWith(20);await caller().getById({staffId:11});expect(m.one).toHaveBeenCalledWith(11,20);
  });
  it('rejects foreign or missing staff',async()=>{for(const row of [undefined,{...record,merchantId:99}]){m.one.mockResolvedValue(row);await expect(caller().getById({staffId:11})).rejects.toMatchObject({code:'NOT_FOUND'});}});
  it('preserves optional fields and forwards the reviewed definition',async()=>{
    await caller().update({staffId:11,isActive:true,expectedDefinition:'a'.repeat(64)});expect(m.write).toHaveBeenCalledWith(20,{isActive:true},11,'a'.repeat(64));
    await caller().delete({staffId:11,expectedDefinition:'b'.repeat(64)});expect(m.write).toHaveBeenCalledWith(20,{isActive:false},11,'b'.repeat(64));
  });
  it('permits explicit field clearing and validates same-day weekly hours',async()=>{
    const input={name:' Provider ',phone:'',email:null,role:null,googleCalendarId:'',workingHours:{sunday:{start:'09:00',end:'17:00'}}};
    await caller().create(input);expect(m.write).toHaveBeenCalledWith(20,{...input,name:'Provider'});
  });
  it.each([
    ['create',{name:' '}],['create',{name:'x'.repeat(256)}],['create',{name:'p',role:'x'.repeat(101)}],['create',{name:'p',phone:'bad'}],
    ['create',{name:'p',email:'bad'}],['create',{name:'p',workingHours:{sunday:{start:'24:00',end:'25:00'}}}],
    ['create',{name:'p',workingHours:{sunday:{start:'17:00',end:'09:00'}}}],['create',{name:'p',workingHours:{anyday:{start:'09:00',end:'17:00'}}}],
    ['create',{name:'p',googleCalendarId:'x'.repeat(256)}],['create',{name:'p',isActive:1}],['update',{staffId:0,name:'p'}],['update',{staffId:1.5,name:'p'}],
    ['update',{staffId:11}],['update',{staffId:11,expectedDefinition:'a'.repeat(64)}],['update',{staffId:11,isActive:false,expectedDefinition:'bad'}],['delete',{staffId:2147483648}],
  ])('rejects malformed %s %j',async(name,input)=>{await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.write).not.toHaveBeenCalled();});
  it('redacts failed reads rather than claiming an empty list',async()=>{
    for(const [name,input,fn] of [['list',{},m.all],['list',{activeOnly:true},m.active],['getById',{staffId:11},m.one]] as const){fn.mockRejectedValue(Error('SQL private details'));await expect((caller() as any)[name](input)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'Staff data unavailable'});}
  });
  it('fails closed on membership lookup and malformed selection',async()=>{
    m.access.mockRejectedValue(Error('private'));await expect(caller().list({})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'});
    await expect(caller(undefined,{'x-merchant-id':'20x'}).list({})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.all).not.toHaveBeenCalled();
  });
});
