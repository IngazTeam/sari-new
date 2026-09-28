import { knowledgeIngestInput, prepareKnowledgeText } from '../../shared/knowledge-intake';
import { reserveIntake, finishIntake } from './intake-receipt-store';

/** At most one pipeline attempt per request ID; an unknown outcome is never retried here. */
export async function ingestReviewedKnowledge(merchant: { id: number; businessName: string }, raw: unknown, beforeCreate: () => void, log: (action: string, details: unknown) => Promise<void>) {
  const input = knowledgeIngestInput.parse(raw);
  const reservation = await reserveIntake(merchant.id, input, beforeCreate);
  if (!reservation.created) return reservation.receipt;
  try {
    const { ingestContent } = await import('../ai/knowledge-engine');
    const { embedAllSections, hasCurrentKnowledgeEmbeddings } = await import('../ai/rag-engine');
    const { invalidateCache } = await import('../db/knowledge');
    const { evolveResult } = await ingestContent(merchant.id, prepareKnowledgeText(input.content), input.contentType === 'document' ? 'document' : 'manual', { businessName: merchant.businessName });
    const success = Object.values(evolveResult).some(value => value > 0);
    let embeddingsReady = false;
    if (success) {
      // The embedding pipeline can return normally while individual embeddings fail.
      try { await embedAllSections(merchant.id, true); embeddingsReady = await hasCurrentKnowledgeEmbeddings(merchant.id); } catch { /* Persist the partial result below. */ }
      await invalidateCache(merchant.id);
    }
    const receipt = await finishIntake(merchant.id, input.requestId, success ? 'completed' : 'empty', { success, evolveResult, embeddingsReady });
    await log(success ? 'knowledge_ingested' : 'content_analyzed', { requestId: input.requestId, documentId: receipt.documentId, state: receipt.state, evolveResult, embeddingsReady });
    return receipt;
  } catch {
    // Mutations may already have committed. Never claim a rollback or automatically call the model again.
    return finishIntake(merchant.id, input.requestId, 'uncertain', null);
  }
}
