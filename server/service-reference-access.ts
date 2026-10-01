import {TRPCError} from '@trpc/server';
import {serviceCatalogId,serviceCatalogIds} from '../shared/service-catalog-write';
import {getServiceById,getServiceCategoryById,getStaffMemberById} from './db';

export const serviceReferenceId=serviceCatalogId;
export const serviceReferenceIds=serviceCatalogIds;

/** Validate only explicitly selected relationships; legacy stored values are reviewed separately. */
export async function assertServiceReferences(merchantId:number,input:{categoryId?:number|null;staffIds?:number[];serviceIds?:number[]}){
  const groups=[
    [input.categoryId==null?[]:[input.categoryId],getServiceCategoryById],
    [input.staffIds??[],getStaffMemberById],
    [input.serviceIds??[],getServiceById],
  ] as const;
  for(const [ids,read] of groups)for(const id of ids){
    const record=await read(id);
    if(!record||record.merchantId!==merchantId||record.isActive!==1)throw new TRPCError({code:'NOT_FOUND',message:'Selected service reference unavailable'});
  }
}
