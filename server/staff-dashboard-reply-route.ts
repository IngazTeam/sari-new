import { TRPCError } from '@trpc/server';
import type { StaffDashboardReplyInput } from '../shared/staff-dashboard-reply';
import { trySendDashboardStaff,type StaffCompatibilitySend } from './ai/staff-dashboard-reply';

export async function routeDashboardStaffReply(merchantId:number,actorUserId:number,input:StaffDashboardReplyInput,compatibilitySend?:StaffCompatibilitySend){
  try{return await trySendDashboardStaff(merchantId,actorUserId,input,compatibilitySend);}
  catch{throw new TRPCError({code:'CONFLICT',message:'Staff reply unavailable; retain this attempt and refresh before checking it again'});}
}
