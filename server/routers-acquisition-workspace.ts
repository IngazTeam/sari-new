import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { permissionProcedure, router } from './_core/trpc';
import { acquisitionInput } from '../shared/acquisition-workspace';
import { readAcquisitionWorkspace } from './analytics/acquisition-workspace';
import { MerchantSettingsAuthorityError } from './accounts/merchant-settings-authority';
async function read(actorId:number,merchantId:number,input:unknown) {
  try { return await readAcquisitionWorkspace(actorId,merchantId,input); }
  catch(error) { throw new TRPCError({code:error instanceof MerchantSettingsAuthorityError&&error.reason==='forbidden'?'FORBIDDEN':'INTERNAL_SERVER_ERROR',message:'acquisition:unavailable'}); }
}
export const acquisitionProcedures={
  acquisitionWorkspace:permissionProcedure('analytics.read').input(acquisitionInput)
    .query(({ctx,input})=>read(ctx.user.id,ctx.merchantId,input)),
  getAcquisitionSources:permissionProcedure('analytics.read')
    .input(z.object({merchantId:z.number().int().positive().max(2147483647)}).strict())
    .query(async({ctx,input})=>{
      if(input.merchantId!==ctx.merchantId)throw new TRPCError({code:'FORBIDDEN',message:'Access denied'});
      const data=await read(ctx.user.id,ctx.merchantId,{period:'all'});
      return {totalCustomers:data.totalProfiles,sources:data.sources.map(r=>({source:r.source,count:r.count,percentage:r.sharePermille/10}))};
    }),
};
export const acquisitionRouter=router(acquisitionProcedures);
