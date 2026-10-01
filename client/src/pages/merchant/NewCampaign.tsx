import { useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { campaignReportId } from '@/lib/campaign-report-navigation';
import { CampaignEditorWorkspace } from '@/components/merchant/CampaignEditorWorkspace';
import { WorkspaceState, workspaceFailureKind } from '@/components/merchant/WorkspaceState';

export default function NewCampaign() {
  const [editing, params] = useRoute('/merchant/campaigns/:id/edit');
  const id = editing ? campaignReportId(params?.id) : null, valid = !editing || !!id;
  const user = trpc.auth.me.useQuery(undefined, { enabled: valid, retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false });
  const merchant = trpc.merchants.getCurrent.useQuery(undefined, { enabled: valid && !!user.data?.id && !user.error && !user.isFetching, retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false });
  const retry = () => { void user.refetch(); void merchant.refetch(); }, error = user.error || merchant.error;
  if (!valid) return <WorkspaceState kind="missing" />;
  if (error) return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={retry} />;
  if (user.isLoading || user.isFetching || merchant.isLoading || merchant.isFetching) return <WorkspaceState kind="loading" />;
  if (!user.data?.id || !merchant.data?.id) return <WorkspaceState kind={!user.data?.id ? 'session' : 'missing'} onRetry={retry} />;
  return <CampaignEditorWorkspace key={`${user.data.id}:${merchant.data.id}:${id ?? 'new'}`} actorId={user.data.id} merchantId={merchant.data.id} campaignId={id ?? undefined} />;
}
