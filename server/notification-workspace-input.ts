import { z } from 'zod';

export const positiveId = z.number().int().positive();
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const email = z.union([z.literal(''), z.string().email().max(320)]);
const phone = z.union([z.literal(''), z.string().regex(/^\+?[0-9]{7,15}$/)]);
export const reportFields = z.object({
  name: z.string().trim().min(1).max(200),
  reportType: z.enum(['daily', 'weekly', 'monthly', 'custom']),
  scheduleDay: z.number().int().min(0).max(31),
  scheduleTime: timeOfDay,
  deliveryMethod: z.enum(['email', 'whatsapp', 'both']),
  recipientEmail: email, recipientPhone: phone,
  includeConversations: z.boolean(), includeOrders: z.boolean(),
  includeRevenue: z.boolean(), includeProducts: z.boolean(),
  includeCustomers: z.boolean(), includeAppointments: z.boolean(),
});
export const reportConfiguration = reportFields.extend({
  scheduleDay: reportFields.shape.scheduleDay.default(0), scheduleTime: timeOfDay.default('09:00'),
  deliveryMethod: reportFields.shape.deliveryMethod.default('email'),
  recipientEmail: email.default(''), recipientPhone: phone.default(''),
  includeConversations: z.boolean().default(true), includeOrders: z.boolean().default(true),
  includeRevenue: z.boolean().default(true), includeProducts: z.boolean().default(true),
  includeCustomers: z.boolean().default(true), includeAppointments: z.boolean().default(true),
}).superRefine((data, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({code: 'custom', path: [path], message});
  if (data.reportType === 'weekly' && data.scheduleDay > 6) issue('scheduleDay', 'اختر يومًا صحيحًا من الأسبوع');
  if (data.reportType === 'monthly' && (data.scheduleDay < 1 || data.scheduleDay > 28)) issue('scheduleDay', 'اختر يومًا من 1 إلى 28');
  if (data.deliveryMethod !== 'whatsapp' && !data.recipientEmail) issue('recipientEmail', 'أدخل البريد المستلم');
  if (data.deliveryMethod !== 'email' && !data.recipientPhone) issue('recipientPhone', 'أدخل رقم المستلم');
});
export const reportUpdate = reportFields.partial().extend({id: positiveId, isActive: z.boolean().optional()});
export const autoNotificationFields = z.object({
  triggerType: z.enum(['order_created', 'order_confirmed', 'order_shipped', 'order_delivered', 'order_cancelled', 'appointment_created', 'appointment_reminder', 'appointment_cancelled', 'appointment_rescheduled']),
  messageTemplate: z.string().trim().min(1).max(4000),
  isActive: z.boolean().optional(), delayMinutes: z.number().int().min(0).max(1440).optional(),
});

export function storedReportConfiguration(report: Record<string, any>) {
  return {
    name: report.name, reportType: report.report_type, scheduleDay: report.schedule_day,
    scheduleTime: report.schedule_time, deliveryMethod: report.delivery_method,
    recipientEmail: report.recipient_email || '', recipientPhone: report.recipient_phone || '',
    includeConversations: Boolean(report.include_conversations), includeOrders: Boolean(report.include_orders),
    includeRevenue: Boolean(report.include_revenue), includeProducts: Boolean(report.include_products),
    includeCustomers: Boolean(report.include_customers), includeAppointments: Boolean(report.include_appointments),
  };
}
