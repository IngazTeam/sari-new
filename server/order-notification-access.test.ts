import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),workspace:vi.fn(),detail:vi.fn(),save:vi.fn(),ack:vi.fn()}));
vi.mock('./order-notification-workspace',()=>({readOrderNoticeWorkspace:m.workspace,readOrderNoticeDetail:m.detail,OrderNoticeError:class extends Error{constructor(readonly reason:string){super('order_notice:'+reason);}}}));
vi.mock('./order-notification-actions',()=>({saveReviewedOrderNoticeTemplate:m.save,acknowledgeReviewedOrderNotices:m.ack}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
import {orderNotificationsRouter} from './routers-order-notifications';
import {OrderNoticeError} from './order-notification-workspace';
const caller=(user:any={id:7,role:'user'},selected='20')=>orderNotificationsRouter.createCaller({user,req:{headers:{'x-merchant-id':selected}},res:{},merchantId:999} as any);
const legacy=(api:ReturnType<typeof caller>)=>[()=>api.getTemplates(),()=>api.getHealth(),()=>api.getHistory({}),()=>api.getByOrderId({orderId:4})];
const oldWrite={status:'paid' as const,template:'Order {{orderNumber}}',enabled:true};
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'owner',memberId:3});});
it.each(['owner','manager','viewer','sales_supervisor'])('requires %s old read clients to reload without accessing data',async role=>{
 m.access.mockResolvedValue({merchantId:20,role,memberId:3});for(const read of legacy(caller()))await expect(read()).rejects.toMatchObject({code:'PRECONDITION_FAILED',message:'order_notice:reload'});
 expect(m.workspace).not.toHaveBeenCalled();expect(m.detail).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();expect(m.ack).not.toHaveBeenCalled();
});
it('routes current reads and writes through selected-tenant authority and actor identity',async()=>{
 const api=caller();await api.workspace({query:'literal_%'});await api.detail({id:8});await api.saveTemplate({status:'paid',template:'Order',enabled:false,revision:'a'.repeat(64)});await api.acknowledgeReviewed({records:[{id:8,revision:'b'.repeat(64)}]});
 expect(m.access).toHaveBeenCalledWith(7,20);expect(m.workspace).toHaveBeenCalledWith(7,20,expect.objectContaining({query:'literal_%',page:1}));expect(m.detail).toHaveBeenCalledWith(7,20,{id:8});expect(m.save).toHaveBeenCalledWith(7,20,expect.objectContaining({status:'paid'}));expect(m.ack).toHaveBeenCalledWith(7,20,expect.objectContaining({records:[{id:8,revision:'b'.repeat(64)}]}));
});
it.each(['viewer','sales_supervisor'])('allows current %s reads and denies both writes',async role=>{
 m.access.mockResolvedValue({merchantId:20,role,memberId:3});const api=caller();await api.workspace({});await api.detail({id:8});
 await expect(api.saveTemplate({} as any)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(api.acknowledgeReviewed({} as any)).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.save).not.toHaveBeenCalled();expect(m.ack).not.toHaveBeenCalled();
});
it('keeps retired writes closed for an authorized manager',async()=>{m.access.mockResolvedValue({merchantId:20,role:'manager',memberId:3});await expect(caller().updateTemplate(oldWrite)).rejects.toMatchObject({code:'PRECONDITION_FAILED'});await expect(caller().acknowledgeIncidents()).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect(m.save).not.toHaveBeenCalled();expect(m.ack).not.toHaveBeenCalled();});
it('rejects unauthenticated or revoked reads before revealing data or retirement status',async()=>{for(const read of legacy(caller(null)))await expect(read()).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(caller(null).workspace({})).rejects.toMatchObject({code:'UNAUTHORIZED'});m.access.mockResolvedValue(null);for(const read of legacy(caller()))await expect(read()).rejects.toMatchObject({code:'FORBIDDEN'});await expect(caller().workspace({})).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.workspace).not.toHaveBeenCalled();});
it.each([{merchantId:30},{template:' '},{template:'a\0b'},{template:'a'.repeat(3501)},{enabled:1},{status:'confirmed'}])('validates retired write boundaries %j',patch=>expect(caller().updateTemplate({...oldWrite,...patch} as any)).rejects.toMatchObject({code:'BAD_REQUEST'}));
it.each([{limit:101},{limit:0},{merchantId:30}])('rejects invalid legacy history selection %j',input=>expect(caller().getHistory(input as any)).rejects.toMatchObject({code:'BAD_REQUEST'}));
it('does not turn storage or authority failures into successful empty results',async()=>{m.workspace.mockRejectedValue(Error('private database failure'));await expect(caller().workspace({})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'order_notice:unavailable'});m.access.mockRejectedValue(Error('private membership failure'));await expect(caller().getTemplates()).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'});});
it('rejects forged current tenant inputs',async()=>{await expect(caller().workspace({merchantId:999} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.workspace).not.toHaveBeenCalled();});
it.each([['forbidden','FORBIDDEN'],['missing','NOT_FOUND'],['unavailable','INTERNAL_SERVER_ERROR']])('maps %s without leaking source data',async(reason,code)=>{m.detail.mockRejectedValue(new OrderNoticeError(reason as any));await expect(caller().detail({id:8})).rejects.toMatchObject({code,message:'order_notice:unavailable'});});
