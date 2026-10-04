import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { usageQueryOptions } from '@/lib/usage-workspace-view';
import { whatsappDiagnosticLabels } from '@/lib/whatsapp-diagnostic-labels';
import { whatsappConnectionTestInput, whatsappImageTestInput, whatsappTextTestInput } from '@shared/whatsapp-test-input';
import { whatsappDiagnosticWorkspace } from '@shared/whatsapp-diagnostic-workspace';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import '@/styles/whatsapp-diagnostic-workspace.css';

export function WhatsAppDiagnosticPage(){
 const user=trpc.auth.me.useQuery(undefined,usageQueryOptions);
 const identity=trpc.merchants.workspaceIdentity.useQuery(undefined,{...usageQueryOptions,enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const error=user.error||identity.error,refresh=()=>{void user.refetch();void identity.refetch();};
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||user.isFetching||identity.isLoading||identity.isFetching)return <WorkspaceState kind="loading"/>;
 if(!user.data?.id||!identity.data?.id||identity.data.actorId!==user.data.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 return <DiagnosticWorkspace key={`${user.data.id}:${identity.data.id}`} actorId={user.data.id} merchantId={identity.data.id}/>;
}
type Fields={instanceId:string;token:string;phoneNumber:string;message:string;imageUrl:string;caption:string};
type Review={kind:'text'|'image'|'save'|'delete';fields:Fields;recordId?:number;verifiedPhone?:string;removalRevision?:string};
function DiagnosticWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}){
 const {t,i18n}=useTranslation(),c=whatsappDiagnosticLabels(t),ar=i18n.language.startsWith('ar');
 const query=trpc.whatsapp.diagnosticWorkspace.useQuery({merchantId},usageQueryOptions);
 const parsed=whatsappDiagnosticWorkspace.safeParse(query.data),data=parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId?parsed.data:null;
 const [fields,setFields]=useState<Fields>({instanceId:'',token:'',phoneNumber:'',message:'',imageUrl:'',caption:''});
 const [tab,setTab]=useState<'connection'|'text'|'image'>('connection'),[errors,setErrors]=useState<Record<string,string>>({});
 const [health,setHealth]=useState<{success:boolean;phoneNumber?:string}|null>(null),[notice,setNotice]=useState<string|null>(null);
 const [receipt,setReceipt]=useState<string|null>(null),[sendLocked,setSendLocked]=useState(false),[review,setReview]=useState<Review|null>(null),[actionError,setActionError]=useState<string|null>(null);
 const busy=useRef(false),[running,setRunning]=useState(false),trigger=useRef<HTMLElement|null>(null);
 const probe=trpc.whatsapp.testConnection.useMutation(),sendText=trpc.whatsapp.sendTestMessage.useMutation(),sendImage=trpc.whatsapp.sendTestImage.useMutation(),save=trpc.whatsapp.saveInstance.useMutation(),remove=trpc.whatsapp.deleteReviewedInstance.useMutation();
 const selected=data?.connections.find(row=>row.instanceId===fields.instanceId);
 const disabled=running||!!review;
 const edit=(key:keyof Fields,value:string)=>{setFields(prev=>({...prev,[key]:value}));setErrors(prev=>({...prev,[key]:''}));if(key==='instanceId'||key==='token'){setHealth(null);setNotice(null);} };
 const validate=(kind:'connection'|'text'|'image')=>{
  const credentials={instanceId:fields.instanceId.trim(),token:fields.token.trim()},input=kind==='text'?{...credentials,phoneNumber:fields.phoneNumber.trim(),message:fields.message.trim()}:kind==='image'?{...credentials,phoneNumber:fields.phoneNumber.trim(),imageUrl:fields.imageUrl.trim(),caption:fields.caption}:credentials;
  const result=(kind==='connection'?whatsappConnectionTestInput:kind==='text'?whatsappTextTestInput:whatsappImageTestInput).safeParse(input);
  if(!result.success){const next:Record<string,string>={};for(const issue of result.error.issues)next[String(issue.path[0])]=c['error_'+String(issue.path[0]) as keyof typeof c]??c.invalid;setErrors(next);const key=String(result.error.issues[0]?.path[0]);document.getElementById('wd-'+key)?.focus();return false;}
  setErrors({});return true;
 };
 const check=async()=>{
  if(busy.current||!validate('connection'))return;busy.current=true;setRunning(true);setHealth(null);setNotice(null);
  try{const result=await probe.mutateAsync({instanceId:fields.instanceId.trim(),token:fields.token.trim()});if(!('success' in result)||typeof result.success!=='boolean')throw Error();setHealth({success:result.success,phoneNumber:'phoneNumber' in result?result.phoneNumber:undefined});}
  catch{setNotice(c.checkFailed);}finally{busy.current=false;setRunning(false);}
 };
 const openReview=(kind:Review['kind'],element:HTMLElement)=>{
  if(busy.current||!data)return;
  if(kind==='delete'){if(!selected||data.truncated||!data.removalRevision)return;}
  else if(!validate(kind==='save'?'connection':kind))return;
  if(kind==='save'&&(!health?.success||!health.phoneNumber))return;
  if((kind==='text'||kind==='image')&&(!selected||selected.provider!=='green_api'||selected.status!=='active'||sendLocked)){setNotice(c.savedRequired);return;}
  trigger.current=element;setActionError(null);setReview({kind,fields:{...fields,instanceId:fields.instanceId.trim(),token:fields.token.trim(),phoneNumber:fields.phoneNumber.trim(),message:fields.message.trim(),imageUrl:fields.imageUrl.trim()},recordId:selected?.id,verifiedPhone:health?.phoneNumber,removalRevision:data.removalRevision??undefined});
 };
 const confirm=async()=>{
  if(!review||busy.current||!data)return;const current=review;busy.current=true;setRunning(true);setActionError(null);setNotice(null);setReceipt(null);
  try{
   const f=current.fields;
   if(current.kind==='text'||current.kind==='image'){
    const result=current.kind==='text'?await sendText.mutateAsync({instanceId:f.instanceId,token:f.token,phoneNumber:f.phoneNumber,message:f.message}):await sendImage.mutateAsync({instanceId:f.instanceId,token:f.token,phoneNumber:f.phoneNumber,imageUrl:f.imageUrl,caption:f.caption});
    if(!('accepted' in result)||result.accepted!==true||!('idMessage' in result)||typeof result.idMessage!=='string'||!result.idMessage)throw Error();
    setReceipt(result.idMessage);setSendLocked(true);setNotice(c.accepted);setReview(null);
   }else{
    let savedId:number|undefined;
    if(current.kind==='save'){const result=await save.mutateAsync({instanceId:f.instanceId,token:f.token,phoneNumber:current.verifiedPhone});savedId=result.instanceId;if(!result.success||!Number.isSafeInteger(savedId)||!savedId)throw Error();}
    else{if(!current.recordId||!current.removalRevision)throw Error();const result=await remove.mutateAsync({merchantId,instanceId:current.recordId,expectedRevision:current.removalRevision});if(!result.success||result.actorId!==actorId||result.merchantId!==merchantId||result.instanceId!==current.recordId)throw Error();}
    const refreshed=await query.refetch(),snapshot=whatsappDiagnosticWorkspace.safeParse(refreshed.data);
    if(refreshed.error||!snapshot.success||snapshot.data.actorId!==actorId||snapshot.data.merchantId!==merchantId)throw Error();
    if(current.kind==='save'?!snapshot.data.connections.some(row=>row.id===savedId&&row.instanceId===f.instanceId&&row.phoneNumber===current.verifiedPhone):snapshot.data.truncated||snapshot.data.connections.some(row=>row.id===current.recordId))throw Error();
    setNotice(current.kind==='save'?c.saved:c.deleted);setHealth(null);setFields(prev=>({...prev,token:''}));setReview(null);
   }
  }catch(error){
   if(current.kind==='text'||current.kind==='image'){
    const code=(error as {data?:{code?:string}})?.data?.code;
    if(code&&['FORBIDDEN','BAD_REQUEST','TOO_MANY_REQUESTS'].includes(code))setActionError(c.notSent);
    else{setSendLocked(true);setNotice(c.uncertainSend);setReview(null);}
   }else{setActionError(c.verifySaved);}
  }finally{busy.current=false;setRunning(false);}
 };
 const field=(key:keyof Fields,label:string,kind:'text'|'password'|'tel'|'textarea'='text',limit=512)=><label className="wd-field" htmlFor={'wd-'+key}>{label}{kind==='textarea'?<textarea id={'wd-'+key} value={fields[key]} maxLength={limit} disabled={disabled} onChange={e=>edit(key,e.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key]?'wd-error-'+key:undefined}/>:<input id={'wd-'+key} type={kind} dir="ltr" autoComplete={key==='token'?'new-password':key==='phoneNumber'?'tel':'off'} inputMode={key==='instanceId'||key==='phoneNumber'?'numeric':undefined} spellCheck={false} value={fields[key]} maxLength={limit} disabled={disabled} onChange={e=>edit(key,e.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key]?'wd-error-'+key:undefined}/>} {errors[key]&&<span id={'wd-error-'+key} role="alert">{errors[key]}</span>}</label>;
 return <section className="wd-workspace" dir={ar?'rtl':'ltr'}>
  <header className="wd-header"><div><p className="wd-eyebrow"><MessageCircle size={18} aria-hidden="true"/>{c.eyebrow}</p><h1>{c.title}</h1><p>{c.description}</p></div><Link className="wd-button" href="/merchant/greenapi-setup">{c.guide}</Link></header>
  {query.error?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>void query.refetch()}/>:query.isLoading||query.isFetching?<WorkspaceState inline kind="loading"/>:!data?<WorkspaceState inline kind="error" onRetry={()=>void query.refetch()}/>:
  <>
   <p className="wd-note">{c.scope}</p>
   <section className="wd-panel"><div className="wd-panel-header"><h2>{c.connection}</h2><button type="button" className="wd-button" disabled={disabled} onClick={()=>{setHealth(null);void query.refetch();}}><RefreshCw size={17} aria-hidden="true"/>{c.refresh}</button></div>
    <label className="wd-field" htmlFor="wd-saved">{c.savedConnection}<select id="wd-saved" value={selected?.id??''} disabled={disabled} onChange={e=>{const row=data.connections.find(r=>r.id===Number(e.target.value));setFields(prev=>({...prev,instanceId:row?.instanceId??'',token:''}));setHealth(null);setErrors({});setNotice(null);}}><option value="">{c.manual}</option>{data.connections.map(row=><option key={row.id} value={row.id} disabled={row.provider!=='green_api'}>{row.phoneNumber||row.instanceId} · {row.provider==='green_api'?c.green:row.provider==='meta_cloud'?'Meta Cloud':c.mock} · {c[`status_${row.status}`]}</option>)}</select></label>
    {!data.connections.length&&<p>{c.empty}</p>}{data.truncated&&<p>{c.truncated}</p>}
    <div className="wd-fields">{field('instanceId',c.instanceId,'text',30)}{field('token',c.token,'password',512)}</div><p className="wd-small">{c.secretHint}</p>
    <div className="wd-actions"><button type="button" className="wd-button wd-primary" disabled={disabled} onClick={()=>void check()}>{running?c.working:c.check}</button><Link className="wd-button" href="/merchant/whatsapp">{c.manage}</Link></div>
    {health&&<p className="wd-result" role="status">{health.success?c.connected:c.notConnected}{health.phoneNumber&&<> · <bdi>{health.phoneNumber}</bdi></>}</p>}
    <details className="wd-advanced"><summary>{c.advanced}</summary><p>{c.advancedHint}</p><div className="wd-actions"><button type="button" className="wd-button" disabled={disabled||!health?.success||!health.phoneNumber} onClick={e=>openReview('save',e.currentTarget)}>{c.save}</button><button type="button" className="wd-button wd-danger" disabled={disabled||!selected||data.truncated||!data.removalRevision} onClick={e=>openReview('delete',e.currentTarget)}>{c.delete}</button></div></details>
   </section>
   <section className="wd-panel"><h2>{c.tryMessage}</h2><p>{c.sendHint}</p><div className="wd-tabs" role="group" aria-label={c.testKind}>{(['connection','text','image'] as const).map(value=><button type="button" key={value} aria-pressed={tab===value} disabled={disabled} onClick={()=>{setTab(value);setErrors({});}}>{c[`tab_${value}`]}</button>)}</div>
    {tab==='connection'?<p>{c.connectionOnly}</p>:<form noValidate onSubmit={e=>{e.preventDefault();openReview(tab,e.currentTarget.querySelector('button[type=submit]')!);}}>
      {field('phoneNumber',c.phone,'tel',15)}<p className="wd-small">{c.phoneHint}</p>
      {tab==='text'?field('message',c.message,'textarea',4096):<>{field('imageUrl',c.imageUrl,'text',2048)}<p className="wd-small">{c.imageHint}</p>{field('caption',c.caption,'textarea',1024)}</>}
      {(!selected||selected.provider!=='green_api'||selected.status!=='active')&&<p>{c.savedRequired}</p>}
      <button type="submit" className="wd-button wd-primary" disabled={disabled||sendLocked}>{c.reviewSend}</button>
    </form>}
   </section>
   {notice&&<section className="wd-panel wd-result" role="status"><h2>{c.result}</h2><p>{notice}</p>{receipt&&<p>{c.receipt}: <bdi>{receipt}</bdi></p>}{sendLocked&&<><p>{c.noRetry}</p><button type="button" className="wd-button" disabled={running} onClick={()=>{setSendLocked(false);setReceipt(null);setNotice(null);}}>{c.newTest}</button></>}</section>}
  </>}
  <Dialog open={!!review} onOpenChange={open=>{if(!open&&!running)setReview(null);}}><DialogContent className="wd-dialog" showCloseButton={!running} closeLabel={c.close} onCloseAutoFocus={event=>{if(trigger.current?.isConnected){event.preventDefault();trigger.current.focus();}}} onEscapeKeyDown={event=>{if(running)event.preventDefault();}} onPointerDownOutside={event=>{if(running)event.preventDefault();}}>
    <DialogHeader><DialogTitle>{review?.kind==='save'?c.reviewSave:review?.kind==='delete'?c.reviewDelete:c.reviewSend}</DialogTitle><DialogDescription>{review?.kind==='delete'?c.deleteHint:review?.kind==='save'?c.saveHint:c.sendReviewHint}</DialogDescription></DialogHeader>
    {review&&<div className="wd-review"><p>{c.instanceId}: <bdi>{review.fields.instanceId}</bdi></p>{review.kind==='text'||review.kind==='image'?<><p>{c.phone}: <bdi>{review.fields.phoneNumber}</bdi></p>{review.kind==='image'&&<p>{c.imageUrl}: <bdi>{review.fields.imageUrl}</bdi></p>}<p className="wd-review-message">{review.kind==='text'?review.fields.message:review.fields.caption||c.noCaption}</p></>:<p>{c.connectionPhone}: <bdi>{review.kind==='save'?review.verifiedPhone:selected?.phoneNumber||c.unavailable}</bdi></p>}</div>}
    {actionError&&<p role="alert">{actionError}</p>}<DialogFooter><button type="button" className="wd-button" disabled={running} onClick={()=>setReview(null)}>{c.cancel}</button><button type="button" className="wd-button wd-primary" disabled={running||!!actionError} onClick={()=>void confirm()}>{running?c.working:c.confirm}</button></DialogFooter>
  </DialogContent></Dialog>
 </section>;
}
