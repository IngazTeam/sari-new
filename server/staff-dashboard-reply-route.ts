import { TRPCError } from '@trpc/server';
import type { StaffDashboardReplyInput } from '../shared/staff-dashboard-reply';
import { trySendDashboardStaff } from './ai/staff-dashboard-reply';

export async function routeDashboardStaffReply(merchantId:number,actorUserId:number,input:StaffDashboardReplyInput){
  try{return await trySendDashboardStaff(merchantId,actorUserId,input);}
  catch{throw new TRPCError({code:'CONFLICT',message:'Staff reply unavailable; retain this attempt and refresh before checking it again'});}
}
