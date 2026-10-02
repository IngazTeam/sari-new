import {useRef,useState} from 'react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {scopedWooWorkspace} from '@/lib/woocommerce-workspace';
import type {WooCopy} from '@/lib/woocommerce-workspace-labels';
import {wooFresh,type WooOperationController} from './WooOperationPanel';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
export function WooQuickSync({actorId,merchantId,resource,copy:c,locale,operation:o}:{actorId:number;merchantId:number;resource:'products'|'orders';copy:WooCopy;locale:'ar'|'en';operation:WooOperationController}){
 const query=trpc.woocommerce.getWorkspace.useQuery(undefined,wooFresh),mutation=trpc.woocommerce.requestReviewedSync.useMutation({retry:false}),data=query.error?null:scopedWooWorkspace(query.data,actorId,merchantId);
 const [revision,setRevision]=useState<string|null>(null),opener=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null),title=resource==='products'?c.syncProducts:c.syncOrders,ready=data?.state==='configured'&&data.hasConsumerKey&&data.hasConsumerSecret;
 return <section className="wc-panel"><h2 ref={heading} tabIndex={-1}>{title}</h2><p className="sc-muted">{c.syncHint}</p>{query.isLoading?<WorkspaceState inline kind="loading"/>:!data?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>void query.refetch()}/>:<>{!ready&&<p>{c.notReady}</p>}<div><Button ref={opener} disabled={!ready||!o.canStart||query.isFetching} onClick={()=>setRevision(data.revision)}>{title}</Button></div></>}
  <Dialog open={!!revision} onOpenChange={open=>{if(!open&&!o.busy)setRevision(null);}}><DialogContent className="sc-dialog wc-dialog" closeLabel={c.close} showCloseButton={!o.busy} dir={locale==='ar'?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();(opener.current?.isConnected&&!opener.current.disabled?opener.current:heading.current)?.focus();}} onEscapeKeyDown={event=>{if(o.busy)event.preventDefault();}} onInteractOutside={event=>{if(o.busy)event.preventDefault();}}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{c.syncHint}</DialogDescription></DialogHeader>{revision!==data?.revision&&<p role="alert">{c.changed}</p>}<DialogFooter><Button variant="outline" disabled={o.busy} onClick={()=>setRevision(null)}>{c.cancel}</Button><Button disabled={!ready||!o.canStart||query.isFetching||revision!==data?.revision} onClick={async()=>{if(!revision||!ready||revision!==data?.revision||query.isFetching)return;await o.execute(resource==='products'?'sync_products':'sync_orders',revision,requestId=>mutation.mutateAsync({requestId,revision,resource}));setRevision(null);}}>{o.busy?c.working:c.confirm}</Button></DialogFooter></DialogContent></Dialog>
 </section>;
}
