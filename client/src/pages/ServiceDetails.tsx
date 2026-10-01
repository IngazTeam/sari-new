import {useParams} from 'wouter';
import {trpc} from '@/lib/trpc';
import {serviceRouteId} from '@/lib/service-editor-form';
import {ServiceDetailsWorkspace} from '@/components/merchant/ServiceDetailsWorkspace';
import {WorkspaceState,workspaceFailureKind} from '@/components/merchant/WorkspaceState';
export default function ServiceDetails(){
 const params=useParams(),id=serviceRouteId(params.id),user=trpc.auth.me.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always'});
 const merchant=trpc.merchants.getCurrent.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always',enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const refresh=()=>{void user.refetch();void merchant.refetch();},error=user.error||merchant.error;
 if(!id)return <WorkspaceState kind="missing"/>;
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||user.isFetching||merchant.isLoading||merchant.isFetching)return <WorkspaceState kind="loading"/>;
 if(!user.data?.id||!merchant.data?.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 return <ServiceDetailsWorkspace key={user.data.id+':'+merchant.data.id+':'+id} actorId={user.data.id} merchantId={merchant.data.id} serviceId={id}/>;
}
