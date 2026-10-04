import {trpc} from '@/lib/trpc';
import {ZidWorkspace} from './ZidWorkspace';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
export function ZidWorkspacePage({view='overview'}:{view?:'overview'|'products'|'history'}){
 const user=trpc.auth.me.useQuery(undefined,fresh),merchant=trpc.merchants.workspaceIdentity.useQuery(undefined,{...fresh,enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const refresh=()=>{void user.refetch();void merchant.refetch();},error=user.error||merchant.error;
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||merchant.isLoading||user.isFetching&&!user.data||merchant.isFetching&&!merchant.data)return <WorkspaceState kind="loading"/>;
 if(!user.data?.id || !merchant.data?.id || merchant.data.actorId !== user.data.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 return <ZidWorkspace key={user.data.id+':'+merchant.data.id+':'+view} actorId={user.data.id} merchantId={merchant.data.id} view={view}/>;
}
