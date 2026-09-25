import { z } from 'zod';

export const historyIdentity = z.number().int().positive().safe();
// A keyset position, never an authorization token. Every SQL query still scopes ownership.
export const policyHistoryCursor = z.object({ scopeId: historyIdentity, through: historyIdentity, before: historyIdentity.optional() })
  .strict().refine(value => value.before === undefined || value.before <= value.through, 'Invalid history window');
export const evaluationHistoryInput = z.object({ proposalId: historyIdentity, cursor: policyHistoryCursor.nullish() }).strict()
  .refine(value => !value.cursor || value.cursor.scopeId === value.proposalId, 'Cursor belongs to another proposal');
export const outputHistoryInput = z.object({ runId: historyIdentity, cursor: policyHistoryCursor.nullish() }).strict()
  .refine(value => !value.cursor || value.cursor.scopeId === value.runId, 'Cursor belongs to another run');
export const outputRecordInput = z.object({ runId: historyIdentity, reviewId: historyIdentity }).strict();
export const policyHistoryPageSize = 20;
