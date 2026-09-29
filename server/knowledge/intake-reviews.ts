import { createHash, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { knowledgeIntakeReviews as reviews, merchants } from '../../drizzle/schema';
import { getDb } from '../db/connection';
import { knowledgeAnalysisSchema, knowledgeIntakeInput, type KnowledgeAnalysis, type KnowledgeReview } from '../../shared/knowledge-intake';
import { knowledgePlanSchema, type KnowledgePlan } from '../../shared/knowledge-plan';
import { readPlanBasis } from './intake-plan';
import { verifyKnowledgeDocumentSource } from './document-source';

export function knowledgeInputHash(raw: unknown): string {
  const input = knowledgeIntakeInput.parse(raw);
  return createHash('sha256').update(JSON.stringify([input.content, input.contentType, input.fileName || '', ...(input.sourceDocument ? [input.sourceDocument] : [])])).digest('hex');
}

/** Store the report and exact plan only if its captured knowledge basis is still current. */
export async function saveKnowledgeReview(merchantId: number, raw: unknown, report: KnowledgeAnalysis, prepared: { basisHash: string; plan: KnowledgePlan }): Promise<KnowledgeReview> {
  const inputHash = knowledgeInputHash(raw), analysis = knowledgeAnalysisSchema.parse(report);
  const input = knowledgeIntakeInput.parse(raw);
  const plan = knowledgePlanSchema.parse(prepared.plan);
  const db = await getDb(); if (!db) throw Error('Knowledge review database unavailable');
  return db.transaction(async tx => {
    const [merchant] = await tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).for('update');
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    if (input.sourceDocument) await verifyKnowledgeDocumentSource(tx, merchantId, input.sourceDocument);
    if ((await readPlanBasis(tx, merchantId)).hash !== prepared.basisHash) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Knowledge changed during review' });
    await tx.delete(reviews).where(and(eq(reviews.merchantId, merchantId), sql`${reviews.expiresAt} <= UTC_TIMESTAMP()`));
    const id = randomUUID();
    await tx.insert(reviews).values({ reviewId: id, merchantId, inputHash, analysis, basisHash: prepared.basisHash, plan, expiresAt: sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)` });
    const [saved] = await tx.select().from(reviews).where(and(eq(reviews.merchantId, merchantId), eq(reviews.reviewId, id)));
    return { id, createdAt: saved.createdAt, expiresAt: saved.expiresAt, plan };
  });
}
