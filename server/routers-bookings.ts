/**
 * Bookings Router Module
 * Handles appointment booking management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const bookingsRouter = router({
    // Create a new booking
    create: protectedProcedure
        .input(z.object({
            serviceId: z.number(),
            customerPhone: z.string(),
            customerName: z.string().optional(),
            customerEmail: z.string().email().optional(),
            staffId: z.number().optional(),
            bookingDate: z.string(),
            startTime: z.string(),
            endTime: z.string(),
            durationMinutes: z.number(),
            basePrice: z.number(),
            discountAmount: z.number().optional(),
            finalPrice: z.number(),
            notes: z.string().optional(),
            bookingSource: z.enum(['whatsapp', 'website', 'phone', 'walk_in']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const hasConflict = await db.checkBookingConflict(
                input.serviceId,
                input.staffId || null,
                input.bookingDate,
                input.startTime,
                input.endTime
            );

            if (hasConflict) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: 'This time slot is already booked'
                });
            }

            const bookingId = await db.createBooking({
                merchantId: merchant.id,
                ...input,
            });

            return { success: true, bookingId };
        }),

    // Get booking by ID
    getById: protectedProcedure
        .input(z.object({ bookingId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const booking = await db.getBookingById(input.bookingId);
            if (!booking || booking.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
            }

            return { booking };
        }),

    // List bookings with filters
    list: protectedProcedure
        .input(z.object({
            status: z.string().optional(),
            serviceId: z.number().optional(),
            staffId: z.number().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            limit: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const bookings = await db.getBookingsByMerchant(merchant.id, input);
            return { bookings };
        }),

    // Get bookings by service
    getByService: protectedProcedure
        .input(z.object({
            serviceId: z.number(),
            status: z.string().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const bookings = await db.getBookingsByService(input.serviceId, input);
            return { bookings };
        }),

    // Get bookings by customer
    getByCustomer: protectedProcedure
        .input(z.object({ customerPhone: z.string() }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const bookings = await db.getBookingsByCustomer(merchant.id, input.customerPhone);
            return { bookings };
        }),

    // Update booking
    update: protectedProcedure
        .input(z.object({
            bookingId: z.number(),
            status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
            paymentStatus: z.enum(['unpaid', 'paid', 'refunded']).optional(),
            staffId: z.number().optional(),
            bookingDate: z.string().optional(),
            startTime: z.string().optional(),
            endTime: z.string().optional(),
            notes: z.string().optional(),
            cancellationReason: z.string().optional(),
            cancelledBy: z.enum(['customer', 'merchant', 'system']).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const booking = await db.getBookingById(input.bookingId);
            if (!booking || booking.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
            }

            if (input.bookingDate || input.startTime || input.endTime) {
                const bookingDateStr = input.bookingDate ||
                    (booking.bookingDate instanceof Date
                        ? booking.bookingDate.toISOString().split('T')[0]
                        : String(booking.bookingDate));
                const hasConflict = await db.checkBookingConflict(
                    booking.serviceId,
                    input.staffId || booking.staffId,
                    bookingDateStr,
                    input.startTime || String(booking.startTime),
                    input.endTime || String(booking.endTime),
                    booking.id
                );

                if (hasConflict) {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: 'This time slot is already booked'
                    });
                }
            }

            const { bookingId, ...updateData } = input;
            await db.updateBooking(bookingId, updateData);

            return { success: true };
        }),

    // Delete booking
    delete: protectedProcedure
        .input(z.object({ bookingId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const booking = await db.getBookingById(input.bookingId);
            if (!booking || booking.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
            }

            await db.deleteBooking(input.bookingId);
            return { success: true };
        }),

    // Get booking statistics
    getStats: protectedProcedure
        .input(z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            serviceId: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const stats = await db.getBookingStats(merchant.id, input);
            return { stats };
        }),

    // Check availability
    checkAvailability: protectedProcedure
        .input(z.object({
            serviceId: z.number(),
            staffId: z.number().optional(),
            bookingDate: z.string(),
            startTime: z.string(),
            endTime: z.string(),
        }))
        .query(async ({ input }) => {
            const hasConflict = await db.checkBookingConflict(
                input.serviceId,
                input.staffId || null,
                input.bookingDate,
                input.startTime,
                input.endTime
            );

            return { available: !hasConflict };
        }),

    // Get available time slots
    getAvailableSlots: protectedProcedure
        .input(z.object({
            serviceId: z.number(),
            date: z.string(),
            staffId: z.number().optional(),
        }))
        .query(async ({ input }) => {
            const slots = await db.getAvailableTimeSlots(
                input.serviceId,
                input.date,
                input.staffId
            );
            return { slots };
        }),
});

export type BookingsRouter = typeof bookingsRouter;
