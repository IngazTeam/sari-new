import {readZidCallbackParameters,scrubZidCallbackParameters} from '@/lib/zid-oauth-navigation';
import {useEffect,useRef,useState} from 'react';
import {Link} from 'wouter';
import {useTranslation} from 'react-i18next';
import {CheckCircle,Loader2,AlertCircle} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {zidRegisterReceipt} from '@shared/zid-connection';
import {scopedZidWorkspace} from '@/lib/zid-workspace';
import {zidWorkspaceLabels} from '@/lib/zid-workspace-labels';
import '@/styles/service-catalog-workspace.css';
import '@/styles/zid-workspace.css';
const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
export default function ZidCallback(){
 const {t,i18n}=useTranslation(),copy=zidWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
 const [parameters]=useState(readZidCallbackParameters),[status,setStatus]=useState<'loading'|'success'|'error'|'invalid'>('loading');
 const user=trpc.auth.me.useQuery(undefined,fresh),merchant=trpc.merchants.getCurrent.useQuery(undefined,{...fresh,enabled:!!user.data?.id&&!user.error});
 const mutation=trpc.zid.handleOAuthCallback.useMutation({retry:false}),utils=trpc.useUtils();
 const alive=useRef(true),started=useRef(false),scope=useRef(''),attemptScope=useRef<string|null>(null);scope.current=user.data?.id+':'+merchant.data?.id;
 useEffect(()=>{alive.current=true;scrubZidCallbackParameters();return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(started.current)return;
  const code=parameters.get('code'),state=parameters.get('state');
  if(parameters.has('error')||parameters.getAll('code').length!==1||parameters.getAll('state').length!==1||!code||code.length>4096||!state||!/^[A-Za-z0-9_-]{43}$/.test(state)){started.current=true;setStatus('invalid');return;}
  if(user.error||merchant.error){started.current=true;setStatus('error');return;}
  if(user.isLoading||merchant.isLoading||user.isFetching||merchant.isFetching)return;
  if(!user.data?.id||!merchant.data?.id){started.current=true;setStatus('error');return;}
  started.current=true;const actorId=user.data.id,merchantId=merchant.data.id,identity=scope.current;attemptScope.current=identity;
  void (async()=>{try{
   const receipt=zidRegisterReceipt.strip().parse(await mutation.mutateAsync({code,state}));
   if(!alive.current||scope.current!==identity)return;
   if(receipt.actorId!==actorId||receipt.merchantId!==merchantId)throw Error('Unconfirmed scope');
   const current=scopedZidWorkspace(await utils.zid.workspace.fetch(),actorId,merchantId);
   if(!alive.current||scope.current!==identity)return;
   if(!current?.present||current.revision!==receipt.revision||current.storeId!==receipt.storeId)throw Error('Unconfirmed connection');
   setStatus('success');
  }catch{if(alive.current&&scope.current===identity)setStatus('error');}})();
 },[user.data?.id,merchant.data?.id,user.error,merchant.error,user.isLoading,merchant.isLoading,user.isFetching,merchant.isFetching,parameters]);
 const shown=attemptScope.current&&attemptScope.current!==scope.current?'error':status;
 return <div className="service-catalog zid-workspace" dir={locale==='ar'?'rtl':'ltr'} data-zid-callback><header className="sc-header"><div><p className="sc-eyebrow">{copy.eyebrow}</p><h1>{copy.callbackTitle}</h1></div></header><section className="zd-panel"><div role={shown==='loading'||shown==='success'?'status':'alert'} aria-live="polite">{shown==='loading'?<Loader2 aria-hidden="true" className="animate-spin"/>:shown==='success'?<CheckCircle aria-hidden="true"/>:<AlertCircle aria-hidden="true"/>}<p>{copy[shown==='loading'?'callbackLoading':shown==='success'?'callbackSuccess':shown==='invalid'?'callbackInvalid':'callbackError']}</p></div><Link href="/merchant/zid/settings">{copy.backSettings}</Link></section></div>;
}
