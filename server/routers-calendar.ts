import { calendarAppointmentProcedures } from './routers-calendar-appointments';
/**
 * Calendar Router Module
 * Handles Google Calendar integration
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createGoogleIntegration,
  deleteGoogleIntegration,
  getAppointmentStats,
  getAppointmentsByMerchant,
  getGoogleIntegration,
  getMerchantByUserId,
  updateGoogleIntegration,
} from './db';

export const calendarRouter = router({
    // Get authorization URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const { getAuthUrl } = await import('./_core/googleCalendar');
        const authUrl = getAuthUrl(merchant.id.toString());

        return { authUrl };
    }),

    // Handle OAuth callback
    handleCallback: protectedProcedure
        .input(z.object({
            code: z.string(),
            calendarId: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const { getTokensFromCode } = await import('./_core/googleCalendar');
            const tokens = await getTokensFromCode(input.code);

            const existing = await getGoogleIntegration(merchant.id, 'calendar');

            if (existing) {
                await updateGoogleIntegration(existing.id, {
                    credentials: JSON.stringify(tokens),
                    calendarId: input.calendarId || existing.calendarId,
                    isActive: 1,
                });
            } else {
                await createGoogleIntegration({
                    merchantId: merchant.id,
                    integrationType: 'calendar',
                    credentials: JSON.stringify(tokens),
                    calendarId: input.calendarId || 'primary',
                    isActive: 1,
                });
            }

            return { success: true };
        }),

    ...calendarAppointmentProcedures,

    // List appointments
    listAppointments: protectedProcedure
        .input(z.object({
            status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const appointments = await getAppointmentsByMerchant(merchant.id, input.status);

            let filtered = appointments;
            if (input.startDate) {
                filtered = filtered.filter(a => a.appointmentDate >= input.startDate!);
            }
            if (input.endDate) {
                filtered = filtered.filter(a => a.appointmentDate <= input.endDate!);
            }

            return { appointments: filtered };
        }),

    // Get appointment statistics
    getStats: protectedProcedure
        .input(z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            return await getAppointmentStats(merchant.id, input.startDate, input.endDate);
        }),

    // Disconnect Google Calendar
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const integration = await getGoogleIntegration(merchant.id, 'calendar');
        if (integration) {
            await deleteGoogleIntegration(integration.id);
        }

        return { success: true };
    }),

    // Get integration status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const integration = await getGoogleIntegration(merchant.id, 'calendar');

        return {
            connected: !!integration && integration.isActive === 1,
            calendarId: integration?.calendarId,
            lastSync: integration?.lastSync,
        };
    }),
});

export type CalendarRouter = typeof calendarRouter;
