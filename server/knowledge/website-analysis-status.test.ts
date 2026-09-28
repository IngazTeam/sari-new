import { expect, it } from 'vitest';
import { ANALYSIS_RESULT_TTL_MS, ANALYSIS_RUNNING_TTL_MS, readWebsiteAnalysisStatus, type WebsiteAnalysisStatus } from './website-analysis-status';
it.each(['completed', 'error'] as const)('retains %s for multiple reads and isolates merchants', status => {
  const entries: Record<number, WebsiteAnalysisStatus> = { 1: { status, startedAt: 100, result: { score: 70 }, error: 'Failure' } };
  const first = readWebsiteAnalysisStatus(entries, 1, 110);
  expect(readWebsiteAnalysisStatus(entries, 1, 120)).toEqual(first);
  expect(entries[1]).toBeDefined(); expect(readWebsiteAnalysisStatus(entries, 2, 120)).toEqual({ status: 'idle' });
});
it('expires completed results after retention and times out a single running entry', () => {
  const entries: Record<number, WebsiteAnalysisStatus> = { 1: { status: 'running', startedAt: 0 } };
  const now = ANALYSIS_RUNNING_TTL_MS + 1;
  expect(readWebsiteAnalysisStatus(entries, 1, now).status).toBe('error');
  expect(readWebsiteAnalysisStatus(entries, 1, now + 1).status).toBe('error');
  expect(readWebsiteAnalysisStatus(entries, 1, now + ANALYSIS_RESULT_TTL_MS + 1).status).toBe('idle');
});
it('does not let result payload override the authoritative status', () => {
  expect(readWebsiteAnalysisStatus({ 1: { status: 'completed', startedAt: 10, result: { status: 'running' } } }, 1, 11).status).toBe('completed');
});
