import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {z} from 'zod';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Sparkles, RefreshCw, Copy, Check, ChevronDown, ChevronUp} from 'lucide-react';
import {cn} from '@/lib/utils';
import {toast} from 'sonner';
import {generatedSuggestions, type suggestionHints} from '@shared/reply-suggestions';

interface AISuggestionsProps {
  merchantId: number;
  actorUserId: number;
  conversationId: number;
  customerPhone: string;
  version: number;
  messages: Array<{id:number;content:string;direction:'incoming'|'outgoing';senderType?:string|null;timestamp?:string}>;
  draftText: string;
  onSelectSuggestion: (text: string, expectedDraft: string) => boolean;
  disabled?: boolean;
  context?: z.infer<typeof suggestionHints>;
  className?: string;
  compact?: boolean;
}
type Result=z.infer<typeof generatedSuggestions>;
export function AISuggestions(props:AISuggestionsProps){
  return <ScopedSuggestions key={`${props.actorUserId}:${props.merchantId}:${props.conversationId}`} {...props}/>;
}
function ScopedSuggestions({merchantId,actorUserId,conversationId,customerPhone,version,messages,draftText,onSelectSuggestion,disabled=false,context,className,compact=false}:AISuggestionsProps){
  const {t}=useTranslation();
  const [expanded,setExpanded]=useState(!compact),[pending,setPending]=useState(false);
  const [data,setData]=useState<{basis:string;value:Result}|null>(null);
  const [notice,setNotice]=useState<'failed'|'stale'|'applied'|'draftChanged'|'applyFailed'|null>(null);
  const [choice,setChoice]=useState<{text:string;draft:string}|null>(null);
  const [copiedId,setCopiedId]=useState<number|null>(null);
  const basis=JSON.stringify({customerPhone,version,messages,context});
  const live=useRef(true),epoch=useRef(0),lastBasis=useRef(basis),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const current=useRef({draftText,disabled,onSelectSuggestion});current.current={draftText,disabled,onSelectSuggestion};
  // Increment during render so a late response cannot win before the reset effect, even after A -> B -> A.
  if(lastBasis.current!==basis){lastBasis.current=basis;epoch.current++;busy.current=false;}
  useEffect(()=>{live.current=true;return()=>{live.current=false;epoch.current++;if(timer.current)clearTimeout(timer.current);};},[]);
  useEffect(()=>{setData(null);setChoice(null);setPending(false);setNotice(null);setCopiedId(null);if(timer.current)clearTimeout(timer.current);},[basis]);
  const result=data?.basis===basis?data.value:null;
  const lastMessageId=Math.max(0,...messages.map(m=>m.id));
  const mutation=trpc.aiSuggestions.generateSuggestions.useMutation({retry:false});
  const valid=(request:number)=>live.current&&epoch.current===request;
  const labels={friendly:t('merchantUx.replySuggestions.friendly'),professional:t('merchantUx.replySuggestions.professional'),brief:t('merchantUx.replySuggestions.brief'),detailed:t('merchantUx.replySuggestions.detailed')};
  const generate=async()=>{
    if(busy.current||disabled||!messages.length)return;
    const request=++epoch.current;busy.current=true;setPending(true);setData(null);setChoice(null);setNotice(null);setCopiedId(null);
    try{
      const parsed=generatedSuggestions.parse(await mutation.mutateAsync({conversationId,lastMessages:[],context}));
      if(!valid(request))return;
      if(parsed.context.merchantId!==merchantId||parsed.context.actorUserId!==actorUserId||parsed.context.conversationId!==conversationId||parsed.context.lastMessageId!==lastMessageId||parsed.context.version!==version){setNotice('stale');return;}
      setData({basis,value:parsed});
    }catch(error){if(valid(request))setNotice((error as {data?:{code?:string}})?.data?.code==='CONFLICT'?'stale':'failed');}
    finally{if(valid(request)){busy.current=false;setPending(false);}}
  };
  const collapse=()=>{epoch.current++;busy.current=false;setPending(false);setData(null);setChoice(null);setNotice(null);setCopiedId(null);setExpanded(false);if(timer.current)clearTimeout(timer.current);};
  const copy=async(text:string,id:number)=>{
    if(!result||disabled)return;const request=epoch.current;
    try{await navigator.clipboard.writeText(text);if(!valid(request))return;setCopiedId(id);toast.success(t('compAISuggestionsPage.text0'));if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{if(valid(request))setCopiedId(null);},2000);}
    catch{if(valid(request))toast.error(t('compAISuggestionsPage.copyFailed'));}
  };
  const apply=(text:string,expectedDraft:string)=>{
    if(!result||busy.current||current.current.disabled)return;
    if(current.current.draftText!==expectedDraft){setChoice(null);setNotice('draftChanged');return;}
    try{if(!current.current.onSelectSuggestion(text,expectedDraft)){setNotice('applyFailed');return;}setChoice(null);setNotice('applied');}
    catch{setNotice('applyFailed');}
  };
  const choose=(text:string)=>{if(!result||disabled)return;setNotice(null);if(draftText.length)setChoice({text,draft:draftText});else apply(text,'');};
  const combined=choice?`${choice.draft}\n\n${choice.text}`:'';
  const draftChanged=choice!==null&&choice.draft!==draftText;
  const copyLabel=(type:keyof typeof labels)=>t('merchantUx.actions.copyNamed',{name:labels[type]});
  if(compact&&!expanded)return <Button type="button" variant="outline" className={cn('h-auto min-h-11 gap-2 whitespace-normal',className)} onClick={()=>setExpanded(true)}><Sparkles className="h-4 w-4 shrink-0"/>{t('aISuggestions.auto_0')}<ChevronDown className="h-4 w-4 shrink-0"/></Button>;
  return <Card className={cn('min-w-0 border-primary/20',className)} data-ai-suggestions><CardContent className="space-y-3 p-3 sm:p-4">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 shrink-0 text-primary"/>{t('compAISuggestionsPage.text2')}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('merchantUx.replySuggestions.scope')}</p></div>
      {compact&&<Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={t('compAISuggestionsPage.collapse')} onClick={collapse}><ChevronUp className="h-4 w-4"/></Button>}</div>
    <Button type="button" variant="outline" data-ai-generate className="h-auto min-h-11 w-full gap-2 whitespace-normal sm:w-auto" disabled={pending||disabled||!messages.length} onClick={()=>void generate()}>
      {pending?<RefreshCw className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}{pending?t('merchantUx.replySuggestions.generating'):result?t('compAISuggestionsPage.text4'):t('aISuggestions.auto_2')}</Button>
    {pending&&<p role="status" className="text-sm">{t('merchantUx.replySuggestions.generating')}</p>}
    {!pending&&!result&&!notice&&<p className="text-sm text-muted-foreground">{t('aISuggestions.auto_1')}</p>}
    {notice&&<p role={notice==='applied'?'status':'alert'} className="text-sm leading-relaxed" data-ai-notice={notice}>{notice==='failed'?t('merchantUx.replySuggestions.failed'):notice==='stale'?t('merchantUx.replySuggestions.stale'):notice==='applied'?t('merchantUx.replySuggestions.applied'):notice==='draftChanged'?t('merchantUx.replySuggestions.draftChanged'):t('merchantUx.replySuggestions.applyFailed')}</p>}
    {result&&<div className="space-y-2">{result.suggestions.map(suggestion=><div key={suggestion.id} className="flex items-start gap-1 rounded-lg border bg-muted/20 p-2">
      <button type="button" data-ai-select={suggestion.id} disabled={disabled} className="flex min-h-11 min-w-0 flex-1 flex-col items-start gap-2 rounded p-1 text-start hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" onClick={()=>choose(suggestion.text)}>
        <Badge variant="secondary">{labels[suggestion.type]}</Badge><span dir="auto" className="w-full whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{suggestion.text}</span></button>
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" disabled={disabled} aria-label={copyLabel(suggestion.type)} onClick={()=>void copy(suggestion.text,suggestion.id)}>{copiedId===suggestion.id?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}</Button>
    </div>)}</div>}
    {choice&&result&&<section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3" aria-label={t('merchantUx.replySuggestions.reviewDraft')} data-ai-choice>
      <h4 className="text-sm font-semibold">{t('merchantUx.replySuggestions.reviewDraft')}</h4><p className="text-sm leading-relaxed">{t('merchantUx.replySuggestions.existingDraft')}</p>
      <p dir="auto" className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]" tabIndex={0}>{choice.text}</p>
      {draftChanged&&<p role="alert" className="text-sm">{t('merchantUx.replySuggestions.draftChanged')}</p>}
      {combined.length>4096&&<p className="text-sm">{t('merchantUx.replySuggestions.tooLong')}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" data-ai-append className="h-auto min-h-11 whitespace-normal" disabled={disabled||draftChanged||combined.length>4096} onClick={()=>apply(combined,choice.draft)}>{t('merchantUx.replySuggestions.append')}</Button>
        <Button type="button" data-ai-replace variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={disabled||draftChanged} onClick={()=>apply(choice.text,choice.draft)}>{t('merchantUx.replySuggestions.replace')}</Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={()=>setChoice(null)}>{t('common.cancel')}</Button></div>
    </section>}
  </CardContent></Card>;
}

interface QuickRepliesProps{messageType:'greeting'|'product_inquiry'|'price_inquiry'|'order_status'|'complaint'|'thanks'|'goodbye'|'general';onSelect:(text:string)=>void;className?:string;}
export function QuickReplies({messageType,onSelect,className}:QuickRepliesProps){
  const {t}=useTranslation();
  const query=trpc.aiSuggestions.getQuickSuggestions.useQuery({messageType},{retry:false});
  if(query.isLoading)return <p role="status">{t('common.loading')}</p>;
  if(query.error||!query.data)return <div role="alert"><p>{t('merchantUx.replySuggestions.quickFailed')}</p><Button type="button" variant="outline" className="min-h-11" disabled={query.isFetching} onClick={()=>void query.refetch()}>{t('merchantUx.replySuggestions.retry')}</Button></div>;
  return <div className={cn('flex flex-wrap gap-2',className)}>{query.data.suggestions.map((suggestion,index)=><Button type="button" key={index} variant="outline" className="h-auto min-h-11 max-w-full gap-2 whitespace-normal text-start text-xs" onClick={()=>onSelect(suggestion.text)}><span aria-hidden>{suggestion.emoji}</span><span className="min-w-0 break-words [overflow-wrap:anywhere]">{suggestion.text}</span></Button>)}</div>;
}
export default AISuggestions;
