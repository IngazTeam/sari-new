import { beforeEach, expect, it, vi } from 'vitest';
const api=vi.hoisted(()=>({owner:vi.fn(),list:vi.fn(),qr:vi.fn(),confirm:vi.fn()}));
vi.mock('./db',()=>({getMerchantByUserId:api.owner}));
vi.mock('./whatsapp/tenant-workspace',()=>({listWorkspaceRequests:api.list,workspaceQR:api.qr,confirmWorkspaceRequest:api.confirm}));
import { whatsappWorkspaceRouter } from './routers/whatsapp-workspace';
const context={user:{id:21,role:'user'}} as any;
beforeEach(()=>{vi.clearAllMocks();api.owner.mockResolvedValue({id:10});});
it('uses the selected owner context and an explicit source instead of accepting a merchant ID',async()=>{
  await whatsappWorkspaceRouter.createCaller(context).qr({requestId:8,source:'legacy'});expect(api.qr).toHaveBeenCalledWith(10,{requestId:8,source:'legacy'});
  await whatsappWorkspaceRouter.createCaller(context).requests();expect(api.list).toHaveBeenCalledWith(10);
});
it('blocks unauthenticated and non-owner callers before reading QR or history',async()=>{
  await expect(whatsappWorkspaceRouter.createCaller({user:null} as any).requests()).rejects.toMatchObject({code:'UNAUTHORIZED'});
  api.owner.mockResolvedValue(undefined);await expect(whatsappWorkspaceRouter.createCaller(context).confirm({requestId:8,source:'current'})).rejects.toMatchObject({code:'FORBIDDEN'});expect(api.confirm).not.toHaveBeenCalled();
});
it.each([{requestId:-1},{requestId:1.1},{requestId:8,source:'other'},{requestId:8,merchantId:99}])('rejects invalid or forged request %j',async input=>{
  await expect(whatsappWorkspaceRouter.createCaller(context).qr(input as any)).rejects.toMatchObject({code:'BAD_REQUEST'});expect(api.qr).not.toHaveBeenCalled();
});
