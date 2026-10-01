export interface WebsiteAnalysisStatus {
  jobId?: string;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  currentStep?: string;
  progress?: number;
  result?: Record<string, unknown>;
  error?: string;
}
export const ANALYSIS_RESULT_TTL_MS = 10 * 60_000;
export const ANALYSIS_RUNNING_TTL_MS = 15 * 60_000;

// Process-local retention: reads never consume a result. Durability across workers/restarts
// requires a persisted job store; an idle response is not a successful completion.
export function cleanupWebsiteAnalysisStatus(entries: Record<number, WebsiteAnalysisStatus>, now = Date.now()) {
  for (const [key, entry] of Object.entries(entries)) {
    if (entry.status === 'running' && now - entry.startedAt > ANALYSIS_RUNNING_TTL_MS) {
      entries[Number(key)] = { jobId: entry.jobId, status: 'error', startedAt: now, error: 'انتهت مهلة التحليل' };
    } else if (entry.status !== 'running' && now - entry.startedAt > ANALYSIS_RESULT_TTL_MS) {
      delete entries[Number(key)];
    }
  }
}

// A late worker must not overwrite a replacement attempt's progress or result.
export function updateWebsiteAnalysisAttempt(entries: Record<number, WebsiteAnalysisStatus>, merchantId: number, jobId: string, patch: Partial<WebsiteAnalysisStatus>) {
  const entry = entries[merchantId];
  if (!entry || entry.jobId !== jobId || entry.status !== 'running') return false;
  entries[merchantId] = { ...entry, ...patch, jobId };
  return true;
}

export function readWebsiteAnalysisAttempt(entries: Record<number, WebsiteAnalysisStatus>, merchantId: number, jobId: string, now = Date.now()) {
  cleanupWebsiteAnalysisStatus(entries, now);
  if (entries[merchantId]?.jobId !== jobId) return { merchantId, jobId, status: 'idle' as const };
  // Correlation fields are authoritative; a provider payload cannot override them.
  return { ...readWebsiteAnalysisStatus(entries, merchantId, now), merchantId, jobId };
}
export function readWebsiteAnalysisStatus(entries: Record<number, WebsiteAnalysisStatus>, merchantId: number, now = Date.now()) {
  cleanupWebsiteAnalysisStatus(entries, now);
  const entry = entries[merchantId];
  if (!entry) return { status: 'idle' as const };
  if (entry.status === 'completed') return { ...entry.result, status: 'completed' as const };
  if (entry.status === 'error') return { status: 'error' as const, error: entry.error };
  return { status: 'running' as const, elapsedMs: now - entry.startedAt, currentStep: entry.currentStep || 'scraping', progress: entry.progress || 0 };
}
