import { trpc } from '@/lib/trpc';
import { ReviewWorkspace } from './ReviewWorkspace';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import type { ReviewKind } from '@shared/review-workspace';
export function ReviewPage({ kind }: { kind: ReviewKind }) {
  const user = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 0, refetchOnMount: 'always' });
  const merchant = trpc.merchants.workspaceIdentity.useQuery(undefined, { retry: false, staleTime: 0, refetchOnMount: 'always', enabled: !!user.data?.id && !user.error && !user.isFetching });
  const error = user.error || merchant.error, refresh = () => { void user.refetch(); void merchant.refetch(); };
  if (error) return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh} />;
  if (user.isLoading || user.isFetching || merchant.isLoading || merchant.isFetching) return <WorkspaceState kind="loading" />;
  if (!user.data?.id || !merchant.data?.id || merchant.data.actorId !== user.data.id) return <WorkspaceState kind={!user.data?.id ? 'session' : 'missing'} onRetry={refresh} />;
  return <ReviewWorkspace key={`${user.data.id}:${merchant.data.id}:${kind}`} actorId={user.data.id} merchantId={merchant.data.id} kind={kind} />;
}
