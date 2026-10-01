import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {z} from 'zod';
import {Link} from 'wouter';
import {RefreshCw,Link2} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import {conversationConnectionStatus,conversationConnectionDiagnosis} from '@shared/conversation-connection';

const imported=z.object({success:z.literal(true),chatsImported:z.number().int().nonnegative().safe(),messagesImported:z.number().int().nonnegative().safe(),totalChats:z.number().int().nonnegative().safe(),errors:z.array(z.string()).max(5).optional()}).strict().refine(v=>v.totalChats===v.chatsImported);
type Props={merchantId:number;actorUserId:number};
export function ConversationConnection(props:Props){return <ScopedConnection key={`${props.actorUserId}:${props.merchantId}`} {...props}/>;}
function ScopedConnection({merchantId,actorUserId}:Props){
  const {t}=useTranslation();
  const [open,setOpen]=useState(false);
  const [working,setWorking]=useState<'repair'|'import'|null>(null),[needsRefresh,setNeedsRefresh]=useState(false);
  const [notice,setNotice]=useState<{kind:'ok'|'fixed'|'disconnected'|'broken'|'no_instance'|'api_error'|'unsupported'|'imported'|'partial'|'failed';chats?:number;messages?:number}|null>(null);
  const query=trpc.conversations.connectionStatus.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always',refetchInterval:working?false:60000});
  const parsed=conversationConnectionStatus.safeParse(query.data);
  const matches=parsed.success&&parsed.data.merchantId===merchantId&&parsed.data.actorUserId===actorUserId;
  const data=matches&&query.isFetchedAfterMount&&!query.error&&parsed.success?parsed.data:null;
  const basis=data?JSON.stringify({merchantId,actorUserId,instanceId:data.instanceId,provider:data.provider,state:data.state,canManage:data.canManage,phone:data.phoneNumber}):null;
  const live=useRef(true),lock=useRef(false),latestBasis=useRef(basis),epoch=useRef(0);
  if(latestBasis.current!==basis){latestBasis.current=basis;epoch.current++;}
  useEffect(()=>{live.current=true;return()=>{live.current=false;epoch.current++;};},[]);
  useEffect(()=>{setNotice(null);},[basis]);
  const repair=trpc.conversations.diagnoseWebhook.useMutation({retry:false});
  const sync=trpc.conversations.syncFromWhatsApp.useMutation({retry:false});
  const utils=trpc.useUtils();
  const isCurrent=(revision:number)=>live.current&&epoch.current===revision;
  const refresh=async()=>{
    if(lock.current)return;setNotice(null);
    try{const response=await query.refetch();if(!live.current)return;const value=conversationConnectionStatus.safeParse(response.data);
      setNeedsRefresh(Boolean(response.error||response.isError||!value.success||value.data.merchantId!==merchantId||value.data.actorUserId!==actorUserId));
    }catch{if(live.current)setNeedsRefresh(true);}
  };
  const refreshMessages=()=>{
    void utils.conversations.list.invalidate();void utils.conversations.listRecent.invalidate();void utils.conversations.count.invalidate();
    void utils.conversations.getMessages.invalidate();void utils.conversations.messageHistory.invalidate();void utils.conversations.handoffSnapshot.invalidate();
  };
  const run=async(action:'repair'|'import')=>{
    if(lock.current||needsRefresh||!data||!data.canManage||!data.connected||data.provider!=='green_api'||query.isFetching)return;
    lock.current=true;setWorking(action);setNotice(null);const revision=epoch.current;
    try{
      if(action==='repair'){
        const value=conversationConnectionDiagnosis.parse(await repair.mutateAsync());if(!isCurrent(revision))return;
        if(value.merchantId!==merchantId||value.actorUserId!==actorUserId||value.instanceId!==data.instanceId||value.provider!==data.provider)throw Error('Connection scope mismatch');
        setNotice({kind:value.status});setNeedsRefresh(!['ok','fixed'].includes(value.status));
      }else{
        const value=imported.parse(await sync.mutateAsync());if(!isCurrent(revision))return;
        setNotice({kind:value.errors?.length?'partial':'imported',chats:value.chatsImported,messages:value.messagesImported});setNeedsRefresh(Boolean(value.errors?.length));refreshMessages();
      }
    }catch{if(isCurrent(revision)){setNotice({kind:'failed'});setNeedsRefresh(true);if(action==='import')refreshMessages();}}
    finally{lock.current=false;if(live.current)setWorking(null);}
  };
  const loading=query.isLoading||(!query.isFetchedAfterMount&&query.isFetching);
  const state=data?.state??'check_failed';
  const states={authorized:t('merchantUx.conversationConnection.authorized'),disconnected:t('merchantUx.conversationConnection.disconnected'),no_instance:t('merchantUx.conversationConnection.noInstance'),check_failed:t('merchantUx.conversationConnection.checkFailed'),configuration_missing:t('merchantUx.conversationConnection.configurationMissing'),unsupported:t('merchantUx.conversationConnection.unsupported')};
  const noticeText=notice?.kind==='ok'?t('merchantUx.conversationConnection.verified'):notice?.kind==='fixed'?t('merchantUx.conversationConnection.fixed'):notice?.kind==='imported'?t('merchantUx.conversationConnection.imported',{chats:notice.chats,messages:notice.messages}):notice?.kind==='partial'?t('merchantUx.conversationConnection.partial',{chats:notice.chats,messages:notice.messages}):notice?.kind==='disconnected'?states.disconnected:notice?.kind==='no_instance'?states.no_instance:notice?.kind==='unsupported'?states.unsupported:notice?.kind==='broken'?t('merchantUx.conversationConnection.unconfirmed'):t('merchantUx.conversationConnection.failed');
  const disabled=Boolean(working||query.isFetching||needsRefresh||!data?.connected||data.provider!=='green_api');
  const shortState=state==='authorized'?t('merchantUx.conversationConnection.connectedShort'):state==='disconnected'?t('merchantUx.conversationConnection.disconnectedShort'):state==='no_instance'?t('merchantUx.conversationConnection.noInstanceShort'):t('merchantUx.conversationConnection.checkShort');
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" data-connection-open variant="outline" className="h-auto min-h-11 gap-2 whitespace-normal"><Link2 className="h-4 w-4 shrink-0"/>{t('merchantUx.conversationConnection.title')}<span className="text-xs text-muted-foreground">{loading?t('merchantUx.conversationConnection.checkingShort'):shortState}</span></Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto" showCloseButton={false}>
      <DialogHeader className="text-start sm:text-start"><DialogTitle>{t('merchantUx.conversationConnection.title')}</DialogTitle><DialogDescription>{t('merchantUx.conversationConnection.scope')}</DialogDescription></DialogHeader>
      <section className="min-w-0 space-y-3" aria-label={t('merchantUx.conversationConnection.title')} data-conversation-connection>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><Link2 className="mt-0.5 h-4 w-4 shrink-0"/><div className="min-w-0"><h2 className="text-sm font-semibold">{t('merchantUx.conversationConnection.title')}</h2><p role="status" className="mt-1 text-sm leading-relaxed" data-connection-state={loading?'loading':state}>{loading?t('merchantUx.conversationConnection.loading'):states[state]}</p>{data?.phoneNumber&&<p dir="ltr" className="mt-1 w-fit break-all text-xs text-muted-foreground">{data.phoneNumber}</p>}</div></div>
      <Button type="button" variant="outline" data-connection-refresh className="h-auto min-h-11 gap-2 whitespace-normal" disabled={Boolean(working||query.isFetching)} onClick={()=>void refresh()}><RefreshCw className={`h-4 w-4 shrink-0 ${query.isFetching?'animate-spin':''}`}/>{t('merchantUx.conversationConnection.refresh')}</Button></div>
    {data?.canManage?<div className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <div className="space-y-3"><div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal"><Link href="/merchant/whatsapp-instances">{t('merchantUx.conversationConnection.numbers')}</Link></Button>
        <Button type="button" data-connection-repair variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={disabled} onClick={()=>void run('repair')}>{working==='repair'?t('merchantUx.conversationConnection.repairing'):t('merchantUx.conversationConnection.repair')}</Button>
        <Button type="button" data-connection-import className="h-auto min-h-11 whitespace-normal" disabled={disabled} onClick={()=>void run('import')}>{working==='import'?t('merchantUx.conversationConnection.importing'):t('merchantUx.conversationConnection.import')}</Button>
      </div><p className="text-xs leading-relaxed text-muted-foreground">{t('merchantUx.conversationConnection.importScope')}</p>
      {data.provider&&data.provider!=='green_api'&&<p className="text-sm">{t('merchantUx.conversationConnection.greenOnly')}</p>}</div>
    </div>:data&&!data.canManage?<p className="text-xs text-muted-foreground">{t('merchantUx.conversationConnection.readOnly')}</p>:null}
    {working&&<p role="status" className="text-sm">{working==='repair'?t('merchantUx.conversationConnection.repairing'):t('merchantUx.conversationConnection.importing')}</p>}
    {notice&&<p role={['ok','fixed','imported'].includes(notice.kind)?'status':'alert'} className="text-sm leading-relaxed" data-connection-notice={notice.kind}>{noticeText}</p>}
    {needsRefresh&&<p className="text-sm text-muted-foreground">{t('merchantUx.conversationConnection.refreshFirst')}</p>}
  </section><DialogClose asChild><Button type="button" data-connection-close variant="outline" className="min-h-11">{t('common.close')}</Button></DialogClose></DialogContent></Dialog>;
}
