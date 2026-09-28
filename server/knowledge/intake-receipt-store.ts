import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { merchants, merchantKnowledgeDocs as docs, knowledgeIntakeReceipts as receipts } from '../../drizzle/schema';
import { getDb } from '../db/connection';
import { knowledgeIngestInput, knowledgeOutcomeSchema, prepareKnowledgeText, type KnowledgeOutcome, type KnowledgeReceipt } from '../../shared/knowledge-intake';

type Row = typeof receipts.$inferSelect;
export function receiptView(row: Row): KnowledgeReceipt {
  return { requestId: row.requestId, documentId: row.documentId,
    state: row.documentId === null ? 'removed' : row.state,
    outcome: row.documentId === null || row.outcome === null ? null : knowledgeOutcomeSchema.parse(row.outcome), updatedAt: row.updatedAt };
}
async function database() { const db = await getDb(); if (!db) throw Error('Knowledge receipt database unavailable'); return db; }
export async function getIntakeReceipt(merchantId: number, requestId: string): Promise<KnowledgeReceipt | null> {
  const [row] = await (await database()).select().from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId))).limit(1);
  return row ? receiptView(row) : null;
}

/** The merchant row serializes reservations. No provider call happens before this transaction commits. */
export async function reserveIntake(merchantId: number, raw: unknown, beforeCreate: () => void = () => {}) {
  const input = knowledgeIngestInput.parse(raw);
  const hash = createHash('sha256').update(JSON.stringify([input.content, input.contentType, input.fileName || ''])).digest('hex');
  return (await database()).transaction(async tx => {
    const [merchant] = await tx.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId)).for('update');
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    const [existing] = await tx.select().from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, input.requestId)));
    if (existing) {
      if (existing.inputHash !== hash) throw new TRPCError({ code: 'CONFLICT', message: 'This request belongs to different content' });
      return { created: false, receipt: receiptView(existing) };
    }
    const [running] = await tx.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.state, 'processing'))).limit(1);
    if (running) throw new TRPCError({ code: 'CONFLICT', message: 'A knowledge intake is already in progress. Review its saved record first.' });
    beforeCreate();
    const [inserted] = await tx.insert(receipts).values({ merchantId, requestId: input.requestId, inputHash: hash, contentType: input.contentType, state: 'processing' });
    const text = prepareKnowledgeText(input.content);
    const [document] = await tx.insert(docs).values({ merchantId, fileName: input.fileName || 'Knowledge intake', fileType: 'text', fileUrl: null,
      fileSize: Buffer.byteLength(text, 'utf8'), extractedText: text, extractionStatus: 'completed', intakeRequestId: input.requestId });
    await tx.update(receipts).set({ documentId: document.insertId }).where(eq(receipts.id, inserted.insertId));
    const [row] = await tx.select().from(receipts).where(eq(receipts.id, inserted.insertId));
    return { created: true, receipt: receiptView(row) };
  });
}

export async function finishIntake(merchantId: number, requestId: string, state: 'completed' | 'empty' | 'uncertain', outcome: KnowledgeOutcome | null) {
  const db = await database();
  const validated = outcome === null ? null : knowledgeOutcomeSchema.parse(outcome);
  await db.update(receipts).set({ state, outcome: validated }).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId), eq(receipts.state, 'processing')));
  const result = await getIntakeReceipt(merchantId, requestId);
  if (!result) throw Error('Knowledge receipt disappeared');
  return result;
}
