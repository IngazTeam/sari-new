import {beforeEach,describe,expect,it,vi} from 'vitest';
import {catalogListInput,catalogRecordInput,catalogChoicesInput,catalogWorkspaceSchema,catalogEditorSchema} from '../shared/service-catalog-workspace';
const m=vi.hoisted(()=>({access:vi.fn(),list:vi.fn(),record:vi.fn(),editor:vi.fn(),choices:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./service-catalog-workspace',async original=>({...await original<typeof import('./service-catalog-workspace')>(),readCatalogWorkspace:m.list,readCatalogRecord:m.record,readCatalogEditor:m.editor,readCatalogChoices:m.choices}));
import {servicesRouter} from './routers-services';
import {CatalogRecordMissingError,CatalogWorkspaceUnavailableError} from './service-catalog-workspace';
const caller=(user:any={id:5,role:'user'})=>servicesRouter.createCaller({user,merchantId:99,merchantRole:'owner',req:{headers:{'x-merchant-id':'20'}},res:{}} as any);
const operations=[['catalogWorkspace',{entity:'service'},m.list],['catalogRecord',{entity:'service',id:10},m.record],['catalogEditor',{entity:'service'},m.editor],['catalogChoices',{kind:'staff'},m.choices]] as const;
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({merchantId:20,role:'viewer'});for(const [, ,mock] of operations)mock.mockResolvedValue({actorId:5,merchantId:20,canManage:false});});
describe('catalog source boundary',()=>{
 it.each(operations)('uses current member identity in %s',async(action,input,mock)=>{expect(await (caller()[action] as any)(input)).toMatchObject({merchantId:20,canManage:false});expect(mock.mock.calls[0].slice(0,2)).toEqual([5,20]);});
 it.each(operations)('denies unauthenticated %s',async(action,input,mock)=>{await expect((caller(null)[action] as any)(input)).rejects.toMatchObject({code:'UNAUTHORIZED'});expect(mock).not.toHaveBeenCalled();});
 it.each(operations)('denies non-member %s',async(action,input,mock)=>{m.access.mockResolvedValue(null);await expect((caller()[action] as any)(input)).rejects.toMatchObject({code:'FORBIDDEN'});expect(mock).not.toHaveBeenCalled();});
 it.each(operations)('rejects forged input scope in %s',async(action,input,mock)=>{await expect((caller()[action] as any)({...input,merchantId:99})).rejects.toMatchObject({code:'BAD_REQUEST'});expect(mock).not.toHaveBeenCalled();});
 it.each(operations)('sets managed authority for %s',async(action,input)=>{m.access.mockResolvedValue({merchantId:20,role:'manager'});expect(await (caller()[action] as any)(input)).toMatchObject({canManage:true});});
 it('separates missing records from unavailable storage',async()=>{m.record.mockRejectedValue(new CatalogRecordMissingError());await expect(caller().catalogRecord({entity:'service',id:1})).rejects.toMatchObject({code:'NOT_FOUND'});m.record.mockRejectedValue(new CatalogWorkspaceUnavailableError());await expect(caller().catalogRecord({entity:'service',id:1})).rejects.toMatchObject({code:'SERVICE_UNAVAILABLE'});});
 it.each([0,-1,1.5,1_000_001])('rejects invalid page %s',page=>{expect(catalogListInput.safeParse({entity:'service',page}).success).toBe(false);expect(catalogChoicesInput.safeParse({kind:'staff',page}).success).toBe(false);});
 it.each(['service; DROP TABLE services','staff',''])('rejects non-catalog entities %s',entity=>{expect(catalogListInput.safeParse({entity}).success).toBe(false);expect(catalogRecordInput.safeParse({entity,id:1}).success).toBe(false);});
 it('rejects incomplete or inconsistent list evidence',()=>{
  const base={actorId:5,merchantId:20,canManage:false,checkedAt:'2026-10-02T00:00:00.000Z',selection:{entity:'service',search:'',status:'all',page:1},summary:{total:0,active:0,inactive:0,unknown:0},pagination:{page:1,pageSize:24,total:0,pages:0},rows:[]};
  expect(catalogWorkspaceSchema.safeParse(base).success).toBe(true);
  for(const patch of [{summary:{total:2,active:1,inactive:0,unknown:0}},{pagination:{page:1,pageSize:24,total:1,pages:1}},{pagination:{page:2,pageSize:24,total:0,pages:0}},{rows:[{id:1}]}])expect(catalogWorkspaceSchema.safeParse({...base,...patch}).success).toBe(false);
 });
 it('rejects mismatched selected-record evidence',()=>{
  const value={actorId:5,merchantId:20,canManage:false,checkedAt:'2026-10-02T00:00:00.000Z',selection:{entity:'category',id:7},record:{entity:'category',id:7,definition:'a'.repeat(64),issues:[],unavailableReferences:0,fields:{name:'Category',nameEn:null,description:null,icon:null,color:null,displayOrder:0,isActive:true}}};
  expect(catalogEditorSchema.safeParse(value).success).toBe(true);expect(catalogEditorSchema.safeParse({...value,selection:{entity:'category',id:8}}).success).toBe(false);
 });
});
