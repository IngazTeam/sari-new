import { randomUUID } from 'node:crypto';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { merchants, merchantKnowledgeDocs as docs, knowledgeIntakeReceipts as receipts, knowledgeIntakeReviews as reviews, sariActivityLog } from '../../drizzle/schema';
import { getDb } from '../db/connection';
import { knowledgeIngestInput, knowledgeOutcomeSchema, knowledgeSavedReviewSchema, prepareKnowledgeText, type KnowledgeOutcome, type KnowledgeReceipt } from '../../shared/knowledge-intake';
import { knowledgeInputHash } from './intake-reviews';
import { withKnowledgeTransaction } from './transaction';
import { IntakeExecutionExpired, type IntakeExecution } from './intake-execution';

export const receiptColumns = { ...getTableColumns(receipts), leaseExpired: sql<boolean>`(${receipts.leaseExpiresAt} <= UTC_TIMESTAMP() OR ${receipts.createdAt} <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))`.mapWith(Boolean) };
type Row = typeof receipts.$inferSelect & { leaseExpired: boolean | null };
export function receiptView(row: Row): KnowledgeReceipt {
  return { requestId: row.requestId, documentId: row.documentId,
    state: row.documentId === null ? 'removed' : row.state,
    outcome: row.documentId === null || row.outcome === null ? null : knowledgeOutcomeSchema.parse(row.outcome), updatedAt: row.updatedAt,
    recovery: row.documentId === null || row.state !== 'processing' ? null : !row.executionToken || !row.leaseExpiresAt ? 'legacy' : row.leaseExpired ? 'available' : 'waiting', recoveredAt: row.recoveredAt,
    review: row.documentId === null || !row.reviewSnapshot ? null : knowledgeSavedReviewSchema.parse(row.reviewSnapshot) };
}
async function database() { const db = await getDb(); if (!db) throw Error('Knowledge receipt database unavailable'); return db; }
export async function getIntakeReceipt(merchantId: number, requestId: string): Promise<KnowledgeReceipt | null> {
  const [row] = await (await database()).select(receiptColumns).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId))).limit(1);
  return row ? receiptView(row) : null;
}

/** The merchant row serializes reservations. No provider call happens before this transaction commits. */
export async function reserveIntake(merchantId: number, raw: unknown, beforeCreate: () => void = () => {}) {
  const input = knowledgeIngestInput.parse(raw);
  const hash = knowledgeInputHash(input);
  return (await database()).transaction(async tx => {
    const [merchant] = await tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).for('update');
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    const [existing] = await tx.select(receiptColumns).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, input.requestId)));
    if (existing) {
      if (existing.inputHash !== hash || existing.reviewId !== input.reviewId) throw new TRPCError({ code: 'CONFLICT', message: 'This request belongs to different content or review' });
      return { created: false, execution: null, receipt: receiptView(existing) };
    }
    const [running] = await tx.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.state, 'processing'))).limit(1);
    if (running) throw new TRPCError({ code: 'CONFLICT', message: 'A knowledge intake is already in progress. Review its saved record first.' });
    const [review] = await tx.select({ ...getTableColumns(reviews), expired: sql<boolean>`${reviews.expiresAt} <= UTC_TIMESTAMP()`.mapWith(Boolean), acceptedAt: sql<string>`DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s')` }).from(reviews)
      .where(and(eq(reviews.merchantId, merchantId), eq(reviews.reviewId, input.reviewId))).for('update');
    if (!review || review.expired || review.inputHash !== hash) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Review the current content again before adding it' });
    const reviewSnapshot = knowledgeSavedReviewSchema.parse({ id: review.reviewId, analyzedAt: review.createdAt, acceptedAt: review.acceptedAt, analysis: review.analysis });
    beforeCreate();
    const execution: IntakeExecution = { merchantId, requestId: input.requestId, token: randomUUID() };
    const [inserted] = await tx.insert(receipts).values({ merchantId, requestId: input.requestId, inputHash: hash, reviewId: input.reviewId, reviewSnapshot, contentType: input.contentType, state: 'processing', executionToken: execution.token, leaseExpiresAt: sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 SECOND)` });
    // Consume once, atomically with reservation. A different request cannot reuse this review.
    await tx.delete(reviews).where(and(eq(reviews.merchantId, merchantId), eq(reviews.reviewId, input.reviewId)));
    const text = prepareKnowledgeText(input.content);
    const [document] = await tx.insert(docs).values({ merchantId, fileName: input.fileName || 'Knowledge intake', fileType: 'text', fileUrl: null,
      fileSize: Buffer.byteLength(text, 'utf8'), extractedText: text, extractionStatus: 'completed', intakeRequestId: input.requestId });
    await tx.update(receipts).set({ documentId: document.insertId }).where(eq(receipts.id, inserted.insertId));
    const [row] = await tx.select(receiptColumns).from(receipts).where(eq(receipts.id, inserted.insertId));
    return { created: true, execution, receipt: receiptView(row) };
  });
}

export async function finishIntake(merchantId: number, requestId: string, state: 'completed' | 'empty' | 'uncertain', outcome: KnowledgeOutcome | null, execution: IntakeExecution) {
  const db = await database();
  const validated = outcome === null ? null : knowledgeOutcomeSchema.parse(outcome);
  if (execution.merchantId !== merchantId || execution.requestId !== requestId) throw new IntakeExecutionExpired();
  return db.transaction(async tx => {
    await tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).for('update');
    const [row] = await tx.select(receiptColumns).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId))).for('update');
    if (!row) throw Error('Knowledge receipt disappeared');
    if (row.state !== 'processing') return receiptView(row);
    if (row.executionToken !== execution.token || (state !== 'uncertain' && row.leaseExpired)) throw new IntakeExecutionExpired();
    await tx.update(receipts).set({ state, outcome: validated, leaseExpiresAt: null }).where(eq(receipts.id, row.id));
    const [saved] = await tx.select(receiptColumns).from(receipts).where(eq(receipts.id, row.id));
    return receiptView(saved);
  });
}

/** Revoke only an expired, fenced worker. Never restart the pipeline or claim rollback. */
export async function recoverIntake(merchantId: number, requestId: string) {
  return withKnowledgeTransaction(merchantId, async tx => {
    const [row] = await tx.select(receiptColumns).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId))).for('update');
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Knowledge receipt not found' });
    if (row.state !== 'processing') return receiptView(row);
    if (!row.executionToken || !row.leaseExpiresAt || !row.leaseExpired) throw new TRPCError({ code: 'CONFLICT', message: 'Knowledge intake cannot be recovered in its current state' });
    await tx.update(receipts).set({ state: 'uncertain', outcome: null, recoveredAt: sql`UTC_TIMESTAMP()`, leaseExpiresAt: null }).where(eq(receipts.id, row.id));
    await tx.insert(sariActivityLog).values({ merchantId, actionType: 'knowledge_intake_recovered', description: 'أُغلقت إضافة معرفة منقطعة للمراجعة دون إعادة تشغيلها', details: JSON.stringify({ requestId, documentId: row.documentId }) });
    const [saved] = await tx.select(receiptColumns).from(receipts).where(eq(receipts.id, row.id));
    return receiptView(saved);
  });
}
