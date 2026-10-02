import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
import {withCalendlyDashboardAuthority,assertCalendlyDashboardAuthority,calendlyDashboardScope} from './integrations/calendly-dashboard-authority';
import {calendlyApiRequest} from './integrations/calendly-api';
const scope={actorId:7,merchantId:20},token='synthetic-only-token-long';
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'owner'});});
afterEach(()=>vi.unstubAllGlobals());
it('keeps concurrent request identities isolated and leaves no actor in worker work',async()=>{
 m.access.mockImplementation(async(actorId,merchantId)=>({merchantId,role:actorId===7?'manager':'viewer'}));
 const results=await Promise.allSettled([withCalendlyDashboardAuthority(scope,async()=>{await Promise.resolve();expect(calendlyDashboardScope()).toEqual(scope);await assertCalendlyDashboardAuthority(20);}),withCalendlyDashboardAuthority({actorId:8,merchantId:21},()=>assertCalendlyDashboardAuthority(21))]);
 expect(results[0].status).toBe('fulfilled');expect(results[1]).toMatchObject({status:'rejected',reason:{code:'FORBIDDEN'}});expect(calendlyDashboardScope()).toBeUndefined();await expect(assertCalendlyDashboardAuthority()).resolves.toBeUndefined();
});
it.each([null,{merchantId:21,role:'owner'},{merchantId:20,role:'viewer'}])('rejects revoked, foreign and downgraded access before network',async membership=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);m.access.mockResolvedValue(membership);await expect(withCalendlyDashboardAuthority(scope,()=>calendlyApiRequest('/users/me',token))).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
});
it('rechecks authority after the provider responds, before reading its body',async()=>{
 const body=vi.fn();const fetcher=vi.fn(async()=>{m.access.mockResolvedValue(null);return {status:200,text:body};});vi.stubGlobal('fetch',fetcher);
 await expect(withCalendlyDashboardAuthority(scope,()=>calendlyApiRequest('/users/me',token))).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledOnce();expect(body).not.toHaveBeenCalled();
});
it('does not expose a provider body after access is revoked during the read',async()=>{
 const fetcher=vi.fn(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"resource":{"name":"PRIVATE"}}'));},pull(controller){m.access.mockResolvedValue(null);controller.close();}}),{status:200}));vi.stubGlobal('fetch',fetcher);
 await expect(withCalendlyDashboardAuthority(scope,()=>calendlyApiRequest('/users/me',token))).rejects.toMatchObject({code:'FORBIDDEN',message:'calendly_dashboard:forbidden'});
});
it('allows an authorized bounded request with pinned origin and no redirect',async()=>{
 const fetcher=vi.fn(async()=>new Response('{"resource":{"name":"Local"}}',{status:200}));vi.stubGlobal('fetch',fetcher);
 expect(await withCalendlyDashboardAuthority(scope,()=>calendlyApiRequest('/users/me',token))).toEqual({resource:{name:'Local'}});expect(fetcher).toHaveBeenCalledWith(new URL('https://api.calendly.com/users/me'),expect.objectContaining({redirect:'error',method:'GET'}));expect(m.access).toHaveBeenCalledTimes(3);
});
it('rejects a mismatched merchant before resolving membership',async()=>{await expect(withCalendlyDashboardAuthority(scope,()=>assertCalendlyDashboardAuthority(21))).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.access).not.toHaveBeenCalled();});

