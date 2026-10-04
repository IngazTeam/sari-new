import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const notificationPreferenceConfiguration = z
  .object({
    newOrdersEnabled: z.boolean(),
    newMessagesEnabled: z.boolean(),
    appointmentsEnabled: z.boolean(),
    orderStatusEnabled: z.boolean(),
    missedMessagesEnabled: z.boolean(),
    whatsappDisconnectEnabled: z.boolean(),
    preferredMethod: z.enum(["push", "email", "both"]),
    quietHoursEnabled: z.boolean(),
    quietHoursStart: time,
    quietHoursEnd: time,
  })
  .strict();
export const defaultNotificationPreferences = {
  newOrdersEnabled: true,
  newMessagesEnabled: true,
  appointmentsEnabled: true,
  orderStatusEnabled: true,
  missedMessagesEnabled: true,
  whatsappDisconnectEnabled: true,
  preferredMethod: "both",
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
} as const;
export const notificationPreferenceStoredFields =
  notificationPreferenceConfiguration
    .extend({
      instantNotifications: z.boolean(),
      batchNotifications: z.boolean(),
      batchInterval: z.number().int().min(5).max(120),
    })
    .strict();
const shape = notificationPreferenceStoredFields.shape;
export const notificationPreferenceKeys =
  notificationPreferenceStoredFields.keyof();
const nullableFields = z
  .object({
    newOrdersEnabled: shape.newOrdersEnabled.nullable(),
    newMessagesEnabled: shape.newMessagesEnabled.nullable(),
    appointmentsEnabled: shape.appointmentsEnabled.nullable(),
    orderStatusEnabled: shape.orderStatusEnabled.nullable(),
    missedMessagesEnabled: shape.missedMessagesEnabled.nullable(),
    whatsappDisconnectEnabled: shape.whatsappDisconnectEnabled.nullable(),
    preferredMethod: shape.preferredMethod.nullable(),
    quietHoursEnabled: shape.quietHoursEnabled.nullable(),
    quietHoursStart: shape.quietHoursStart.nullable(),
    quietHoursEnd: shape.quietHoursEnd.nullable(),
    instantNotifications: shape.instantNotifications.nullable(),
    batchNotifications: shape.batchNotifications.nullable(),
    batchInterval: shape.batchInterval.nullable(),
  })
  .strict();
export const notificationPreferenceWorkspace = z
  .object({
    actorId: z.number().int().positive(),
    merchantId: z.number().int().positive(),
    canManage: z.boolean(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["default", "saved", "invalid", "duplicate"]),
    storedRecords: z.number().int().nonnegative(),
    values: nullableFields.nullable(),
    invalidFields: z.array(notificationPreferenceKeys),
    quietHoursTimeZone: z.string().min(1).max(100),
    quietHoursBehavior: z.literal("suppressed_not_queued"),
    quietHoursBypass: z.literal("whatsapp_disconnect"),
    batchingAvailable: z.literal(false),
    instantToggleApplied: z.literal(false),
  })
  .strict()
  .superRefine((d, ctx) => {
    const invalid = () =>
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent notification preference evidence",
      });
    if (d.status === "duplicate") {
      if (d.storedRecords < 2 || d.values !== null || d.invalidFields.length)
        invalid();
      return;
    }
    if (!d.values || d.storedRecords !== (d.status === "default" ? 0 : 1)) {
      invalid();
      return;
    }
    const missing = notificationPreferenceKeys.options.filter(
      k => d.values![k] === null
    );
    if (
      JSON.stringify([...d.invalidFields].sort()) !==
        JSON.stringify(missing.sort()) ||
      (d.status === "invalid") !== missing.length > 0
    )
      invalid();
  });
export type NotificationPreferenceWorkspace = z.infer<
  typeof notificationPreferenceWorkspace
>;
export type NotificationPreferenceConfiguration = z.infer<
  typeof notificationPreferenceConfiguration
>;
