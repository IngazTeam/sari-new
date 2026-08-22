import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import {
  deleteIntegrationByType,
  getIntegrationByType,
  getMerchantByUserId,
  getPool,
  replaceCalendlyIntegration,
  updateIntegrationLastSync,
  updateIntegrationSettings,
} from '../db';
import {
  CalendlyApiError,
  calendlyApiRequest,
  createCalendlyWebhookSubscription,
  deleteCalendlyWebhookSubscription,
  getCalendlyCurrentUser,
  listCalendlyCollection,
} from './calendly-api';
import {
  getCalendlyAppointmentStats,
  getCalendlyWebhookHealth,
  syncCalendlyAppointments,
} from './calendly-webhook-receipts';

const apiKeySchema = z.string()
  .trim()
  .min(20)
  .max(4096)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Invalid token');

function integrationSettings(value: string | null): {
  syncToWhatsApp: boolean;
} {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return {
      syncToWhatsApp: parsed?.syncToWhatsApp === true,
    };
  } catch {
    return { syncToWhatsApp: false };
  }
}

function calendlyWebhookOrigin(): string {
  const configured = process.env.CALENDLY_WEBHOOK_BASE_URL
    || process.env.FRONTEND_URL
    || process.env.VITE_APP_URL
    || (process.env.NODE_ENV === 'production' ? 'https://sary.live' : '');
  if (!configured) throw new Error('CALENDLY_WEBHOOK_BASE_URL_REQUIRED');
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('CALENDLY_WEBHOOK_BASE_URL_INVALID');
  }
  const localDevelopment = process.env.NODE_ENV !== 'production'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((!localDevelopment && url.protocol !== 'https:') || url.username || url.password || url.hash) {
    throw new Error('CALENDLY_WEBHOOK_BASE_URL_INVALID');
  }
  return url.origin;
}

function safeCalendlyMessage(error: unknown, fallback: string): string {
  if (error instanceof CalendlyApiError && error.status === 403) {
    return 'يتطلب Calendly خطة تدعم Webhooks وصلاحيات webhooks:write وscheduled_events:read وinvitees:read';
  }
  if (error instanceof CalendlyApiError && error.status === 401) return 'رمز Calendly غير صالح أو منتهي';
  if (error instanceof Error && error.message.startsWith('CALENDLY_WEBHOOK_BASE_URL_')) {
    return 'عنوان Webhook الآمن غير مضبوط في الخادم';
  }
  return fallback;
}

async function requireMerchant(userId: number) {
  const merchant = await getMerchantByUserId(userId);
  if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
  return merchant;
}

async function withCalendlyConnectionLock<T>(merchantId: number, action: () => Promise<T>): Promise<T> {
  const pool = await getPool();
  if (!pool) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'قاعدة البيانات غير متاحة' });
  const connection = await pool.getConnection();
  const lockName = `sari:calendly:connection:${merchantId}`;
  let acquired = false;
  try {
    const [rows] = await connection.query<any[]>('SELECT GET_LOCK(?, 20) AS acquired', [lockName]);
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) throw new TRPCError({ code: 'CONFLICT', message: 'عملية ربط Calendly أخرى قيد التنفيذ' });
    return await action();
  } finally {
    if (acquired) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
    connection.release();
  }
}

export const calendlyRouter = router({
  getConnection: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await requireMerchant(ctx.user.id);
    const integration = await getIntegrationByType(merchant.id, 'calendly');
    if (!integration) return { connected: false as const };
    const health = await getCalendlyWebhookHealth(merchant.id);
    return {
      connected: Boolean(integration.isActive),
      userName: integration.storeName,
      userUri: integration.storeUrl,
      lastSync: integration.lastSyncAt,
      webhook: {
        registered: Boolean(integration.webhookEndpointId && integration.webhookSubscriptionUri),
        health,
      },
      settings: integrationSettings(integration.settings),
    };
  }),

  connect: protectedProcedure
    .input(z.object({ apiKey: apiKeySchema }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchant = await requireMerchant(ctx.user.id);
      return withCalendlyConnectionLock(merchant.id, async () => {
        const previous = await getIntegrationByType(merchant.id, 'calendly');
        const endpointId = crypto.randomBytes(32).toString('base64url');
        const signingKey = crypto.randomBytes(48).toString('base64url');
        let subscriptionUri: string | null = null;
        try {
          const user = await getCalendlyCurrentUser(input.apiKey);
          const callbackUrl = `${calendlyWebhookOrigin()}/api/webhooks/calendly/${endpointId}`;
          subscriptionUri = await createCalendlyWebhookSubscription({
            accessToken: input.apiKey,
            callbackUrl,
            signingKey,
            organizationUri: user.current_organization,
            userUri: user.uri,
          });
          const integration = await replaceCalendlyIntegration({
            merchantId: merchant.id,
            storeName: typeof user.name === 'string' ? user.name.slice(0, 255) : 'Calendly User',
            storeUrl: user.uri,
            accessToken: input.apiKey,
            webhookEndpointId: endpointId,
            webhookSigningSecret: signingKey,
            webhookSubscriptionUri: subscriptionUri,
            settings: JSON.stringify({
              syncToWhatsApp: false,
            }),
          });
          if (!integration) throw new Error('DATABASE_UNAVAILABLE');
          if (previous?.accessToken && previous.webhookSubscriptionUri && previous.webhookSubscriptionUri !== subscriptionUri) {
            await deleteCalendlyWebhookSubscription(previous.accessToken, previous.webhookSubscriptionUri).catch(() => {
              console.warn('[Calendly] previous webhook cleanup deferred');
            });
          }
          return { success: true, message: 'تم ربط Calendly وتسجيل Webhook آمن تلقائيًا' };
        } catch (error) {
          if (subscriptionUri) {
            await deleteCalendlyWebhookSubscription(input.apiKey, subscriptionUri).catch(() => undefined);
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: safeCalendlyMessage(error, 'تعذر ربط Calendly أو تسجيل Webhook'),
          });
        }
      });
    }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await requireMerchant(ctx.user.id);
    return withCalendlyConnectionLock(merchant.id, async () => {
      const integration = await getIntegrationByType(merchant.id, 'calendly');
      if (integration?.accessToken && integration.webhookSubscriptionUri) {
        await deleteCalendlyWebhookSubscription(integration.accessToken, integration.webhookSubscriptionUri).catch(() => {
          console.warn('[Calendly] remote webhook cleanup failed during disconnect');
        });
      }
      await deleteIntegrationByType(merchant.id, 'calendly');
      return { success: true, message: 'تم فصل حساب Calendly وإبطال نقطة الاستقبال المحلية' };
    });
  }),

  syncNow: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await requireMerchant(ctx.user.id);
    const integration = await getIntegrationByType(merchant.id, 'calendly');
    if (!integration?.accessToken || !integration.isActive) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على تكامل Calendly نشط' });
    }
    try {
      const syncedEvents = await syncCalendlyAppointments(integration);
      await updateIntegrationLastSync(integration.id);
      return { success: true, message: `تمت مزامنة ${syncedEvents} مدعو بنجاح` };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: safeCalendlyMessage(error, 'فشلت مزامنة Calendly'),
      });
    }
  }),

  updateSettings: protectedProcedure
    .input(z.object({
      syncToWhatsApp: z.boolean(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchant = await requireMerchant(ctx.user.id);
      const integration = await getIntegrationByType(merchant.id, 'calendly');
      if (!integration) throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على تكامل Calendly' });
      await updateIntegrationSettings(integration.id, input);
      return { success: true };
    }),

  getUpcomingEvents: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }).strict())
    .query(async ({ ctx, input }) => {
      const merchant = await requireMerchant(ctx.user.id);
      const integration = await getIntegrationByType(merchant.id, 'calendly');
      if (!integration?.accessToken || !integration.storeUrl) return [];
      try {
        const now = new Date().toISOString();
        const response = await calendlyApiRequest<{ collection?: any[] }>(
          `/scheduled_events?user=${encodeURIComponent(integration.storeUrl)}&status=active&min_start_time=${encodeURIComponent(now)}&count=${input.limit}`,
          integration.accessToken,
        );
        return Array.isArray(response.collection) ? response.collection.slice(0, input.limit).map(event => ({
          uri: typeof event.uri === 'string' ? event.uri : '',
          name: typeof event.name === 'string' ? event.name.slice(0, 255) : 'Calendly',
          startTime: event.start_time,
          endTime: event.end_time,
          status: event.status,
          inviteeName: '-',
        })) : [];
      } catch {
        return [];
      }
    }),

  getEventTypes: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await requireMerchant(ctx.user.id);
    const integration = await getIntegrationByType(merchant.id, 'calendly');
    if (!integration?.accessToken || !integration.storeUrl) return [];
    try {
      const eventTypes = await listCalendlyCollection<any>(
        integration.accessToken,
        `/event_types?user=${encodeURIComponent(integration.storeUrl)}&active=true&count=100`,
        100,
      );
      return eventTypes.map(eventType => ({
        uri: typeof eventType.uri === 'string' ? eventType.uri : '',
        name: typeof eventType.name === 'string' ? eventType.name.slice(0, 255) : 'Calendly',
        duration: Number.isFinite(Number(eventType.duration)) ? Number(eventType.duration) : 0,
        schedulingUrl: typeof eventType.scheduling_url === 'string' ? eventType.scheduling_url : '',
        active: eventType.active === true,
      }));
    } catch {
      return [];
    }
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await requireMerchant(ctx.user.id);
    const integration = await getIntegrationByType(merchant.id, 'calendly');
    if (!integration) return null;
    const stats = await getCalendlyAppointmentStats(merchant.id);
    return {
      totalEvents: stats.total,
      upcomingEvents: stats.upcoming,
      remindersSent: stats.remindersSent,
    };
  }),
});
