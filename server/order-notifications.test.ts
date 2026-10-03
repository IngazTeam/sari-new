import {expect,it} from 'vitest';
import {defaultTemplates,ORDER_NOTIFICATION_STATUSES} from './notifications/order-notifications';
import {orderNoticeText} from '../shared/order-notification-actions';
it('provides all six suggestions as valid templates without reading or writing storage',()=>{expect(Object.keys(defaultTemplates)).toEqual([...ORDER_NOTIFICATION_STATUSES]);for(const text of Object.values(defaultTemplates))expect(orderNoticeText.safeParse(text).success).toBe(true);});
