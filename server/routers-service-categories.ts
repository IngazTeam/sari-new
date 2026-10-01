/**
 * Service Categories Router Module
 * Handles service category management
 * 
 * Shared by the main router and direct module consumers.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  createServiceCategory,
  deleteServiceCategory,
  getServiceCategoriesByMerchant,
  getServiceCategoryById,
  updateServiceCategory,
} from './db';
import {serviceReferenceId} from './service-reference-access';

export const serviceCategoriesRouter = router({
    // Create category
    create: permissionProcedure('products.manage')
        .input(z.object({
            name: z.string(),
            nameEn: z.string().optional(),
            description: z.string().optional(),
            icon: z.string().optional(),
            color: z.string().optional(),
            displayOrder: z.number().optional(),
        }).strict())
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const categoryId = await createServiceCategory({
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
    list: merchantProcedure.query(async ({ ctx }) => {
        const merchant = {id:ctx.merchantId};

        const categories = await getServiceCategoriesByMerchant(merchant.id);
        return { categories };
    }),

    // Update category
    update: permissionProcedure('products.manage')
        .input(z.object({
            categoryId: serviceReferenceId,
            name: z.string().optional(),
            nameEn: z.string().optional(),
            description: z.string().optional(),
            icon: z.string().optional(),
            color: z.string().optional(),
            displayOrder: z.number().optional(),
            isActive: z.boolean().optional(),
        }).strict())
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const category = await getServiceCategoryById(input.categoryId);
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

            await updateServiceCategory(input.categoryId, updateData);

            return { success: true };
        }),

    // Delete category
    delete: permissionProcedure('products.manage')
        .input(z.object({ categoryId: serviceReferenceId }).strict())
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const category = await getServiceCategoryById(input.categoryId);
            if (!category || category.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
            }

            await deleteServiceCategory(input.categoryId);

            return { success: true };
        }),
});

export type ServiceCategoriesRouter = typeof serviceCategoriesRouter;
