import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({template:vi.fn()}));
vi.mock('./db',()=>({getNotificationTemplateByStatus:m.template,getNotificationTemplatesByMerchantId:vi.fn()}));
vi.mock('./db/schema-readiness',()=>({assertRuntimeSchema:vi.fn()}));
import { defaultTemplates, ORDER_NOTIFICATION_STATUSES, prepareOrderStatusNotification } from './notifications/order-notifications';
beforeEach(()=>vi.resetAllMocks());
it('provides exactly the six order states without changing storage',()=>{expect(Object.keys(defaultTemplates)).toEqual([...ORDER_NOTIFICATION_STATUSES]);for(const text of Object.values(defaultTemplates))expect(text.trim().length).toBeGreaterThan(0);});
it.each([null,0,2,3,-1,true,'1'])('does not activate an invalid stored flag %s',async enabled=>{m.template.mockResolvedValue({enabled,template:'Hello'});await expect(prepareOrderStatusNotification(7,'+966500000000','paid',{customerName:'Test',storeName:'Test',orderNumber:'TEST',total:100,currency:'SAR'})).resolves.toBeNull();});
it('prepares explicitly enabled text without sending it',async()=>{m.template.mockResolvedValue({enabled:1,template:'Order {{orderNumber}}'});await expect(prepareOrderStatusNotification(7,'+966500000000','paid',{customerName:'Test',storeName:'Test',orderNumber:'TEST',total:100,currency:'SAR'})).resolves.toEqual({customerPhone:'+966500000000',message:'Order TEST'});});
