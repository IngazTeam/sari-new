import { and, desc, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { merchantKnowledgeDocs as docs, knowledgeIntakeReceipts as receipts } from '../../drizzle/schema';
import { receiptView, receiptColumns } from './intake-receipt-store';
import { getDb } from '../db/connection';
import { knowledgeLibraryInput, knowledgeTextInput, KNOWLEDGE_LIBRARY_PAGE_SIZE, KNOWLEDGE_TEXT_PAGE_SIZE } from '../../shared/knowledge-library';

const metadata = {
  id: docs.id, fileName: docs.fileName, fileType: docs.fileType, fileSize: docs.fileSize,
  intakeRequestId: docs.intakeRequestId,
  extractionStatus: docs.extractionStatus, uploadedAt: docs.uploadedAt, updatedAt: docs.updatedAt,
  characterCount: sql<number>`COALESCE(CHAR_LENGTH(${docs.extractedText}), 0)`.mapWith(Number),
};
async function database(merchantId: number) {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1) throw new Error('Invalid merchant');
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  return db;
}

/** Metadata only: no raw text or storage URLs in list responses. */
export async function listKnowledgeDocuments(merchantId: number, raw: unknown) {
  const input = knowledgeLibraryInput.parse(raw), db = await database(merchantId);
  const where = and(eq(docs.merchantId, merchantId),
    input.search ? sql`LOCATE(${input.search}, ${docs.fileName}) > 0` : undefined,
    input.status === 'all' ? undefined : eq(docs.extractionStatus, input.status));
  return db.transaction(async tx => {
    const [count] = await tx.select({ total: sql<number>`COUNT(*)`.mapWith(Number) }).from(docs).where(where);
    const totalPages = Math.max(1, Math.ceil(count.total / KNOWLEDGE_LIBRARY_PAGE_SIZE));
    const page = Math.min(input.page, totalPages);
    const items = await tx.select({ ...metadata, intakeState: receipts.state }).from(docs)
      .leftJoin(receipts, and(eq(receipts.merchantId, docs.merchantId), eq(receipts.documentId, docs.id), eq(receipts.requestId, docs.intakeRequestId))).where(where)
      .orderBy(desc(docs.uploadedAt), desc(docs.id)).limit(KNOWLEDGE_LIBRARY_PAGE_SIZE).offset((page - 1) * KNOWLEDGE_LIBRARY_PAGE_SIZE);
    return { items, total: count.total, page, totalPages };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function readKnowledgeDocument(merchantId: number, raw: unknown) {
  const input = knowledgeTextInput.parse(raw), db = await database(merchantId);
  const [row] = await db.select({ ...metadata,
    revision: sql<string>`SHA2(COALESCE(${docs.extractedText}, ''), 256)`,
    text: sql<string>`SUBSTRING(COALESCE(${docs.extractedText}, ''), ${(input.page - 1) * KNOWLEDGE_TEXT_PAGE_SIZE + 1}, ${KNOWLEDGE_TEXT_PAGE_SIZE})`,
  }).from(docs).where(and(eq(docs.id, input.id), eq(docs.merchantId, merchantId))).limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Knowledge document not found' });
  if (input.revision && input.revision !== row.revision) throw new TRPCError({ code: 'CONFLICT', message: 'Knowledge document changed' });
  const totalPages = Math.max(1, Math.ceil(row.characterCount / KNOWLEDGE_TEXT_PAGE_SIZE));
  if (input.page > totalPages) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid document page' });
  const [receipt] = row.intakeRequestId ? await db.select(receiptColumns).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.documentId, row.id), eq(receipts.requestId, row.intakeRequestId))).limit(1) : [];
  return { ...row, page: input.page, totalPages, receipt: receipt ? receiptView(receipt) : null };
}

export async function getKnowledgeDocumentSummary(merchantId: number) {
  const db = await database(merchantId);
  return db.transaction(async tx => {
    const [totals] = await tx.select({
      documentCount: sql<number>`COUNT(*)`.mapWith(Number),
      contentLength: sql<number>`COALESCE(SUM(CHAR_LENGTH(${docs.extractedText})), 0)`.mapWith(Number),
    }).from(docs).where(eq(docs.merchantId, merchantId));
    const [latest] = await tx.select({ id: docs.id, date: docs.uploadedAt }).from(docs)
      .where(eq(docs.merchantId, merchantId)).orderBy(desc(docs.uploadedAt), desc(docs.id)).limit(1);
    return latest ? { ...totals, ...latest } : null;
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
