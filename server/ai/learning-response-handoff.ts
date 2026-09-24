import type { AiBudgetAttempt } from './budget-ledger';
import { storeLearningResponse, type LearningAnalysisClaim } from './learning-analysis-jobs';

const transientStorageCodes = new Set([
  'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'PROTOCOL_ENQUEUE_AFTER_QUIT',
]);
const delaysMs = [100, 300] as const;

/** Retry only the local save of the already-returned response, never provider transport.
 * SQL rechecks claim, bound attempt, source and response digest on every attempt.
 * The two bounded waits happen after transaction rollback/release, without database locks.
 */
export async function saveLearningProviderResponse(claim: LearningAnalysisClaim, response: string, attempt: AiBudgetAttempt) {
  if (!attempt || !/^[a-f0-9]{64}$/.test(attempt.reservationKey)) throw Error('Learning response attempt unavailable');
  const owner = Object.freeze({ ...claim }), boundAttempt = Object.freeze({ ...attempt });
  for (let index = 0; ; index++) {
    try { return await storeLearningResponse(owner, response, boundAttempt); }
    catch (error) {
      const code = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
      if (index >= delaysMs.length || typeof code !== 'string' || !transientStorageCodes.has(code)) {
        // Do not expose SQL, customer output or driver connection details to the caller.
        throw Error('Learning response storage not confirmed');
      }
      await new Promise<void>(resolve => setTimeout(resolve, delaysMs[index]));
    }
  }
}
