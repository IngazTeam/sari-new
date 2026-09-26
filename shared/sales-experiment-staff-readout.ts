import { z } from 'zod';

const customers=z.number().int().nonnegative().max(10000),messages=z.number().int().nonnegative().max(20000);
export const salesStaffReadout=z.object({
  scope:z.literal('recorded_outgoing_message_roles'),
  identityBasis:z.literal('registered_conversations_with_current_identity_check'),
  timeBasis:z.literal('stored_message_second_not_transport_acceptance'),
  completeness:z.literal('not_established'),salesAttribution:z.literal('not_established'),
  arms:z.array(z.object({
    arm:z.enum(['baseline','candidate']),assignedCustomers:customers,
    customersWithRecordedStaffMessages:customers,customersWithoutRecordedStaffMessages:customers,
    customersWithUnknownOutgoingMessages:customers,customersWithBoundaryMessages:customers,
    customersWithUnavailableConversationIdentity:customers,
    messages:z.object({staffWithinWindow:messages,unknownWithinWindow:messages,staffAtBoundary:messages,unknownAtBoundary:messages}),
  }).strict()).length(2),
}).strict().superRefine((r,ctx)=>{
  const bad=()=>ctx.addIssue({code:'custom',message:'Inconsistent staff message evidence'});
  if(new Set(r.arms.map(a=>a.arm)).size!==2||r.arms.reduce((n,a)=>n+a.assignedCustomers,0)>10000
    ||r.arms.reduce((n,a)=>n+Object.values(a.messages).reduce((s,v)=>s+v,0),0)>20000)bad();
  for(const a of r.arms){
    const m=a.messages;
    if(a.customersWithRecordedStaffMessages+a.customersWithoutRecordedStaffMessages!==a.assignedCustomers
      ||a.customersWithUnknownOutgoingMessages>a.assignedCustomers||a.customersWithBoundaryMessages>a.assignedCustomers
      ||a.customersWithUnavailableConversationIdentity>a.assignedCustomers)bad();
    for(const [c,n] of [[a.customersWithRecordedStaffMessages,m.staffWithinWindow],
      [a.customersWithUnknownOutgoingMessages,m.unknownWithinWindow],[a.customersWithBoundaryMessages,m.staffAtBoundary+m.unknownAtBoundary]])
      if(c>n||(c===0)!==(n===0))bad();
  }
});
