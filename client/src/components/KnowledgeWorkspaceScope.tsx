import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { knowledgeWorkspaceKey } from '@/lib/knowledge-workspace-cache';
import { Button } from './ui/button';

// Use identities confirmed by the API, never user-info or a selected-store hint.
export function KnowledgeWorkspaceScope({ slot, children }: { slot: string; children: (key: string) => ReactNode }) {
  const { t } = useTranslation();
  const user = trpc.auth.me.useQuery();
  const merchant = trpc.merchants.getCurrent.useQuery();
  if (user.isLoading || merchant.isLoading) return <p role="status">{t('merchantUx.knowledgeDraft.loading')}</p>;
  if (user.error || merchant.error || !user.data?.id || !merchant.data?.id) return <div role="alert" className="space-y-3 rounded-xl border p-4"><p>{t('merchantUx.knowledgeDraft.scopeError')}</p><Button variant="outline" onClick={() => { void user.refetch(); void merchant.refetch(); }}>{t('merchantUx.knowledgeIntake.retry')}</Button></div>;
  return children(knowledgeWorkspaceKey(user.data.id, merchant.data.id, slot));
}
