/**
 * Service Categories Router Module
 * Handles service category management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const serviceCategoriesRouter = router({
    // Create category
    create: protectedProcedure
        .input(z.object({
            name: z.string(),
            nameEn: z.string().optional(),
            description: z.string().optional(),
            icon: z.string().optional(),
            color: z.string().optional(),
            displayOrder: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const categoryId = await db.createServiceCategory({
                merchantId: merchant.id,
                name: input.name,
                nameEn: input.nameEn,
                description: input.description,
                icon: input.icon,
                color: input.color,
                displayOrder: input.displayOrder || 0,
            });

            return { success: true, categoryId };
        }),

    // List categories
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const categories = await db.getServiceCategoriesByMerchant(merchant.id);
        return { categories };
    }),

    // Update category
    update: protectedProcedure
        .input(z.object({
            categoryId: z.number(),
            name: z.string().optional(),
            nameEn: z.string().optional(),
            description: z.string().optional(),
            icon: z.string().optional(),
            color: z.string().optional(),
            displayOrder: z.number().optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const category = await db.getServiceCategoryById(input.categoryId);
            if (!category || category.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
            }

            const updateData: any = {};
            if (input.name !== undefined) updateData.name = input.name;
            if (input.nameEn !== undefined) updateData.nameEn = input.nameEn;
            if (input.description !== undefined) updateData.description = input.description;
            if (input.icon !== undefined) updateData.icon = input.icon;
            if (input.color !== undefined) updateData.color = input.color;
            if (input.displayOrder !== undefined) updateData.displayOrder = input.displayOrder;
            if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

            await db.updateServiceCategory(input.categoryId, updateData);

            return { success: true };
        }),

    // Delete category
    delete: protectedProcedure
        .input(z.object({ categoryId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const category = await db.getServiceCategoryById(input.categoryId);
            if (!category || category.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
            }

            await db.deleteServiceCategory(input.categoryId);

            return { success: true };
        }),
});

export type ServiceCategoriesRouter = typeof serviceCategoriesRouter;
