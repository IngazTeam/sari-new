import { knowledgeIngestInput } from '../../shared/knowledge-intake';
import { reserveIntake, finishIntake } from './intake-receipt-store';
import { runIntakeExecution, startIntakeHeartbeat } from './intake-execution';

/** At most one pipeline attempt per request ID; an unknown outcome is never retried here. */
export async function ingestReviewedKnowledge(merchant: { id: number; businessName: string }, raw: unknown, beforeCreate: () => void, log: (action: string, details: unknown) => Promise<void>) {
  const input = knowledgeIngestInput.parse(raw);
  const reservation = await reserveIntake(merchant.id, input, beforeCreate);
  if (!reservation.created) return reservation.receipt;
  const execution = reservation.execution!;
  const stopHeartbeat = startIntakeHeartbeat(execution);
  try {
    return await runIntakeExecution(execution, async () => {
      try {
        const { embedAllSections, hasCurrentKnowledgeEmbeddings } = await import('../ai/rag-engine');
        const { invalidateCache } = await import('../db/knowledge');
        // The exact reviewed changes already committed atomically with this receipt.
        const { evolveResult } = reservation.receipt.outcome!;
        const success = Object.values(evolveResult).some(value => value > 0);
        let embeddingsReady = false;
        if (success) {
          // The embedding pipeline can return normally while individual embeddings fail.
          try { await embedAllSections(merchant.id, true); embeddingsReady = await hasCurrentKnowledgeEmbeddings(merchant.id); } catch { /* Persist the partial result below. */ }
          await invalidateCache(merchant.id);
        }
        const state = success ? 'completed' : 'empty';
        const receipt = await finishIntake(merchant.id, input.requestId, state, { success, evolveResult, embeddingsReady }, execution);
        // Recovery may have already closed this execution. Do not log it as a successful intake.
        if (receipt.state === state) await log(success ? 'knowledge_ingested' : 'content_analyzed', { requestId: input.requestId, documentId: receipt.documentId, state: receipt.state, evolveResult, embeddingsReady });
        return receipt;
      } catch {
        // Mutations may already have committed. Never claim a rollback or automatically call the model again.
        return finishIntake(merchant.id, input.requestId, 'uncertain', reservation.receipt.outcome, execution);
      }
    });
  } finally { await stopHeartbeat(); }
}
