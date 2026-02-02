/**
 * Calendar Router Module
 * Handles Google Calendar integration
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const calendarRouter = router({
    // Get authorization URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const { getTokensFromCode } = await import('./_core/googleCalendar');
            const tokens = await getTokensFromCode(input.code);

            const existing = await db.getGoogleIntegration(merchant.id, 'calendar');

            if (existing) {
                await db.updateGoogleIntegration(existing.id, {
                    credentials: JSON.stringify(tokens),
                    calendarId: input.calendarId || existing.calendarId,
                    isActive: 1,
                });
            } else {
                await db.createGoogleIntegration({
                    merchantId: merchant.id,
                    integrationType: 'calendar',
                    credentials: JSON.stringify(tokens),
                    calendarId: input.calendarId || 'primary',
                    isActive: 1,
                });
            }

            return { success: true };
        }),

    // Get available time slots
    getAvailableSlots: protectedProcedure
        .input(z.object({
            serviceId: z.number(),
            date: z.string(),
            staffId: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const service = await db.getServiceById(input.serviceId);
            if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

            const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
            if (!integration || !integration.isActive) {
                throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google Calendar not connected' });
            }

            const credentials = JSON.parse(integration.credentials || '{}');
            const { getAvailableSlots, validateAndRefreshCredentials } = await import('./_core/googleCalendar');

            const validCredentials = await validateAndRefreshCredentials(credentials);

            if (JSON.stringify(validCredentials) !== JSON.stringify(credentials)) {
                await db.updateGoogleIntegration(integration.id, {
                    credentials: JSON.stringify(validCredentials),
                });
            }

            let workingHours = { start: '09:00', end: '17:00' };

            if (input.staffId) {
                const staff = await db.getStaffMemberById(input.staffId);
                if (staff && staff.workingHours) {
                    const staffHours = JSON.parse(staff.workingHours);
                    const dayName = new Date(input.date).toLocaleDateString('en-US', { weekday: 'lowercase' });
                    if (staffHours[dayName]) {
                        workingHours = staffHours[dayName];
                    }
                }
            } else if (merchant.workingHours) {
                const merchantHours = JSON.parse(merchant.workingHours);
                const dayName = new Date(input.date).toLocaleDateString('en-US', { weekday: 'lowercase' });
                if (merchantHours[dayName]) {
                    workingHours = merchantHours[dayName];
                }
            }

            const slots = await getAvailableSlots(
                validCredentials,
                integration.calendarId || 'primary',
                new Date(input.date),
                service.durationMinutes,
                workingHours,
                service.bufferTimeMinutes
            );

            return { slots };
        }),

    // Book appointment
    bookAppointment: protectedProcedure
        .input(z.object({
            serviceId: z.number(),
            customerPhone: z.string(),
            customerName: z.string(),
            appointmentDate: z.string(),
            startTime: z.string(),
            staffId: z.number().optional(),
            notes: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const service = await db.getServiceById(input.serviceId);
            if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

            const [startHour, startMinute] = input.startTime.split(':').map(Number);
            const endDate = new Date(input.appointmentDate);
            endDate.setHours(startHour, startMinute + service.durationMinutes, 0, 0);
            const endTime = endDate.toTimeString().substring(0, 5);

            const hasConflict = await db.checkAppointmentConflict(
                merchant.id,
                input.appointmentDate,
                input.startTime,
                endTime,
                input.staffId
            );

            if (hasConflict) {
                throw new TRPCError({ code: 'CONFLICT', message: 'This time slot is already booked' });
            }

            const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
            let googleEventId: string | undefined;

            if (integration && integration.isActive) {
                const credentials = JSON.parse(integration.credentials || '{}');
                const { createCalendarEvent, validateAndRefreshCredentials } = await import('./_core/googleCalendar');

                const validCredentials = await validateAndRefreshCredentials(credentials);

                const startDateTime = new Date(`${input.appointmentDate}T${input.startTime}:00`);
                const endDateTime = new Date(startDateTime.getTime() + service.durationMinutes * 60000);

                try {
                    const event = await createCalendarEvent(
                        validCredentials,
                        integration.calendarId || 'primary',
                        {
                            summary: `${service.name} - ${input.customerName}`,
                            description: `Customer: ${input.customerName}\nPhone: ${input.customerPhone}\nService: ${service.name}${input.notes ? `\nNotes: ${input.notes}` : ''}`,
                            start: startDateTime,
                            end: endDateTime,
                        }
                    );

                    googleEventId = event.id;
                } catch (error) {
                    console.error('Failed to create calendar event:', error);
                }
            }

            const appointmentId = await db.createAppointment({
                merchantId: merchant.id,
                customerPhone: input.customerPhone,
                customerName: input.customerName,
                serviceId: input.serviceId,
                staffId: input.staffId,
                appointmentDate: input.appointmentDate,
                startTime: input.startTime,
                endTime: endTime,
                status: 'confirmed',
                googleEventId: googleEventId,
                notes: input.notes,
            });

            return { success: true, appointmentId };
        }),

    // Cancel appointment
    cancelAppointment: protectedProcedure
        .input(z.object({
            appointmentId: z.number(),
            reason: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const appointment = await db.getAppointmentById(input.appointmentId);
            if (!appointment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment not found' });

            if (appointment.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
            }

            if (appointment.googleEventId) {
                const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
                if (integration && integration.isActive) {
                    const credentials = JSON.parse(integration.credentials || '{}');
                    const { deleteCalendarEvent, validateAndRefreshCredentials } = await import('./_core/googleCalendar');

                    try {
                        const validCredentials = await validateAndRefreshCredentials(credentials);
                        await deleteCalendarEvent(
                            validCredentials,
                            integration.calendarId || 'primary',
                            appointment.googleEventId
                        );
                    } catch (error) {
                        console.error('Failed to delete calendar event:', error);
                    }
                }
            }

            await db.cancelAppointment(input.appointmentId, input.reason);

            return { success: true };
        }),

    // List appointments
    listAppointments: protectedProcedure
        .input(z.object({
            status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const appointments = await db.getAppointmentsByMerchant(merchant.id, input.status);

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
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            return await db.getAppointmentStats(merchant.id, input.startDate, input.endDate);
        }),

    // Disconnect Google Calendar
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
        if (integration) {
            await db.deleteGoogleIntegration(integration.id);
        }

        return { success: true };
    }),

    // Get integration status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const integration = await db.getGoogleIntegration(merchant.id, 'calendar');

        return {
            connected: !!integration && integration.isActive === 1,
            calendarId: integration?.calendarId,
            lastSync: integration?.lastSync,
        };
    }),
});

export type CalendarRouter = typeof calendarRouter;
