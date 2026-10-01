import {TRPCError} from '@trpc/server';
import {z} from 'zod';
import {getServiceById,getServiceCategoryById,getStaffMemberById} from './db';

export const serviceReferenceId=z.number().int().positive().max(2147483647);
export const serviceReferenceIds=z.array(serviceReferenceId).max(200).refine(ids=>new Set(ids).size===ids.length,'Duplicate references');

/** Validate only explicitly selected relationships; legacy stored values are reviewed separately. */
export async function assertServiceReferences(merchantId:number,input:{categoryId?:number;staffIds?:number[];serviceIds?:number[]}){
  const groups=[
    [input.categoryId===undefined?[]:[input.categoryId],getServiceCategoryById],
    [input.staffIds??[],getStaffMemberById],
    [input.serviceIds??[],getServiceById],
  ] as const;
  for(const [ids,read] of groups)for(const id of ids){
    const record=await read(id);
    if(!record||record.merchantId!==merchantId||record.isActive!==1)throw new TRPCError({code:'NOT_FOUND',message:'Selected service reference unavailable'});
  }
}
