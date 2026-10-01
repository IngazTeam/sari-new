import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { knowledgeCacheEpoch } from './knowledge-workspace-cache';
import { websiteAnalysisAccepted, websiteAnalysisSnapshot, websiteKnowledgeSummary } from '@shared/website-analysis-tracking';
import type { WebsiteAnalysisIssue } from '@/components/WebsiteAnalysisDialog';

const disabledJob = '00000000-0000-4000-8000-000000000000';

// The caller keys the workspace by confirmed account + merchant. Query inputs
// additionally partition caches, and acknowledgements/results must match scope.
export function useWebsiteAnalysis(scopeKey: string, active: boolean) {
  const merchantId = Number(scopeKey.split(':')[1]);
  const utils = trpc.useUtils();
  const lifetime = useRef(0), mounted = useRef(false), locked = useRef(false);
  const [epoch] = useState(knowledgeCacheEpoch);
  const [jobId, setJobId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [polling, setPolling] = useState(false);
  const [step, setStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<unknown | null>(null);
  const [issue, setIssue] = useState<WebsiteAnalysisIssue>(null);
  const requestedAfter = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; lifetime.current++; };
  }, []);
  const current = (version = lifetime.current) => mounted.current && version === lifetime.current && epoch === knowledgeCacheEpoch();
  const startMutation = trpc.sariBrain.reanalyzeWebsite.useMutation();
  const status = trpc.sariBrain.getAnalysisStatus.useQuery({merchantId, jobId:jobId || disabledJob}, {
    enabled: !!jobId && polling, retry: false, staleTime: 0,
    refetchInterval: query => polling && !query.state.error ? 3000 : false,
  });
  const website = trpc.sariBrain.getWebsiteKnowledge.useQuery({merchantId}, {enabled:active, retry:false, staleTime:0});
  const summary = websiteKnowledgeSummary.safeParse(website.data);
  const websiteLoading = website.isLoading || website.isFetching || !website.isFetchedAfterMount;
  const websiteData = !websiteLoading && !website.isError && summary.success && summary.data.merchantId === merchantId ? summary.data : null;
  const websiteError = website.isError || (!websiteLoading && !websiteData);

  useEffect(() => {
    if (!current() || !polling || !jobId || status.isFetching || status.isError || !status.isFetchedAfterMount || status.dataUpdatedAt < requestedAfter.current) return;
    const parsed = websiteAnalysisSnapshot.safeParse(status.data);
    if (!parsed.success || parsed.data.merchantId !== merchantId || parsed.data.jobId !== jobId) {
      setPolling(false); setIssue('unverified'); return;
    }
    const data = parsed.data;
    if (data.status === 'running') { setStep(data.currentStep || ''); setProgress(data.progress ?? 0); return; }
    setPolling(false);
    if (data.status === 'idle') { setIssue('missing'); return; }
    if (data.status === 'error') { setIssue('failed'); return; }
    setStep('completed'); setProgress(100); setResult(data);
    void utils.sariBrain.getSources.invalidate();
    void utils.sariBrain.getActivityLog.invalidate();
    void utils.sariBrain.getWebsiteKnowledge.invalidate();
    void utils.sariBrain.pageWorkspace.invalidate();
    void utils.sariBrain.getKnowledgeSections.invalidate();
    void utils.sariBrain.getHealthScore.invalidate();
  }, [status.data, status.dataUpdatedAt, status.isFetching, status.isError, status.isFetchedAfterMount, polling, jobId, merchantId]);

  const start = async () => {
    if (!current() || locked.current || polling || issue === 'startUnconfirmed' || issue === 'unverified' || !websiteData?.canManage) return;
    const version = lifetime.current;
    locked.current = true; setDialogOpen(true); setResult(null); setIssue(null); setStep(''); setProgress(0);
    // Generate before dispatch so even an interrupted acknowledgement can be read
    // by its original reference without launching a second analysis.
    let requestId: string;
    try { requestId = crypto.randomUUID(); }
    catch { locked.current = false; setIssue('failed'); return; }
    requestedAfter.current = Date.now(); setJobId(requestId); setPending(true);
    try {
      const accepted = websiteAnalysisAccepted.safeParse(await startMutation.mutateAsync({merchantId, jobId:requestId}));
      if (!current(version)) return;
      if (!accepted.success || accepted.data.merchantId !== merchantId || (!accepted.data.alreadyRunning && accepted.data.jobId !== requestId)) {
        setIssue('startUnconfirmed'); return;
      }
      setJobId(accepted.data.jobId); setPolling(true);
    } catch { if (current(version)) setIssue('startUnconfirmed'); }
    finally { if (current(version)) { locked.current = false; setPending(false); } }
  };
  const readStatus = () => {
    if (!current() || !jobId || pending) return;
    requestedAfter.current = Date.now(); setIssue(null); setPolling(true); void status.refetch();
  };
  return {
    dialogOpen, setDialogOpen, pending, polling, step, progress, result, issue,
    busy: pending || polling || issue === 'startUnconfirmed' || issue === 'unverified',
    hasAttempt: !!jobId, statusError: status.isError, statusFetching:status.isFetching, start, readStatus,
    websiteData, websiteLoading, websiteError, refreshWebsite: () => void website.refetch(),
  };
}
