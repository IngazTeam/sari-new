import { TRPCError } from '@trpc/server';
import { trySendDashboardVoice } from './ai/staff-dashboard-voice';
import type { StaffVoiceInput } from '../shared/staff-dashboard-voice';
export async function routeDashboardStaffVoice(merchant:number,actor:number,input:StaffVoiceInput){
  try{return await trySendDashboardVoice(merchant,actor,input);}
  catch{throw new TRPCError({code:'CONFLICT',message:'Staff voice unavailable; retain this recording and request identity'});}
}
