import {trpc} from '@/lib/trpc';
import {SallaWorkspace} from '@/components/merchant/SallaWorkspace';
import {WorkspaceState,workspaceFailureKind} from '@/components/merchant/WorkspaceState';
const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
export default function SallaIntegration(){
 const user=trpc.auth.me.useQuery(undefined,fresh),merchant=trpc.merchants.workspaceIdentity.useQuery(undefined,{...fresh,enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const refresh=()=>{void user.refetch();void merchant.refetch();},error=user.error||merchant.error;
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||merchant.isLoading||user.isFetching&&!user.data||merchant.isFetching&&!merchant.data)return <WorkspaceState kind="loading"/>;
 if(!user.data?.id || !merchant.data?.id || merchant.data.actorId !== user.data.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 return <SallaWorkspace key={user.data.id+':'+merchant.data.id} actorId={user.data.id} merchantId={merchant.data.id}/>;
}
