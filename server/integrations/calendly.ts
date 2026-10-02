import {readCalendlyBookingLinks} from './calendly-booking-links';
import {calendlySyncCommand} from '../../shared/calendly-sync';
import {requestReviewedCalendlySync} from './calendly-sync';
import {calendlyConnectionCommand,calendlyConnectionPreviewInput} from '../../shared/calendly-connection';
import {previewCalendlyConnection,requestReviewedCalendlyConnection} from './calendly-connection';
import {calendlyWebhookOrigin} from './calendly-origin';
import {withCalendlyConnectionLock} from './calendly-lock';
import {calendlySettingsCommand} from '../../shared/calendly-settings';
import {calendlyOperationLookup} from '../../shared/calendly-operation';
import {saveReviewedCalendlySettings} from './calendly-settings';
import {readCalendlyOperation,readBlockingCalendlyOperation,acknowledgeCalendlyOperation,CalendlyOperationFault} from './calendly-operation';
import {calendlyResourceUri,calendlyBookingUrl} from '../../shared/calendly-provider';
import {calendlyAppointmentsInput,calendlyReceiptsInput} from '../../shared/calendly-workspace';
import {readCalendlyWorkspace,readCalendlyAppointments,readCalendlyReceipts} from './calendly-workspace';
import {withCalendlyDashboardAuthority,assertCalendlyDashboardAuthority,CalendlyAuthorityError} from './calendly-dashboard-authority';
import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure, router } from '../_core/trpc';
import {
  deleteIntegrationByType,
  getIntegrationByType,
  getDb,
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

const noInput=z.object({}).strict().optional();
const unavailable=()=>new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'calendly_dashboard:unavailable'});
const calendlyDashboardProcedure=permissionProcedure('integrations.manage').use(async({ctx,next})=>{
  try{if(!await getDb())throw unavailable();}catch{throw unavailable();}
  const result=await withCalendlyDashboardAuthority({actorId:ctx.user.id,merchantId:ctx.merchantId},next);if(!result.ok&&result.error.code==='INTERNAL_SERVER_ERROR')throw unavailable();return result;
});

async function reviewedOperation<T>(work:()=>Promise<T>){try{return await work();}catch(error){if(error instanceof CalendlyOperationFault)throw new TRPCError({code:error.reason==='forbidden'?'FORBIDDEN':error.reason==='missing'?'NOT_FOUND':error.reason==='rate_limited'?'TOO_MANY_REQUESTS':error.reason==='unavailable'?'INTERNAL_SERVER_ERROR':'CONFLICT',message:'calendly_operation:'+error.reason});throw unavailable();}}

export const calendlyRouter = router({
  getBookingLinksWorkspace:calendlyDashboardProcedure.input(noInput).query(({ctx})=>reviewedOperation(()=>readCalendlyBookingLinks(ctx.user.id,ctx.merchantId))),
  requestSync:calendlyDashboardProcedure.input(calendlySyncCommand).mutation(({ctx,input})=>reviewedOperation(()=>requestReviewedCalendlySync(ctx.user.id,ctx.merchantId,input))),
  previewConnection:calendlyDashboardProcedure.input(calendlyConnectionPreviewInput).mutation(({ctx,input})=>reviewedOperation(()=>previewCalendlyConnection(ctx.user.id,ctx.merchantId,input))),
  requestConnection:calendlyDashboardProcedure.input(calendlyConnectionCommand).mutation(({ctx,input})=>reviewedOperation(()=>requestReviewedCalendlyConnection(ctx.user.id,ctx.merchantId,input))),
  saveWorkspaceSettings:calendlyDashboardProcedure.input(calendlySettingsCommand).mutation(({ctx,input})=>reviewedOperation(()=>saveReviewedCalendlySettings(ctx.user.id,ctx.merchantId,input))),
  getOperation:calendlyDashboardProcedure.input(calendlyOperationLookup).query(({ctx,input})=>reviewedOperation(()=>readCalendlyOperation(ctx.user.id,ctx.merchantId,input))),
  getBlockingOperation:calendlyDashboardProcedure.input(noInput).query(({ctx})=>reviewedOperation(()=>readBlockingCalendlyOperation(ctx.user.id,ctx.merchantId))),
  acknowledgeOperation:calendlyDashboardProcedure.input(calendlyOperationLookup).mutation(({ctx,input})=>reviewedOperation(()=>acknowledgeCalendlyOperation(ctx.user.id,ctx.merchantId,input))),
  getWorkspace:calendlyDashboardProcedure.input(noInput).query(({ctx})=>readCalendlyWorkspace(ctx.user.id,ctx.merchantId)),
  getAppointmentsWorkspace:calendlyDashboardProcedure.input(calendlyAppointmentsInput).query(({ctx,input})=>readCalendlyAppointments(ctx.user.id,ctx.merchantId,input)),
  getReceiptsWorkspace:calendlyDashboardProcedure.input(calendlyReceiptsInput).query(({ctx,input})=>readCalendlyReceipts(ctx.user.id,ctx.merchantId,input)),
  getConnection: calendlyDashboardProcedure.input(noInput).query(async ({ ctx }) => {
    const merchantId = ctx.merchantId;
    const integration = await getIntegrationByType(merchantId, 'calendly');
    if (!integration) return { connected: false as const };
    const health = await getCalendlyWebhookHealth(merchantId);
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

  connect: calendlyDashboardProcedure
    .input(z.object({ apiKey: apiKeySchema }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchantId = ctx.merchantId;
      return withCalendlyConnectionLock(merchantId, async () => {
        const previous = await getIntegrationByType(merchantId, 'calendly');
        const endpointId = crypto.randomBytes(32).toString('base64url');
        const signingKey = crypto.randomBytes(48).toString('base64url');
        let subscriptionUri: string | null = null;
        let persistenceStarted=false;
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
          await assertCalendlyDashboardAuthority(merchantId);
          persistenceStarted=true;
          const integration = await replaceCalendlyIntegration({
            merchantId: merchantId,
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
          // A failed commit/read can still have installed this subscription. Never delete it blindly.
          if (subscriptionUri&&!persistenceStarted) {
            await deleteCalendlyWebhookSubscription(input.apiKey, subscriptionUri).catch(() => undefined);
          }
          if(error instanceof CalendlyAuthorityError)throw error;
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: safeCalendlyMessage(error, 'تعذر ربط Calendly أو تسجيل Webhook'),
          });
        }
      });
    }),

  disconnect: calendlyDashboardProcedure.input(noInput).mutation(async ({ ctx }) => {
    const merchantId = ctx.merchantId;
    return withCalendlyConnectionLock(merchantId, async () => {
      const integration = await getIntegrationByType(merchantId, 'calendly');
      if (integration?.accessToken && integration.webhookSubscriptionUri) {
        await deleteCalendlyWebhookSubscription(integration.accessToken, integration.webhookSubscriptionUri).catch(() => {
          console.warn('[Calendly] remote webhook cleanup failed during disconnect');
        });
      }
      await deleteIntegrationByType(merchantId, 'calendly');
      return { success: true, message: 'تم فصل حساب Calendly وإبطال نقطة الاستقبال المحلية' };
    });
  }),

  syncNow: calendlyDashboardProcedure.input(noInput).mutation(async ({ ctx }) => {
    const merchantId = ctx.merchantId;
    return withCalendlyConnectionLock(merchantId,async()=>{
    const integration = await getIntegrationByType(merchantId, 'calendly');
    if (!integration?.accessToken || !integration.isActive) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على تكامل Calendly نشط' });
    }
    try {
      const syncedEvents = await syncCalendlyAppointments(integration);
      await updateIntegrationLastSync(integration.id);
      return { success: true, message: `تمت مزامنة ${syncedEvents} مدعو بنجاح` };
    } catch (error) {
      if(error instanceof CalendlyAuthorityError)throw error;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: safeCalendlyMessage(error, 'فشلت مزامنة Calendly'),
      });
    }
    });
  }),

  updateSettings: calendlyDashboardProcedure
    .input(z.object({
      syncToWhatsApp: z.boolean(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const merchantId = ctx.merchantId;
      return withCalendlyConnectionLock(merchantId,async()=>{
      const integration = await getIntegrationByType(merchantId, 'calendly');
      if (!integration) throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على تكامل Calendly' });
      await updateIntegrationSettings(integration.id, input);
      return { success: true };
      });
    }),

  getUpcomingEvents: calendlyDashboardProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }).strict())
    .query(async ({ ctx, input }) => {
      const merchantId = ctx.merchantId;
      const integration = await getIntegrationByType(merchantId, 'calendly');
      if (!integration?.isActive || !integration.accessToken || !integration.storeUrl) return [];
      if(!calendlyResourceUri(integration.storeUrl,'user'))throw unavailable();
      try {
        const now = new Date().toISOString();
        const response = await calendlyApiRequest<{ collection?: any[] }>(
          `/scheduled_events?user=${encodeURIComponent(integration.storeUrl)}&status=active&min_start_time=${encodeURIComponent(now)}&count=${input.limit}`,
          integration.accessToken,
        );
        if (!Array.isArray(response?.collection)) throw unavailable();
        return response.collection.slice(0, input.limit).map(event => ({
          uri: typeof event.uri === 'string' ? event.uri : '',
          name: typeof event.name === 'string' ? event.name.slice(0, 255) : 'Calendly',
          startTime: event.start_time,
          endTime: event.end_time,
          status: event.status,
          inviteeName: '-',
        }));
      } catch {
        throw unavailable();
      }
    }),

  getEventTypes: calendlyDashboardProcedure.input(noInput).query(async ({ ctx }) => {
    const merchantId = ctx.merchantId;
    const integration = await getIntegrationByType(merchantId, 'calendly');
    if (!integration?.isActive || !integration.accessToken || !integration.storeUrl) return [];
    if(!calendlyResourceUri(integration.storeUrl,'user'))throw unavailable();
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
        schedulingUrl: calendlyBookingUrl(eventType.scheduling_url),
        active: eventType.active === true,
      }));
    } catch {
      throw unavailable();
    }
  }),

  getStats: calendlyDashboardProcedure.input(noInput).query(async ({ ctx }) => {
    const merchantId = ctx.merchantId;
    const integration = await getIntegrationByType(merchantId, 'calendly');
    if (!integration) return null;
    const stats = await getCalendlyAppointmentStats(merchantId);
    return {
      totalEvents: stats.total,
      upcomingEvents: stats.upcoming,
      remindersSent: stats.remindersSent,
    };
  }),
});
