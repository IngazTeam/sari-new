export type KnowledgeUploadFailure = 'invalidFile' | 'signedOut' | 'noAccess' | 'conflict' | 'rateLimited' | 'unknown';

// Do not display arbitrary response bodies or treat infrastructure errors as
// proof that an earlier attempt did not reach the server.
export function knowledgeUploadFailure(status: number): KnowledgeUploadFailure {
  if ([400, 413, 415].includes(status)) return 'invalidFile';
  if (status === 401) return 'signedOut';
  if (status === 403) return 'noAccess';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimited';
  return 'unknown';
}

export function knowledgeRetryAfterSeconds(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const text = value.trim();
  const seconds = /^\d{1,6}$/.test(text) ? Number(text)
    : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text) ? Math.ceil((Date.parse(text) - now) / 1000) : NaN;
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 86400 ? seconds : null;
}
