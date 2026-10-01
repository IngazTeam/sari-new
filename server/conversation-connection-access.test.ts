import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),diagnose:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./conversation-connection',()=>({readConversationConnection:m.read,diagnoseConversationConnection:m.diagnose}));
import {appRouter} from './routers';
import {conversationsRouter} from './routers-conversations';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'owner',memberId:3});});
describe.each(['app','module'])('conversation connection %s routes',which=>{
  const caller=(auth=true)=>{const ctx={user:auth?{id:7,role:'user'}:null,req:{headers:{'x-merchant-id':'20'}},res:{}} as any;return which==='app'?appRouter.createCaller(ctx).conversations:conversationsRouter.createCaller(ctx);};
  it.each(['owner','manager','sales_supervisor','viewer'])('reads %s with the saved scope and management capability',async role=>{
    m.access.mockResolvedValue({merchantId:20,role,memberId:3});await caller().connectionStatus();expect(m.read).toHaveBeenCalledWith(20,7,role==='owner'||role==='manager');
    if(role==='owner'||role==='manager'){await caller().diagnoseWebhook();expect(m.diagnose).toHaveBeenCalledWith(20,7);}else{await expect(caller().diagnoseWebhook()).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.diagnose).not.toHaveBeenCalled();}
  });
  it.each(['revoked','anonymous'])('denies %s before contacting a provider',async kind=>{m.access.mockResolvedValue(null);await expect(caller(kind!=='anonymous').connectionStatus()).rejects.toThrow();await expect(caller(kind!=='anonymous').diagnoseWebhook()).rejects.toThrow();expect(m.read).not.toHaveBeenCalled();expect(m.diagnose).not.toHaveBeenCalled();});
  it('rejects client-selected tenant or instance input',async()=>{await expect((caller().connectionStatus as any)({merchantId:99,instanceId:8})).rejects.toMatchObject({code:'BAD_REQUEST'});await expect((caller().diagnoseWebhook as any)({merchantId:99})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(m.read).not.toHaveBeenCalled();expect(m.diagnose).not.toHaveBeenCalled();});
});
