/**
 * Services Router Module
 * Handles service management for booking-based businesses
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const servicesRouter = router({
    // Create service
    create: protectedProcedure
        .input(z.object({
            name: z.string(),
            description: z.string().optional(),
            category: z.string().optional(),
            categoryId: z.number().optional(),
            priceType: z.enum(['fixed', 'variable', 'custom']),
            basePrice: z.number().optional(),
            minPrice: z.number().optional(),
            maxPrice: z.number().optional(),
            durationMinutes: z.number(),
            bufferTimeMinutes: z.number().optional(),
            requiresAppointment: z.boolean().optional(),
            maxBookingsPerDay: z.number().optional(),
            advanceBookingDays: z.number().optional(),
            staffIds: z.array(z.number()).optional(),
            displayOrder: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const serviceId = await db.createService({
                merchantId: merchant.id,
                name: input.name,
                description: input.description,
                category: input.category,
                categoryId: input.categoryId,
                priceType: input.priceType,
                basePrice: input.basePrice,
                minPrice: input.minPrice,
                maxPrice: input.maxPrice,
                durationMinutes: input.durationMinutes,
                bufferTimeMinutes: input.bufferTimeMinutes || 0,
                requiresAppointment: input.requiresAppointment ? 1 : 0,
                maxBookingsPerDay: input.maxBookingsPerDay,
                advanceBookingDays: input.advanceBookingDays || 30,
                staffIds: input.staffIds ? JSON.stringify(input.staffIds) : undefined,
                displayOrder: input.displayOrder || 0,
                isActive: 1,
            });

            return { success: true, serviceId };
        }),

    // List services
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const services = await db.getServicesByMerchant(merchant.id);
        return { services };
    }),

    // Get service by ID with booking stats
    getById: protectedProcedure
        .input(z.object({ serviceId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const service = await db.getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
            }

            const bookingStats = await db.getBookingStats(merchant.id, { serviceId: input.serviceId });
            const recentBookings = await db.getBookingsByService(input.serviceId, { limit: 10 });
            const ratingStats = await db.getServiceRatingStats(input.serviceId);

            return {
                service,
                bookingStats,
                recentBookings,
                ratingStats
            };
        }),

    // Update service
    update: protectedProcedure
        .input(z.object({
            serviceId: z.number(),
            name: z.string().optional(),
            description: z.string().optional(),
            category: z.string().optional(),
            categoryId: z.number().optional(),
            priceType: z.enum(['fixed', 'variable', 'custom']).optional(),
            basePrice: z.number().optional(),
            minPrice: z.number().optional(),
            maxPrice: z.number().optional(),
            durationMinutes: z.number().optional(),
            bufferTimeMinutes: z.number().optional(),
            requiresAppointment: z.boolean().optional(),
            maxBookingsPerDay: z.number().optional(),
            advanceBookingDays: z.number().optional(),
            staffIds: z.array(z.number()).optional(),
            displayOrder: z.number().optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const service = await db.getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
            }

            const updateData: any = {};
            if (input.name !== undefined) updateData.name = input.name;
            if (input.description !== undefined) updateData.description = input.description;
            if (input.category !== undefined) updateData.category = input.category;
            if (input.categoryId !== undefined) updateData.categoryId = input.categoryId;
            if (input.priceType !== undefined) updateData.priceType = input.priceType;
            if (input.basePrice !== undefined) updateData.basePrice = input.basePrice;
            if (input.minPrice !== undefined) updateData.minPrice = input.minPrice;
            if (input.maxPrice !== undefined) updateData.maxPrice = input.maxPrice;
            if (input.durationMinutes !== undefined) updateData.durationMinutes = input.durationMinutes;
            if (input.bufferTimeMinutes !== undefined) updateData.bufferTimeMinutes = input.bufferTimeMinutes;
            if (input.requiresAppointment !== undefined) updateData.requiresAppointment = input.requiresAppointment ? 1 : 0;
            if (input.maxBookingsPerDay !== undefined) updateData.maxBookingsPerDay = input.maxBookingsPerDay;
            if (input.advanceBookingDays !== undefined) updateData.advanceBookingDays = input.advanceBookingDays;
            if (input.staffIds !== undefined) updateData.staffIds = JSON.stringify(input.staffIds);
            if (input.displayOrder !== undefined) updateData.displayOrder = input.displayOrder;
            if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

            await db.updateService(input.serviceId, updateData);

            return { success: true };
        }),

    // Delete service
    delete: protectedProcedure
        .input(z.object({ serviceId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const service = await db.getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
            }

            await db.deleteService(input.serviceId);

            return { success: true };
        }),

    // Get services by category
    getByCategory: protectedProcedure
        .input(z.object({ categoryId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const allServices = await db.getServicesByCategory(input.categoryId);
            // Filter to only return services belonging to this merchant
            const services = allServices.filter((s: any) => s.merchantId === merchant.id);
            return { services };
        }),
});

export type ServicesRouter = typeof servicesRouter;
