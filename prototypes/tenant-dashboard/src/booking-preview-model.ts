import { bookingWorkspaceInput, bookingWorkspaceSchema, bookingWorkspaceRow, bookingDetailsSchema, bookingDetailRow, type BookingDetails } from '../../../shared/booking-workspace';
import { bookingReadIdentity } from '../../../shared/booking-read';
import { createBookingSchema } from '../../../shared/booking-creation';
import { updateBookingOperationSchema, deleteBookingOperationSchema, bookingTransitions, type BookingStatus } from '../../../shared/booking-operations';
import { bookingCalendarActionSchema, type BookingCalendarReview } from '../../../shared/booking-calendar';
import { bookingCancellationActionSchema, type BookingCancellationReview } from '../../../shared/booking-cancellation';
import { bookingRescheduleActionSchema, bookingNotificationReviewSchema, type BookingRescheduleReview, type BookingNoticeReview } from '../../../shared/booking-reschedule';
import { type BookingConsentReview } from '../../../shared/booking-consent-review';
import { bookingPaymentLinkRenewalSchema } from '../../../shared/booking-payment-link-renewal';
import { reconcileBookingCheckoutSchema } from '../../../shared/booking-checkout-reconciliation';
export const bookingPreviewQueries=['bookings.workspace','bookings.details','bookings.getOperationHistory','bookings.getConsentReview','bookings.getCalendarReview','bookings.getCancellationReview','bookings.getRescheduleReview','bookings.getPaymentLinkRenewal','bookings.getCheckoutAttempts'] as const;
export const bookingPreviewMutations=['bookings.create','bookings.update','bookings.delete','bookings.synchronizeCalendar','bookings.cancelCalendar','bookings.rescheduleCalendar','bookings.reviewBookingNotification','bookings.renewPaymentLink','bookings.reconcileCheckoutAttempt'] as const;
type Booking=BookingDetails['booking'];
type RecordState={booking:Booking;version:number;calendar:string;cancelled:boolean;moved:boolean;abandoned:boolean;renewal:any;checkout:any;noticeReviewed:boolean;history:any[];calendarHistory:any[];cancelHistory:any[];moveHistory:any[]};
type Context={actorId:number;merchantId:number;now:string;mode:()=>string;reference:(kind:'service'|'staff',id:number)=>{name:string;isActive:boolean}|null};
const fault=(code='CONFLICT')=>({message:'Local booking simulation',data:{code}});
const sampleDate=(id:number)=>`2026-10-${String(2+id%20).padStart(2,'0')}`;
/** In-memory examples only: no calendar, payment, messaging or database transport. */
export class BookingPreviewStore {
  writes=0;
  private records=new Map<number,RecordState>();private deletedHistory=new Map<number,any[]>();private receipts=new Map<string,{input:string;result:any}>();private nextId=106;
  constructor(private ctx:Context){
    if(ctx.mode()==='empty')return;
    for(let id=1;id<=105;id++){
      const status:BookingStatus=id<=8?'pending':(['pending','confirmed','in_progress','completed','cancelled','no_show'] as const)[id%6];
      const booking=bookingDetailRow.parse({id,merchantId:ctx.merchantId,service:{id:1,name:'',isActive:true},staff:{id:1,name:'',isActive:true},customerName:`${ctx.merchantId===269?'نواة · Nawa':'مدار · Madar'} · عميل مثال ${id}`,customerPhone:'966500000000',customerEmail:`sample${id}@example.test`,date:`2026-10-${String(2+id%20).padStart(2,'0')}`,startTime:'10:00',endTime:'10:45',durationMinutes:45,status:id>=3&&id<=5||id>=8&&id<=11?'confirmed':status,paymentStatus:id>8&&id%6===3?'paid':'unpaid',basePrice:15000,discountAmount:1000,finalPrice:14000,notes:'بيانات توضيحية محلية · Local sample',bookingSource:'website',issues:[],cancellationReason:null,cancelledBy:null,customerAgreementId:id>=2&&id<=5?id+100:null,googleEventId:id===4||id===5||id===8?`local-event-${id}`:null,reminder24hSent:false,reminder1hSent:false,createdAt:ctx.now,updatedAt:ctx.now,confirmedAt:id>=3&&id<=5||id===8?ctx.now:null,completedAt:null,cancelledAt:null});
      this.records.set(id,{booking,version:0,calendar:id===9?'create_unknown':id===10?'cancel_unknown':id===11?'move_unknown':id===4||id===8?'synced':id===5?'reschedule_pending':'none',cancelled:false,moved:false,abandoned:false,renewal:null,checkout:null,noticeReviewed:false,history:[],calendarHistory:[],cancelHistory:[],moveHistory:[]});
    }
  }
  private scope(){return {actorId:this.ctx.actorId,merchantId:this.ctx.merchantId,canManage:this.ctx.mode()!=='readonly',checkedAt:this.ctx.now};}
  private owned(id:number){const row=this.records.get(id);if(!row)throw fault('NOT_FOUND');return row;}
  private evidence(row:RecordState,kind:number){return [this.ctx.merchantId,row.booking.id,row.version,kind,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
  private visible(row:RecordState):Booking {
    const b=structuredClone(row.booking),mode=this.ctx.mode();
    for(const kind of ['service','staff'] as const){const value=b[kind];if(!value)continue;const ref=mode==='unavailable-reference'?null:this.ctx.reference(kind,value.id);b[kind]={id:value.id,name:ref?.name??null,isActive:ref?.isActive??null};if(!ref)b.issues.push(kind+'Reference');}
    if(mode==='legacy'){b.date=null;b.finalPrice=null;b.issues.push('date','finalPrice');if(b.id%2===0){b.status='completed';b.paymentStatus='paid';}else{b.status='unknown';b.paymentStatus='unknown';}}
    return bookingDetailRow.parse(b);
  }
  private consent(row:RecordState):BookingConsentReview {
    const b=this.visible(row),agreementId=b.customerAgreementId;
    return {state:agreementId?'ready':'none',reason:null,agreementId,evidence:agreementId?this.evidence(row,1):null,offerText:agreementId?'عرض مثال محلي بالسعر والوقت الموضحين · Local offer':null,source:agreementId?{id:101,text:'أريد حجز هذه الخدمة · Book this service',at:this.ctx.now,truncated:false}:null,consent:agreementId?{id:102,text:'موافق على الموعد والسعر · I agree to the time and price',at:this.ctx.now,truncated:false}:null,latest:null,refusal:null,terms:agreementId?{serviceName:b.service.name??'—',staffName:b.staff?.name??null,bookingDate:b.date!,startTime:b.startTime!,endTime:b.endTime!,durationMinutes:b.durationMinutes!,amountMinor:b.finalPrice!,currency:'SAR'}:null};
  }
  private notice(row:RecordState):BookingNoticeReview|null {
    if(row.booking.id!==8)return null;
    return {id:8,kind:'confirmation',evidence:this.evidence(row,5),canReview:!row.noticeReviewed,state:row.noticeReviewed?'manual_review':'unknown',delivery:'unknown',projected:false,text:'مثال إشعار يحتاج مراجعة · Sample notice requiring review',receipt:null,issue:'unknown',dispatchAt:this.ctx.now,acceptedAt:null,history:row.noticeReviewed?[{actorUserId:this.ctx.actorId,reason:'Local review',state:'manual_review',delivery:'unknown',projected:false,at:this.ctx.now}]:[]};
  }
  private calendar(row:RecordState):BookingCalendarReview {return {state:row.calendar,eventId:row.booking.googleEventId,calendarId:row.calendar==='none'?null:'local-calendar@example.test',evidence:this.evidence(row,2),canCreate:row.booking.id===3&&row.calendar==='none',canVerify:row.calendar==='create_unknown',canRelease:row.calendar==='synced',blocked:row.booking.id===3||row.calendar!=='none'?null:'account',checkedAt:this.ctx.now,history:row.calendarHistory,notification:this.notice(row)};}
  private cancellation(row:RecordState):BookingCancellationReview|null {if(![4,10].includes(row.booking.id))return null;const b=this.visible(row);return {state:row.cancelled?'cancelled':row.booking.id===10?'cancel_unknown':'requested',evidence:this.evidence(row,3),canCancel:!row.cancelled&&row.calendar==='synced',canVerify:!row.cancelled&&row.calendar==='cancel_unknown',blocker:null,appointment:{serviceName:b.service.name??'—',date:b.date!,startTime:b.startTime!,endTime:b.endTime!},request:{id:103,text:'أريد إلغاء الموعد · Please cancel',at:this.ctx.now},originalRequest:null,history:row.cancelHistory,notification:null};}
  private reschedule(row:RecordState):BookingRescheduleReview|null {if(![5,11].includes(row.booking.id))return null;return {state:row.moved?'applied':row.abandoned?'abandoned':row.booking.id===11?'move_unknown':'pending',evidence:this.evidence(row,4),canMove:row.booking.id===5&&!row.moved&&!row.abandoned,canVerify:row.booking.id===11&&!row.moved&&!row.abandoned,canAbandon:row.booking.id===5&&!row.moved&&!row.abandoned,blocker:null,before:{date:sampleDate(row.booking.id),startTime:'10:00',endTime:'10:45'},after:{date:'2026-11-08',startTime:'11:00',endTime:'11:45'},offerText:'عرض موعد بديل محلي · Local alternative appointment',consent:{id:104,text:'أوافق على الموعد البديل · I accept the new time',at:this.ctx.now},history:row.moveHistory,notification:null};}
  read(name:string,input:unknown={}){
    if(name==='bookings.workspace'){
      const selection=bookingWorkspaceInput.parse(input);
      for(const kind of ['service','staff'] as const){const id=selection[kind==='service'?'serviceId':'staffId'];if(id&&!this.ctx.reference(kind,id))throw fault('NOT_FOUND');}
      const all=Array.from(this.records.values()).map(row=>this.visible(row)).filter(b=>(selection.status==='all'||b.status===selection.status)&&(selection.payment==='all'||b.paymentStatus===selection.payment)&&(!selection.startDate||b.date!==null&&b.date>=selection.startDate)&&(!selection.endDate||b.date!==null&&b.date<=selection.endDate)&&(!selection.serviceId||b.service.id===selection.serviceId)&&(!selection.staffId||b.staff?.id===selection.staffId)&&(!selection.search||String(b.id)===selection.search||[b.customerName,b.customerPhone,b.customerEmail,b.service.name,b.staff?.name].join(' ').toLowerCase().includes(selection.search.toLowerCase()))).sort((a,b)=>(b.date??'').localeCompare(a.date??'')||(b.startTime??'').localeCompare(a.startTime??'')||b.id-a.id);
      const counts={pending:0,confirmed:0,in_progress:0,completed:0,cancelled:0,no_show:0,unknown:0},payments={unpaid:0,paid:0,refunded:0,unknown:0};let amount=0,eligible=0,invalid=0;
      for(const b of all){counts[b.status]++;payments[b.paymentStatus]++;if(b.status==='completed'&&b.paymentStatus==='paid'){eligible++;if(b.finalPrice===null)invalid++;else amount+=b.finalPrice;}}
      return bookingWorkspaceSchema.parse({...this.scope(),selection,summary:{total:all.length,counts,payments,paidValue:{minor:invalid?null:amount,eligible,invalid}},pagination:{page:selection.page,pageSize:25,total:all.length,pages:Math.ceil(all.length/25)},rows:all.slice((selection.page-1)*25,selection.page*25).map(b=>bookingWorkspaceRow.parse(Object.fromEntries(Object.keys(bookingWorkspaceRow.shape).map(key=>[key,b[key as keyof Booking]]))))});
    }
    const {bookingId}=bookingReadIdentity.parse(input);
    if(name==='bookings.getOperationHistory'&&this.deletedHistory.has(bookingId))return this.deletedHistory.get(bookingId);
    const row=this.owned(bookingId);
    if(name==='bookings.details')return bookingDetailsSchema.parse({...this.scope(),selection:{bookingId},booking:this.visible(row)});
    if(this.ctx.mode()==='readonly')throw fault('FORBIDDEN');
    if(name==='bookings.getOperationHistory')return structuredClone(row.history);
    if(name==='bookings.getConsentReview')return this.consent(row);
    if(name==='bookings.getCalendarReview')return this.calendar(row);
    if(name==='bookings.getCancellationReview')return this.cancellation(row);
    if(name==='bookings.getRescheduleReview')return this.reschedule(row);
    if(name==='bookings.getPaymentLinkRenewal')return bookingId===7?{state:row.renewal?'blocked':'eligible',blocker:row.renewal?'link':null,evidence:this.evidence(row,6),expiresAt:row.renewal?.renewedExpiresAt??'2026-10-01T10:00:00Z',audit:row.renewal}:null;
    if(name==='bookings.getCheckoutAttempts')return bookingId===6?[{id:'00000000-0000-4000-8000-000000000006',state:row.checkout?.outcome==='verified'?'created':'unknown',currency:'SAR',amountMinor:row.booking.finalPrice,updatedAt:this.ctx.now,reference:`local-booking-${this.ctx.merchantId}-6`,evidence:this.evidence(row,7),canReview:!row.checkout,lastReview:row.checkout}]:[];
    throw Error('Unmapped booking fixture');
  }
  mutate(name:string,input:any){
    if(name==='bookings.create'){
      const value=createBookingSchema.parse(input),service=this.ctx.reference('service',value.serviceId),staff=value.staffId?this.ctx.reference('staff',value.staffId):null;
      if(!service?.isActive||value.staffId&&!staff?.isActive)throw fault();
      if(Array.from(this.records.values()).some(r=>r.booking.date===value.bookingDate&&!['cancelled','no_show'].includes(r.booking.status)&&(r.booking.service.id===value.serviceId||value.staffId&&r.booking.staff?.id===value.staffId)&&r.booking.startTime!<value.endTime&&r.booking.endTime!>value.startTime))throw fault();
      const id=this.nextId++,b=bookingDetailRow.parse({id,merchantId:this.ctx.merchantId,service:{id:value.serviceId,...service},staff:value.staffId?{id:value.staffId,...staff}:null,customerName:value.customerName??null,customerPhone:value.customerPhone,customerEmail:value.customerEmail??null,date:value.bookingDate,startTime:value.startTime,endTime:value.endTime,durationMinutes:value.durationMinutes,status:'pending',paymentStatus:'unpaid',basePrice:value.basePrice,discountAmount:value.discountAmount??0,finalPrice:value.finalPrice,notes:value.notes??null,bookingSource:value.bookingSource??'whatsapp',issues:[],cancellationReason:null,cancelledBy:null,customerAgreementId:null,googleEventId:null,reminder24hSent:false,reminder1hSent:false,createdAt:this.ctx.now,updatedAt:this.ctx.now,confirmedAt:null,completedAt:null,cancelledAt:null});
      this.records.set(id,{booking:b,version:0,calendar:'none',cancelled:false,moved:false,abandoned:false,renewal:null,checkout:null,noticeReviewed:false,history:[],calendarHistory:[],cancelHistory:[],moveHistory:[]});this.writes++;return {success:true,bookingId:id};
    }
    const schemas={'bookings.update':updateBookingOperationSchema,'bookings.delete':deleteBookingOperationSchema,'bookings.synchronizeCalendar':bookingCalendarActionSchema,'bookings.cancelCalendar':bookingCancellationActionSchema,'bookings.rescheduleCalendar':bookingRescheduleActionSchema,'bookings.reviewBookingNotification':bookingNotificationReviewSchema,'bookings.renewPaymentLink':bookingPaymentLinkRenewalSchema,'bookings.reconcileCheckoutAttempt':reconcileBookingCheckoutSchema};
    const schema=schemas[name as keyof typeof schemas];if(!schema)throw Error('Unmapped booking mutation');const value=schema.parse(input) as any;
    const key=value.operationId??value.requestId??name+':'+value.bookingId+':'+value.evidence,encoded=JSON.stringify([name,value]),receipt=this.receipts.get(key);if(receipt){if(receipt.input!==encoded)throw fault();return receipt.result;}
    const row=this.owned(value.bookingId),b=row.booking;let result:any={success:true,deleted:false};const audit={action:value.action??'review',outcome:'local_sample',reason:value.reason??'Local review',actorUserId:this.ctx.actorId,at:this.ctx.now};
    if(name==='bookings.update'||name==='bookings.delete'){
      if(value.expectedStatus!==b.status||b.status==='unknown'||b.paymentStatus==='refunded')throw fault();
      if(name==='bookings.delete'){if(!['pending','cancelled'].includes(b.status)||b.paymentStatus!=='unpaid'||row.calendar!=='none'||row.history.length||b.customerAgreementId)throw fault();row.history.unshift({operation:'delete',beforeStatus:b.status,afterStatus:null,actorUserId:this.ctx.actorId,at:this.ctx.now});this.records.delete(b.id);this.deletedHistory.set(b.id,row.history);result={success:true,deleted:true};}
      else {
        if(!value.status||!bookingTransitions[b.status].includes(value.status))throw fault();
        if(row.calendar!=='none'&&(row.calendar!=='synced'||value.status==='cancelled'))throw fault();
        const consent=this.consent(row);if(b.status==='pending'&&value.status==='confirmed'&&consent.state==='ready'&&(value.consentReview?.agreementId!==consent.agreementId||value.consentReview?.evidence!==consent.evidence))throw fault();
        row.history.unshift({operation:'update',beforeStatus:b.status,afterStatus:value.status,actorUserId:this.ctx.actorId,at:this.ctx.now,consentReview:value.consentReview??null});b.status=value.status;if(value.status==='confirmed')b.confirmedAt=this.ctx.now;if(value.status==='completed')b.completedAt=this.ctx.now;if(value.status==='cancelled'){b.cancelledAt=this.ctx.now;b.cancelledBy='merchant';}
      }
    } else {
      const kind=name==='bookings.synchronizeCalendar'?2:name==='bookings.cancelCalendar'?3:name==='bookings.rescheduleCalendar'?4:name==='bookings.reviewBookingNotification'?5:name==='bookings.renewPaymentLink'?6:7;
      if(value.evidence!==this.evidence(row,kind))throw fault();
      if(kind===2){const state=this.calendar(row);if(!(value.action==='create'?state.canCreate:state.canVerify))throw fault();row.calendar='synced';b.googleEventId=`local-event-${b.id}`;row.calendarHistory.unshift(audit);}
      if(kind===3){const state=this.cancellation(row);if(!state||!(value.action==='cancel'?state.canCancel:state.canVerify))throw fault();row.cancelled=true;row.calendar='cancelled';b.status='cancelled';b.cancelledAt=this.ctx.now;b.cancelledBy='customer';b.cancellationReason=value.reason;row.cancelHistory.unshift(audit);}
      if(kind===4){const state=this.reschedule(row);if(!state||!(value.action==='move'?state.canMove:value.action==='abandon'?state.canAbandon:state.canVerify))throw fault();if(value.action==='abandon'){row.abandoned=true;row.calendar='synced';}else{row.moved=true;row.calendar='synced';b.date=state.after.date;b.startTime=state.after.startTime;b.endTime=state.after.endTime;}row.moveHistory.unshift(audit);}
      if(kind===5){if(value.notificationId!==8||!this.notice(row)?.canReview)throw fault();row.noticeReviewed=true;}
      if(kind===6){if(b.id!==7||row.renewal)throw fault();row.renewal={actorUserId:this.ctx.actorId,reason:value.reason,priorExpiresAt:'2026-10-01T10:00:00Z',renewedExpiresAt:new Date(Date.parse(this.ctx.now)+86400000).toISOString(),at:this.ctx.now};result={renewed:true,alreadyRenewed:false,expiresAt:row.renewal.renewedExpiresAt};}
      if(kind===7){if(b.id!==6||row.checkout||value.attemptId!=='00000000-0000-4000-8000-000000000006')throw fault();row.checkout={outcome:value.chargeId==='chg_preview_confirmed'?'verified':'unverified',at:this.ctx.now};result={outcome:row.checkout.outcome};}
    }
    row.version++;b.updatedAt=new Date(Date.parse(this.ctx.now)+row.version*1000).toISOString();this.receipts.set(key,{input:encoded,result});this.writes++;return result;
  }
}
