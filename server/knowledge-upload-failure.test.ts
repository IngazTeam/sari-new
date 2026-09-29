import { expect, it } from 'vitest';
import { knowledgeRetryAfterSeconds, knowledgeUploadFailure } from '../shared/knowledge-upload-failure';

it.each([[400, 'invalidFile'], [413, 'invalidFile'], [415, 'invalidFile'], [401, 'signedOut'], [403, 'noAccess'], [409, 'conflict'], [429, 'rateLimited'], [503, 'unknown'], [404, 'unknown']] as const)('maps HTTP %i to a safe actionable upload state', (status, expected) => {
  expect(knowledgeUploadFailure(status)).toBe(expected);
});
it('accepts bounded Retry-After seconds and HTTP dates without inventing a deadline', () => {
  const now = Date.UTC(2026, 8, 29, 1, 0);
  expect(knowledgeRetryAfterSeconds('60', now)).toBe(60);
  expect(knowledgeRetryAfterSeconds('Tue, 29 Sep 2026 01:02:00 GMT', now)).toBe(120);
  for (const value of [undefined, null, '', '0', '-1', '1.5', 'Infinity', '1000000000', '86401', 'tomorrow', '<script>', 'Tue, 29 Sep 2026 00:59:00 GMT']) expect(knowledgeRetryAfterSeconds(value, now)).toBeNull();
});
