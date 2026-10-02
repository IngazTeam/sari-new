import {beforeEach,expect,it,vi} from 'vitest';
import {wooOrderStatusRequest} from '../shared/woocommerce-order-action';
const m=vi.hoisted(()=>({request:vi.fn(),dns:vi.fn()}));
vi.mock('axios',()=>({default:{request:m.request}}));vi.mock('node:dns/promises',()=>({default:{lookup:m.dns}}));
import {WooCommerceClient} from './woocommerce';
const value={requestId:'da4b509f-22cb-4200-b8b8-e65ec09a2b9b',revision:'a'.repeat(64),orderId:1,orderRevision:'b'.repeat(64),status:'completed'};
beforeEach(()=>{vi.resetAllMocks();m.dns.mockResolvedValue([{address:'8.8.8.8',family:4}]);});
it('requires both reviewed identities and allows an explicit empty note to clear it',()=>{expect(wooOrderStatusRequest.parse({...value,note:''})).toMatchObject({note:''});for(const extra of [{merchantId:3},{actorId:4},{orderId:0},{orderRevision:'old'},{status:'shipped'},{note:'a'.repeat(1001)},{payloadDigest:'x'}])expect(wooOrderStatusRequest.safeParse({...value,...extra}).success).toBe(false);});
it('rejects a provider response about a different order',async()=>{const body={id:2,number:'2',status:'completed',currency:'SAR',billing:{},line_items:[]};m.request.mockResolvedValue({status:200,headers:{},data:Buffer.from(JSON.stringify(body))});const client=new WooCommerceClient({storeUrl:'https://shop.example.com',consumerKey:'ck_'+'a'.repeat(40),consumerSecret:'cs_'+'b'.repeat(40)});await expect(client.updateOrder(1,{status:'completed'})).rejects.toMatchObject({code:'response'});});
