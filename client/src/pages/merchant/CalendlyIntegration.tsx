import {trpc} from '@/lib/trpc';
import {calendlyFresh} from '@/components/merchant/CalendlyOperationPanel';
import {CalendlyWorkspace} from '@/components/merchant/CalendlyWorkspace';
import {WorkspaceState,workspaceFailureKind} from '@/components/merchant/WorkspaceState';
export default function CalendlyIntegration(){
 const user=trpc.auth.me.useQuery(undefined,calendlyFresh),merchant=trpc.merchants.workspaceIdentity.useQuery(undefined,{...calendlyFresh,enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const refresh=()=>{void user.refetch();void merchant.refetch();},error=user.error||merchant.error;
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||user.isFetching||!!user.data?.id&&(merchant.isLoading||merchant.isFetching))return <WorkspaceState kind="loading"/>;
 if(!user.data?.id || !merchant.data?.id || merchant.data.actorId !== user.data.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 return <CalendlyWorkspace key={user.data.id+':'+merchant.data.id} actorId={user.data.id} merchantId={merchant.data.id}/>;
}
