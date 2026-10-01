import { expect, it } from 'vitest';
import { websiteAnalysisAttempt, websiteAnalysisAccepted, websiteKnowledgeSummary } from '../shared/website-analysis-tracking';
import { readWebsiteAnalysisAttempt, updateWebsiteAnalysisAttempt, ANALYSIS_RUNNING_TTL_MS, type WebsiteAnalysisStatus } from './knowledge/website-analysis-status';
const first = '00000000-0000-4000-8000-000000000001', second = '00000000-0000-4000-8000-000000000002';
it.each([{merchantId:0}, {merchantId:1.2}, {jobId:'invalid'}, {extra:'untrusted'}])('rejects malformed attempt identity %o', patch => {
  expect(websiteAnalysisAttempt.safeParse({merchantId:20,jobId:first,...patch}).success).toBe(false);
});
it('requires a confirmed accepted response and coherent page counts', () => {
  expect(websiteAnalysisAccepted.safeParse({merchantId:20,jobId:first,started:false,alreadyRunning:false}).success).toBe(false);
  expect(websiteKnowledgeSummary.safeParse({merchantId:20,totalPages:1,activePages:2,canManage:true}).success).toBe(false);
});
it('isolates both tenant and attempt without returning another result', () => {
  const entries: Record<number, WebsiteAnalysisStatus> = {20:{jobId:first,status:'completed',startedAt:100,result:{title:'Private',merchantId:999,jobId:second}}};
  expect(readWebsiteAnalysisAttempt(entries,20,second,110)).toEqual({merchantId:20,jobId:second,status:'idle'});
  expect(readWebsiteAnalysisAttempt(entries,21,first,110)).toEqual({merchantId:21,jobId:first,status:'idle'});
  expect(readWebsiteAnalysisAttempt(entries,20,first,110)).toEqual({merchantId:20,jobId:first,status:'completed',title:'Private'});
});
it('ignores progress, success, or failure arriving from a superseded worker', () => {
  const entries: Record<number, WebsiteAnalysisStatus> = {20:{jobId:second,status:'running',startedAt:100}};
  for (const patch of [{progress:90}, {status:'completed' as const,result:{title:'Old'}}, {status:'error' as const,error:'Old'}]) {
    expect(updateWebsiteAnalysisAttempt(entries,20,first,patch)).toBe(false);
    expect(entries[20]).toEqual({jobId:second,status:'running',startedAt:100});
  }
  expect(updateWebsiteAnalysisAttempt(entries,21,second,{progress:1})).toBe(false);
  expect(updateWebsiteAnalysisAttempt(entries,20,second,{status:'completed',result:{title:'Current'}})).toBe(true);
  expect(updateWebsiteAnalysisAttempt(entries,20,second,{status:'error'})).toBe(false);
});
it('keeps timeout tied to the same attempt and does not resurrect it from a late result', () => {
  const entries: Record<number, WebsiteAnalysisStatus> = {20:{jobId:first,status:'running',startedAt:0}};
  expect(readWebsiteAnalysisAttempt(entries,20,first,ANALYSIS_RUNNING_TTL_MS+1)).toMatchObject({merchantId:20,jobId:first,status:'error'});
  expect(updateWebsiteAnalysisAttempt(entries,20,first,{status:'completed'})).toBe(false);
});
