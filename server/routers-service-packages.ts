/**
 * Service Packages Router Module
 * Handles service package management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const servicePackagesRouter = router({
    // Create package
    create: protectedProcedure
        .input(z.object({
            name: z.string(),
            description: z.string().optional(),
            serviceIds: z.array(z.number()),
            originalPrice: z.number(),
            packagePrice: z.number(),
            discountPercentage: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const packageId = await db.createServicePackage({
                merchantId: merchant.id,
                name: input.name,
                description: input.description,
                serviceIds: JSON.stringify(input.serviceIds),
                originalPrice: input.originalPrice,
                packagePrice: input.packagePrice,
                discountPercentage: input.discountPercentage,
                isActive: 1,
            });

            return { success: true, packageId };
        }),

    // List packages
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const packages = await db.getServicePackagesByMerchant(merchant.id);
        return { packages };
    }),

    // Get package by ID
    getById: protectedProcedure
        .input(z.object({ packageId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const pkg = await db.getServicePackageById(input.packageId);
            if (!pkg || pkg.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
            }

            return { package: pkg };
        }),

    // Update package
    update: protectedProcedure
        .input(z.object({
            packageId: z.number(),
            name: z.string().optional(),
            description: z.string().optional(),
            serviceIds: z.array(z.number()).optional(),
            originalPrice: z.number().optional(),
            packagePrice: z.number().optional(),
            discountPercentage: z.number().optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const pkg = await db.getServicePackageById(input.packageId);
            if (!pkg || pkg.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
            }

            const updateData: any = {};
            if (input.name !== undefined) updateData.name = input.name;
            if (input.description !== undefined) updateData.description = input.description;
            if (input.serviceIds !== undefined) updateData.serviceIds = JSON.stringify(input.serviceIds);
            if (input.originalPrice !== undefined) updateData.originalPrice = input.originalPrice;
            if (input.packagePrice !== undefined) updateData.packagePrice = input.packagePrice;
            if (input.discountPercentage !== undefined) updateData.discountPercentage = input.discountPercentage;
            if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

            await db.updateServicePackage(input.packageId, updateData);

            return { success: true };
        }),

    // Delete package
    delete: protectedProcedure
        .input(z.object({ packageId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const pkg = await db.getServicePackageById(input.packageId);
            if (!pkg || pkg.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
            }

            await db.deleteServicePackage(input.packageId);

            return { success: true };
        }),
});

export type ServicePackagesRouter = typeof servicePackagesRouter;
