import { orderNoticeStatus, orderNoticeState, orderNoticeEvidence, orderNoticeSelection, orderNoticeTemplate, orderNoticeRow, orderNoticeWorkspace, orderNoticeDetailInput, orderNoticeDetail, type OrderNoticeRow } from '../../../shared/order-notification-workspace';
import { saveOrderNoticeTemplateInput, saveOrderNoticeTemplateResult, acknowledgeOrderNoticesInput, acknowledgeOrderNoticesResult } from '../../../shared/order-notification-actions';
import type { ServiceMode } from './service-preview-model';
export const orderNoticePreviewQueries = ['orderNotifications.workspace', 'orderNotifications.detail'] as const;
export const orderNoticePreviewMutations = ['orderNotifications.saveTemplate', 'orderNotifications.acknowledgeReviewed'] as const;
const fault = (reason:string, code='BAD_REQUEST') => ({message:'order_notice:'+reason, data:{code}});
type Template = ReturnType<typeof orderNoticeTemplate.parse>;

/** Disposable UI examples. Provider labels illustrate evidence states, never real receipts or sends. */
export class OrderNoticePreviewStore {
  writes=0;
  private version=0;
  private started=Date.now();
  private templates=new Map<string,Template>();
  private rows=new Map<number,OrderNoticeRow>();
  constructor(readonly actorId:number, readonly merchantId:number, readonly now:string, private mode:()=>ServiceMode) {
    for (const [index,status] of Array.from(orderNoticeStatus.options.entries())) {
      const stored=mode()!=='empty'&&index<4, legacy=mode()==='legacy'&&index===0;
      this.templates.set(status,orderNoticeTemplate.parse({id:stored?index+1:null,status,canonicalStatus:status,stored,
        template:legacy?'<img src=x onerror=alert(1)> {{unsupported}}':`مرحبًا {{customerName}} · Hello {{customerName}}\nطلب Order #{{orderNumber}} · {{storeName}}\n{{total}} {{currency}} · ${status}`,
        enabled:legacy?null:stored&&index!==1,revision:this.marker(1,index+1),updatedAt:stored?now:null,issues:legacy?['template','enabled']:[]}));
    }
    if(mode()==='legacy')this.templates.set('legacy-status',orderNoticeTemplate.parse({id:7,status:'legacy-status',canonicalStatus:null,stored:true,template:'قالب محفوظ قديم · Stored legacy template',enabled:null,revision:this.marker(1,7),updatedAt:null,issues:['status','enabled','updatedAt']}));
    if(mode()==='empty')return;
    for(let id=1;id<=32;id++) {
      const legacy=mode()==='legacy'&&id===32, unlinked=id===30||mode()==='unavailable-reference'&&id===32;
      const state=id===32?'manual_review':orderNoticeState.options[id%7], evidence=orderNoticeEvidence.options[id%6];
      const stamp=this.shift(-(33-id)*60000), receipt=evidence==='unverified'?null:this.shift(-(33-id)*60000+1000);
      const row=orderNoticeRow.parse({id,revision:this.marker(2,id),integrity:'linked',status:legacy?null:orderNoticeStatus.options[id%6],state:legacy?'unknown':state,
        order:{id:id+100,number:`${merchantId===269?'NAWA':'MADAR'}-${id}${id===1?' %_literal':''}`},customerPhone:'+966500000000',
        message:legacy?'<img src=x onerror=alert(1)> · نص محفوظ':`رسالة توضيحية للطلب ${id} · Sample order ${id} message`, attempts:legacy?null:id%4,
        evidence,provider:evidence==='simulated'?'mock':receipt?'meta_cloud':null,providerMessageId:receipt?`SIMULATED-${merchantId}-${id}`:null,evidenceAt:receipt,
        createdAt:stamp,updatedAt:now,availableAt:stamp,claimedAt:state==='pending'?null:stamp,sentAt:state==='sent'?stamp:null,
        reviewedAt:state==='suppressed'?now:null,reviewedByUserId:state==='suppressed'?actorId:null,hasEvent:true,
        issues:legacy?['status','state','attempts']:[],salesVerification:'not_verified'});
      this.rows.set(id,unlinked?orderNoticeRow.parse({...row,integrity:'unlinked',order:null,customerPhone:null,message:null,provider:null,providerMessageId:null,evidenceAt:null,reviewedByUserId:null,evidence:'unverified',issues:['reference']}):row);
    }
  }
  private shift(ms:number){return new Date(Date.parse(this.now)+ms).toISOString();}
  private get time(){return this.shift(Date.now()-this.started);}
  private marker(kind:number,id:number){return [this.actorId,this.merchantId,kind,id,this.version,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
  private scope(){return {actorId:this.actorId,merchantId:this.merchantId,canManage:this.mode()!=='readonly',checkedAt:this.time};}
  private row(id:number){const row=this.rows.get(id);if(!row)throw fault('missing','NOT_FOUND');return structuredClone(row);}
  read(name:string,input:unknown={}) {
    if(name==='orderNotifications.detail') {
      if(this.mode()==='choices-error')throw fault('unavailable','INTERNAL_SERVER_ERROR');
      return orderNoticeDetail.parse({...this.scope(),row:this.row(orderNoticeDetailInput.parse(input).id)});
    }
    if(name!=='orderNotifications.workspace')throw fault('missing','NOT_FOUND');
    const selection=orderNoticeSelection.parse(input),all=Array.from(this.rows.values()),q=selection.query.toLowerCase();
    const matches=all.filter(r=>(selection.status===null||r.status===selection.status)&&(selection.state===null||r.state===selection.state)
      &&(selection.evidence===null||r.evidence===selection.evidence)&&(selection.integrity==='all'||r.integrity===selection.integrity)
      &&(!q||String(r.id)===q||r.integrity==='linked'&&[r.order?.number,r.customerPhone,r.message,r.providerMessageId].some(v=>v?.toLowerCase().includes(q))));
    matches.sort((a,b)=>selection.sort==='oldest'?(a.createdAt??'').localeCompare(b.createdAt??'')||a.id-b.id:(b.createdAt??'').localeCompare(a.createdAt??'')||b.id-a.id);
    const pages=Math.ceil(matches.length/25),currentPage=Math.min(selection.page,Math.max(1,pages)),linked=all.filter(r=>r.integrity==='linked').length;
    return orderNoticeWorkspace.parse({...this.scope(),selection,templates:Array.from(this.templates.values()),stats:{total:all.length,linked,unlinked:all.length-linked,
      states:Object.fromEntries(orderNoticeState.options.map(s=>[s,all.filter(r=>r.state===s).length])),evidence:Object.fromEntries(orderNoticeEvidence.options.map(s=>[s,all.filter(r=>r.evidence===s).length]))},
      rows:matches.slice((currentPage-1)*25,currentPage*25),matched:matches.length,pages,currentPage,pageSize:25,evidenceScope:'matching_provider_receipts'});
  }
  mutate(name:string,input:unknown) {
    if(this.mode()==='readonly')throw fault('forbidden','FORBIDDEN');
    if(name==='orderNotifications.saveTemplate') {
      const v=saveOrderNoticeTemplateInput.parse(input),before=this.templates.get(v.status)!;
      const same=before.stored&&before.template===v.template&&before.enabled===v.enabled;
      if(!same) {
        if(before.revision!==v.revision)throw fault('stale','CONFLICT');
        this.version++;this.writes++;this.templates.set(v.status,orderNoticeTemplate.parse({...before,id:before.id??orderNoticeStatus.options.indexOf(v.status)+1,stored:true,
          template:v.template,enabled:v.enabled,updatedAt:this.time,issues:[],revision:this.marker(1,orderNoticeStatus.options.indexOf(v.status)+1)}));
      }
      return saveOrderNoticeTemplateResult.parse({actorId:this.actorId,merchantId:this.merchantId,template:this.templates.get(v.status),effect:same?'already_current':'saved',sendsMessage:false});
    }
    if(name==='orderNotifications.acknowledgeReviewed') {
      const v=acknowledgeOrderNoticesInput.parse(input),rows=v.records.map(r=>this.row(r.id));
      // Validate the whole selection before changing any row, matching the server transaction.
      for(const row of rows){if(row.integrity!=='linked'||!row.hasEvent)throw fault('reference','PRECONDITION_FAILED');if(row.state!=='manual_review'||row.revision!==v.records.find(r=>r.id===row.id)?.revision)throw fault('stale','CONFLICT');}
      this.version++;this.writes++;
      for(const row of rows)this.rows.set(row.id,orderNoticeRow.parse({...row,state:'suppressed',reviewedAt:this.time,reviewedByUserId:this.actorId,updatedAt:this.time,revision:this.marker(2,row.id)}));
      return acknowledgeOrderNoticesResult.parse({actorId:this.actorId,merchantId:this.merchantId,acknowledgedIds:rows.map(r=>r.id).sort((a,b)=>a-b),sendsMessage:false});
    }
    throw fault('missing','NOT_FOUND');
  }
}
