import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { merchantProcedure, permissionProcedure, router } from './_core/trpc';
import { hasPermission } from './_core/permissions';
import { staffCatalogFields, staffCatalogUpdate, staffCatalogArchive, staffCatalogIdentity } from '../shared/staff-catalog';
import { getStaffMemberById, getStaffMembersByMerchant, getActiveStaffByMerchant } from './db';
import { staffDefinitionKey, writeStaffCatalog } from './staff-catalog-write';
async function read<T>(run:()=>Promise<T>):Promise<T> {
  try{return await run();}catch(error){if(error instanceof TRPCError)throw error;throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'Staff data unavailable'});}
}
export const staffRouter = router({
  list: merchantProcedure.input(z.object({activeOnly:z.boolean().optional()}).strict().optional()).query(({ctx,input})=>read(async()=>({
    actorUserId:ctx.user.id, merchantId:ctx.merchantId, canManage:hasPermission(ctx.merchantRole,'products.manage'),
    staff:(await (input?.activeOnly?getActiveStaffByMerchant(ctx.merchantId):getStaffMembersByMerchant(ctx.merchantId))).filter(row=>row.merchantId===ctx.merchantId).map(row=>({...row,definition:staffDefinitionKey(ctx.merchantId,row.id,row)})),
  }))),
  getById: merchantProcedure.input(staffCatalogIdentity).query(({ctx,input})=>read(async()=>{
    const staff=await getStaffMemberById(input.staffId,ctx.merchantId);
    if(!staff||staff.merchantId!==ctx.merchantId)throw new TRPCError({code:'NOT_FOUND',message:'Staff member not found'});
    return {actorUserId:ctx.user.id,merchantId:ctx.merchantId,canManage:hasPermission(ctx.merchantRole,'products.manage'),staff:{...staff,definition:staffDefinitionKey(ctx.merchantId,staff.id,staff)}};
  })),
  create: permissionProcedure('products.manage').input(staffCatalogFields).mutation(async({ctx,input})=>({success:true,staffId:await writeStaffCatalog(ctx.merchantId,input)})),
  update: permissionProcedure('products.manage').input(staffCatalogUpdate).mutation(async({ctx,input})=>{
    const {staffId,expectedDefinition,...patch}=input;await writeStaffCatalog(ctx.merchantId,patch,staffId,expectedDefinition);return {success:true};
  }),
  delete: permissionProcedure('products.manage').input(staffCatalogArchive).mutation(async({ctx,input})=>{
    await writeStaffCatalog(ctx.merchantId,{isActive:false},input.staffId,input.expectedDefinition);return {success:true};
  }),
});
export type StaffRouter = typeof staffRouter;
