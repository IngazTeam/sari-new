import {serviceCatalogCreateService,serviceCatalogUpdateService,serviceCatalogDefinition} from '../shared/service-catalog-write';
import {catalogListInput,catalogRecordInput,catalogChoicesInput} from '../shared/service-catalog-workspace';
import {readCatalogWorkspace,readCatalogRecord,readCatalogChoices,CatalogRecordMissingError,CatalogWorkspaceUnavailableError} from './service-catalog-workspace';
import {hasPermission} from './_core/permissions';
/**
 * Services Router Module
 * Handles service management for booking-based businesses
 * 
 * Shared by the main router and direct module consumers.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  createService,
  deleteService,
  getBookingStats,
  getBookingsByService,
  getServiceById,
  getServiceRatingStats,
  getServicesByCategory,
  getServicesByMerchant,
  updateService,
} from './db';
import {assertServiceReferences,serviceReferenceId} from './service-reference-access';

export const servicesRouter = router({
    catalogWorkspace: merchantProcedure.input(catalogListInput).query(async ({ctx,input})=>{
        try{return {...await readCatalogWorkspace(ctx.user.id,ctx.merchantId,input),canManage:hasPermission(ctx.merchantRole,'products.manage')};}catch(error){catalogReadError(error);}
    }),
    catalogRecord: merchantProcedure.input(catalogRecordInput).query(async ({ctx,input})=>{
        try{return {...await readCatalogRecord(ctx.user.id,ctx.merchantId,input),canManage:hasPermission(ctx.merchantRole,'products.manage')};}catch(error){catalogReadError(error);}
    }),
    catalogChoices: merchantProcedure.input(catalogChoicesInput).query(async ({ctx,input})=>{
        try{return {...await readCatalogChoices(ctx.user.id,ctx.merchantId,input),canManage:hasPermission(ctx.merchantRole,'products.manage')};}catch(error){catalogReadError(error);}
    }),
    // Create service
    create: permissionProcedure('products.manage')
        .input(serviceCatalogCreateService)
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            await assertServiceReferences(merchant.id,input);
            const serviceId = await createService({
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
                advanceBookingDays: input.advanceBookingDays ?? 30,
                staffIds: input.staffIds ? JSON.stringify(input.staffIds) : undefined,
                displayOrder: input.displayOrder || 0,
                isActive: input.isActive ? 1 : 0,
            });

            return { success: true, serviceId };
        }),

    // List services
    list: merchantProcedure.query(async ({ ctx }) => {
        const merchant = {id:ctx.merchantId};

        const services = await getServicesByMerchant(merchant.id);
        return { services };
    }),

    // Get service by ID with booking stats
    getById: merchantProcedure
        .input(z.object({ serviceId: serviceReferenceId }).strict())
        .query(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const service = await getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
            }

            const bookingStats = await getBookingStats(merchant.id, { serviceId: input.serviceId });
            const recentBookings = await getBookingsByService(input.serviceId, merchant.id, { limit: 10 });
            const ratingStats = await getServiceRatingStats(input.serviceId, merchant.id);

            return {
                service,
                bookingStats,
                recentBookings,
                ratingStats
            };
        }),

    // Update service
    update: permissionProcedure('products.manage')
        .input(serviceCatalogUpdateService)
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const service = await getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
            }

            await assertServiceReferences(merchant.id,input);
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

            await updateService(input.serviceId, updateData,merchant.id,input.expectedDefinition);

            return { success: true };
        }),

    // Delete service
    delete: permissionProcedure('products.manage')
        .input(z.object({ serviceId: serviceReferenceId,expectedDefinition:serviceCatalogDefinition.optional() }).strict())
        .mutation(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            const service = await getServiceById(input.serviceId);
            if (!service || service.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
            }

            await deleteService(input.serviceId,merchant.id,input.expectedDefinition);

            return { success: true };
        }),

    // Get services by category
    getByCategory: merchantProcedure
        .input(z.object({ categoryId: serviceReferenceId }).strict())
        .query(async ({ ctx, input }) => {
            const merchant = {id:ctx.merchantId};

            await assertServiceReferences(merchant.id,{categoryId:input.categoryId});
            const allServices = await getServicesByCategory(input.categoryId,merchant.id);
            // Filter to only return services belonging to this merchant
            const services = allServices.filter((s: any) => s.merchantId === merchant.id);
            return { services };
        }),
});

export type ServicesRouter = typeof servicesRouter;

function catalogReadError(error:unknown):never{
    if(error instanceof CatalogRecordMissingError)throw new TRPCError({code:'NOT_FOUND',message:'Catalog record not found'});
    if(error instanceof CatalogWorkspaceUnavailableError)throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'Catalog workspace unavailable'});
    throw error;
}
