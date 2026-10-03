import { z } from 'zod';
import { orderNoticeStatus, orderNoticeTemplate } from './order-notification-workspace';
import { orderNotificationVariables } from './order-notification-template';
const revision = z.string().regex(/^[a-f0-9]{64}$/), id = z.number().int().positive().max(2147483647);
export const orderNoticeText = z.string().trim().min(1).max(3500).refine(text => !text.includes('\0'), 'Invalid template')
  .refine(text => {
    const remaining = text.replace(/\{\{([a-zA-Z]+)\}\}/g, (token, name) => (orderNotificationVariables as readonly string[]).includes(name) ? '' : token);
    return !remaining.includes('{{') && !remaining.includes('}}');
  }, 'Unsupported template variable');
export const saveOrderNoticeTemplateInput = z.object({ status: orderNoticeStatus, revision, template: orderNoticeText, enabled: z.boolean() }).strict();
export const acknowledgeOrderNoticesInput = z.object({
  records: z.array(z.object({ id, revision }).strict()).min(1).max(25).refine(rows => new Set(rows.map(r => r.id)).size === rows.length, 'Duplicate selection'),
}).strict();
export const saveOrderNoticeTemplateResult = z.object({ actorId:id, merchantId:id, template:orderNoticeTemplate, effect:z.enum(['saved','already_current']), sendsMessage:z.literal(false) }).strict();
export const acknowledgeOrderNoticesResult = z.object({ actorId:id, merchantId:id, acknowledgedIds:z.array(id).min(1).max(25), sendsMessage:z.literal(false) }).strict();
