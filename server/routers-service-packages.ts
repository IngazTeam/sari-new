/**
 * Service Packages Router Module
 * Handles service package management
 * 
 * Shared by the main router and direct module consumers.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  createServicePackage,
  deleteServicePackage,
  getServicePackageById,
  getServicePackagesByMerchant,
  updateServicePackage,
} from './db';
import {assertServiceReferences,serviceReferenceId,serviceReferenceIds} from './service-reference-access';

export const servicePackagesRouter = router({
    // Create package
    create: permissionProcedure('products.manage')
        .input(z.object({
            name: z.string(),
            description: z.string().optional(),
            serviceIds: serviceReferenceIds,
            originalPrice: z.number(),
            packagePrice: z.number(),
            discountPercentage: z.number().optional(),
        }).strict())
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            await assertServiceReferences(merchant.id,input);
            const packageId = await createServicePackage({
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
    list: merchantProcedure.query(async ({ ctx }) => {
        const merchant = {id:ctx.merchantId};

        const packages = await getServicePackagesByMerchant(merchant.id);
        return { packages };
    }),

    // Get package by ID
    getById: merchantProcedure
        .input(z.object({ packageId: serviceReferenceId }).strict())
        .query(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const pkg = await getServicePackageById(input.packageId);
            if (!pkg || pkg.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
            }

            return { package: pkg };
        }),

    // Update package
    update: permissionProcedure('products.manage')
        .input(z.object({
            packageId: serviceReferenceId,
            name: z.string().optional(),
            description: z.string().optional(),
            serviceIds: serviceReferenceIds.optional(),
            originalPrice: z.number().optional(),
            packagePrice: z.number().optional(),
            discountPercentage: z.number().optional(),
            isActive: z.boolean().optional(),
        }).strict())
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const pkg = await getServicePackageById(input.packageId);
            if (!pkg || pkg.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
            }

            await assertServiceReferences(merchant.id,input);
            const updateData: any = {};
            if (input.name !== undefined) updateData.name = input.name;
            if (input.description !== undefined) updateData.description = input.description;
            if (input.serviceIds !== undefined) updateData.serviceIds = JSON.stringify(input.serviceIds);
            if (input.originalPrice !== undefined) updateData.originalPrice = input.originalPrice;
            if (input.packagePrice !== undefined) updateData.packagePrice = input.packagePrice;
            if (input.discountPercentage !== undefined) updateData.discountPercentage = input.discountPercentage;
            if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

            await updateServicePackage(input.packageId, updateData);

            return { success: true };
        }),

    // Delete package
    delete: permissionProcedure('products.manage')
        .input(z.object({ packageId: serviceReferenceId }).strict())
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const pkg = await getServicePackageById(input.packageId);
            if (!pkg || pkg.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
            }

            await deleteServicePackage(input.packageId);

            return { success: true };
        }),
});

export type ServicePackagesRouter = typeof servicePackagesRouter;
