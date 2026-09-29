import { and, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { merchantKnowledgeDocs as docs } from '../../drizzle/schema';
import { getDb } from '../db/connection';
import type { KnowledgeTransaction } from './transaction';
import { knowledgeDocumentReprocess } from '../../shared/knowledge-document';
import { KNOWLEDGE_PREVIEW_LIMIT } from '../../shared/knowledge-preview';

export async function verifyKnowledgeDocumentSource(tx: KnowledgeTransaction, merchantId: number, source: { id: number; revision: string }) {
  const [row] = await tx.select({ id: docs.id, fileName: docs.fileName, status: docs.extractionStatus,
    revision: sql<string>`SHA2(COALESCE(${docs.extractedText}, ''), 256)` }).from(docs)
    .where(and(eq(docs.merchantId, merchantId), eq(docs.id, source.id))).limit(1).for('update');
  if (!row || row.status !== 'completed' || row.revision !== source.revision) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'The source file changed or is unavailable. Open its text again.' });
  return { id: row.id, fileName: row.fileName };
}

export async function getDocumentReviewSource(merchantId: number, id: number) {
  knowledgeDocumentReprocess.shape.id.parse(id);
  const db = await getDb(); if (!db) throw Error('Knowledge database unavailable');
  const [row] = await db.select({ id: docs.id, fileName: docs.fileName, content: docs.extractedText, status: docs.extractionStatus,
    requestId: docs.intakeRequestId, revision: sql<string>`SHA2(COALESCE(${docs.extractedText}, ''), 256)` }).from(docs)
    .where(and(eq(docs.merchantId, merchantId), eq(docs.id, id))).limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Knowledge document not found' });
  if (row.status !== 'completed' || !row.content || row.content.trim().length < 10) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No reviewable text is stored' });
  if (row.content.length > KNOWLEDGE_PREVIEW_LIMIT) throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Split the source into smaller documents before review' });
  return { content: row.content, fileName: row.fileName, sourceDocument: { id: row.id, revision: row.revision }, legacy: !row.requestId };
}
