import {trpc} from '@/lib/trpc';
import {StaffWorkspace} from '@/components/merchant/StaffWorkspace';
import {WorkspaceState,workspaceFailureKind} from '@/components/merchant/WorkspaceState';
export default function StaffManagement(){
 const user=trpc.auth.me.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always'});
 const merchant=trpc.merchants.getCurrent.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always',enabled:!!user.data?.id&&!user.error&&!user.isFetching});
 const refresh=()=>{void user.refetch();void merchant.refetch();},error=user.error||merchant.error;
 if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
 if(user.isLoading||user.isFetching||merchant.isLoading||merchant.isFetching)return <WorkspaceState kind="loading"/>;
 if(!user.data?.id||!merchant.data?.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
 return <StaffWorkspace key={user.data.id+':'+merchant.data.id} actorId={user.data.id} merchantId={merchant.data.id}/>;
}