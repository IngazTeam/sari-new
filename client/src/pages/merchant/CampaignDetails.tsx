import {useParams} from 'wouter';
import {trpc} from '@/lib/trpc';
import {campaignReportId} from '@/lib/campaign-report-navigation';
import {CampaignDetailsWorkspace} from '@/components/merchant/CampaignDetailsWorkspace';
import {WorkspaceState,workspaceFailureKind} from '@/components/merchant/WorkspaceState';

export default function CampaignDetails(){
  const params=useParams(),id=campaignReportId(params.id);
  const user=trpc.auth.me.useQuery(undefined,{enabled:!!id,retry:false,staleTime:0,refetchOnMount:'always'});
  const merchant=trpc.merchants.getCurrent.useQuery(undefined,{enabled:!!id&&!!user.data?.id&&!user.error&&!user.isFetching,retry:false,staleTime:0,refetchOnMount:'always'});
  const retry=()=>{void user.refetch();void merchant.refetch();},error=user.error||merchant.error;
  if(!id)return <WorkspaceState kind="missing"/>;
  if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={retry}/>;
  if(user.isLoading||user.isFetching||merchant.isLoading||merchant.isFetching)return <WorkspaceState kind="loading"/>;
  if(!user.data?.id||!merchant.data?.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={retry}/>;
  return <CampaignDetailsWorkspace key={`${user.data.id}:${merchant.data.id}:${id}`} actorId={user.data.id} merchantId={merchant.data.id} campaignId={id}/>;
}
