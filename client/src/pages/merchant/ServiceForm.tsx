import {useParams} from 'wouter';
import {trpc} from '@/lib/trpc';
import {serviceRouteId} from '@/lib/service-editor-form';
import {ServiceEditorWorkspace} from '@/components/merchant/ServiceEditorWorkspace';
import {WorkspaceState,workspaceFailureKind} from '@/components/merchant/WorkspaceState';
export default function ServiceForm(){
 const params=useParams(),id=serviceRouteId(params.id),user=trpc.auth.me.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always'});
 const merchant=trpc.merchants.workspaceIdentity.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always',enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const refresh=()=>{void user.refetch();void merchant.refetch();},error=user.error||merchant.error;
 if(id===null)return <WorkspaceState kind="missing"/>;
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||user.isFetching||merchant.isLoading||merchant.isFetching)return <WorkspaceState kind="loading"/>;
 if(!user.data?.id || !merchant.data?.id || merchant.data.actorId !== user.data.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 return <ServiceEditorWorkspace key={user.data.id+':'+merchant.data.id+':'+(id??'new')} actorId={user.data.id} merchantId={merchant.data.id} serviceId={id}/>;
}