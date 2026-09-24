import { bookingCreationProcedure } from './routers-booking-creation';
import { bookingOperationProcedures } from './routers-booking-operations';
/**
 * Bookings Router Module
 * Handles appointment booking management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  checkBookingConflict,
  createBooking,
  deleteBooking,
  getAvailableTimeSlots,
  getBookingById,
  getBookingStats,
  getBookingsByCustomer,
  getBookingsByMerchant,
  getBookingsByService,
  getMerchantByUserId,
  getServiceById,
  updateBooking,
} from './db';

export const bookingsRouter = router({
    create: bookingCreationProcedure,

    // Get booking by ID
    getById: protectedProcedure
        .input(z.object({ bookingId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const booking = await getBookingById(input.bookingId);
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
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const bookings = await getBookingsByMerchant(merchant.id, input);
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
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // FIX #5: Verify service belongs to this merchant
            const service = await getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const bookings = await getBookingsByService(input.serviceId, input);
            return { bookings };
        }),

    // Get bookings by customer
    getByCustomer: protectedProcedure
        .input(z.object({ customerPhone: z.string() }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const bookings = await getBookingsByCustomer(merchant.id, input.customerPhone);
            return { bookings };
        }),

    ...bookingOperationProcedures,

    // Get booking statistics
    getStats: protectedProcedure
        .input(z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            serviceId: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const stats = await getBookingStats(merchant.id, input);
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
        .query(async ({ ctx, input }) => {
            // FIX #13: Verify service ownership
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const service = await getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const hasConflict = await checkBookingConflict(
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
        .query(async ({ ctx, input }) => {
            // SECURITY: Verify service belongs to this merchant
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const service = await getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const slots = await getAvailableTimeSlots(
                input.serviceId,
                input.date,
                input.staffId
            );
            return { slots };
        }),
});

export type BookingsRouter = typeof bookingsRouter;
