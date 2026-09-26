import { z } from 'zod';
import { salesStaffReadout } from '../../shared/sales-experiment-staff-readout';
import { cohortPhone } from './sales-experiment-cohort-contract';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import type { readSalesExperimentAssignmentRow } from './sales-experiment-assignment';

type Assignment=ReturnType<typeof readSalesExperimentAssignmentRow>;
const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
const binding=z.object({id,merchant_id:id,protocol_id:id,conversation_reference:id,assignment_id:id,customer_key:digest,
  current_conversation_id:id.nullable(),current_customer_phone:z.string().nullable()});
const message=z.object({id,conversationId:id,direction:z.enum(['incoming','outgoing']),sender_type:z.enum(['customer','assistant','merchant','unknown']),
  created_utc:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/)});
const conflict=():never=>{throw Error('Sales staff message evidence unavailable');};

/** Retained message metadata, NOT a transport receipt or proof of staff-assisted conversion.
 * Binding history survives conversation deletion. Missing/currently changed identities remain unknown.
 * No phone-based discovery of unregistered conversations and no use of the mutable takeover flag.
 */
export function buildSalesReadoutStaff(assignments:Assignment[],bindingRows:any[],messageRows:any[],now:number){
  const byAssignment=new Map(assignments.map(a=>[a.assignmentId,a])),byConversation=new Map<number,{a:Assignment;valid:boolean}>();
  const seenBindings=new Set<number>(),unavailable=new Set<number>();
  const bindings=bindingRows.map(row=>{
    const b=binding.parse(row),a=byAssignment.get(b.assignment_id);
    if(!a||a.snapshot.merchantId!==b.merchant_id||a.snapshot.protocolId!==b.protocol_id||a.snapshot.customerKey!==b.customer_key
      ||seenBindings.has(b.id)||byConversation.has(b.conversation_reference)
      ||(b.current_conversation_id===null)!==(b.current_customer_phone===null)
      ||b.current_conversation_id!==null&&b.current_conversation_id!==b.conversation_reference)conflict();
    const phone=cohortPhone.safeParse(b.current_customer_phone),currentKey=phone.success
      ?hash({version:'sales-experiment-customer.v1',merchantId:b.merchant_id,phone:phone.data}):null;
    const valid=b.current_conversation_id!==null&&currentKey===b.customer_key;
    if(!valid)unavailable.add(a!.assignmentId);
    seenBindings.add(b.id);byConversation.set(b.conversation_reference,{a:a!,valid});
    return [b.id,b.assignment_id,b.conversation_reference,b.customer_key,currentKey,b.current_conversation_id] as const;
  }).sort((a,b)=>a[0]-b[0]);
  for(const a of assignments){
    const origin=byConversation.get(a.snapshot.conversationId);
    if(!origin)unavailable.add(a.assignmentId);else if(origin.a.assignmentId!==a.assignmentId)conflict();
  }
  const counts=new Map<number,{staffWithinWindow:number;unknownWithinWindow:number;staffAtBoundary:number;unknownAtBoundary:number}>();
  const seenMessages=new Set<number>();
  const messages=messageRows.map(row=>{
    const m=message.parse(row),at=Date.parse(m.created_utc),bound=byConversation.get(m.conversationId);
    if(!bound||seenMessages.has(m.id)||!Number.isFinite(at)||new Date(at).toISOString()!==m.created_utc||at>now)conflict();
    seenMessages.add(m.id);
    const {a,valid}=bound!,s=a.snapshot,start=Date.parse(s.assignedAt),end=Date.parse(s.observationEndsAt);
    // A stored whole second may straddle a millisecond enrollment/observation boundary.
    // Recovery may backdate this field: even an entirely contained second proves no acceptance chronology.
    if(valid&&m.direction==='outgoing'&&m.sender_type!=='assistant'&&at<end&&at+1000>start){
      const inside=at>=start&&at+1000<=end,c=counts.get(a.assignmentId)??{staffWithinWindow:0,unknownWithinWindow:0,staffAtBoundary:0,unknownAtBoundary:0};
      const role=m.sender_type==='merchant'?'staff':'unknown';
      c[`${role}${inside?'WithinWindow':'AtBoundary'}`]++;counts.set(a.assignmentId,c);
    }
    return [m.id,m.conversationId,m.direction,m.sender_type,m.created_utc] as const;
  }).sort((a,b)=>a[0]-b[0]);
  const arms=(['baseline','candidate'] as const).map(arm=>{
    const group=assignments.filter(a=>a.snapshot.arm===arm);
    const r={arm,assignedCustomers:group.length,customersWithRecordedStaffMessages:0,customersWithoutRecordedStaffMessages:0,
      customersWithUnknownOutgoingMessages:0,customersWithBoundaryMessages:0,customersWithUnavailableConversationIdentity:0,
      messages:{staffWithinWindow:0,unknownWithinWindow:0,staffAtBoundary:0,unknownAtBoundary:0}};
    for(const a of group){
      const c=counts.get(a.assignmentId);
      if(unavailable.has(a.assignmentId))r.customersWithUnavailableConversationIdentity++;
      if(c?.staffWithinWindow)r.customersWithRecordedStaffMessages++;else r.customersWithoutRecordedStaffMessages++;
      if(c?.unknownWithinWindow)r.customersWithUnknownOutgoingMessages++;
      if(c&&(c.staffAtBoundary+c.unknownAtBoundary)>0)r.customersWithBoundaryMessages++;
      if(c)for(const key of Object.keys(r.messages) as (keyof typeof r.messages)[])r.messages[key]+=c[key];
    }
    return r;
  });
  return {evidence:{bindings,messages},summary:salesStaffReadout.parse({scope:'recorded_outgoing_message_roles',
    identityBasis:'registered_conversations_with_current_identity_check',timeBasis:'stored_message_second_not_transport_acceptance',
    completeness:'not_established',salesAttribution:'not_established',arms})};
}
