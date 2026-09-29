import { createHash, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { merchantKnowledgeDocs as docs, knowledgeIntakeReceipts as receipts } from '../../drizzle/schema';
import { knowledgeDocumentRequest, knowledgeDocumentReprocess, type KnowledgeDocumentResult } from '../../shared/knowledge-document';
import { withKnowledgeTransaction } from './transaction';
import { receiptColumns, receiptView, finishIntake } from './intake-receipt-store';
import { runIntakeExecution, startIntakeHeartbeat, assertIntakeCheckpoint, type IntakeExecution } from './intake-execution';
import { extractTextFromDocument, DocumentExtractionError, getFileTypeFromMime, MAX_FILE_SIZE } from '../document-parser';
import { assertKnowledgeDocumentSignature, UploadValidationError } from '../security/upload-validation';
import { downloadPublicMedia } from '../security/download-media';

type File = { buffer: Buffer; fileName: string; mimeType: string };
const fileTypes = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
function validatedFile(file: File) {
  const type = getFileTypeFromMime(file.mimeType);
  if (!type || !file.buffer.length || file.buffer.length > MAX_FILE_SIZE) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported document or file size' });
  try { assertKnowledgeDocumentSignature(file.buffer, type); }
  catch (error) { if (error instanceof UploadValidationError) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid document contents' }); throw error; }
  return { type, name: file.fileName.replace(/[/\\<>"'`:;|?*\x00-\x1f]/g, '_').replace(/\.{2,}/g, '.').slice(0, 200) || `document.${type}` };
}

/** This path extracts and archives only. All model work and knowledge changes require a later reviewed plan. */
export async function extractKnowledgeDocument(merchantId: number, requestId: string, input: { file: File } | { sourceDocumentId: number }) {
  knowledgeDocumentRequest.parse({ requestId });
  const uploaded = 'file' in input ? validatedFile(input.file) : null;
  if ('sourceDocumentId' in input) knowledgeDocumentReprocess.shape.id.parse(input.sourceDocumentId);
  const digest = createHash('sha256');
  if ('file' in input) digest.update(JSON.stringify(['document-extraction-v1', uploaded!.name, uploaded!.type])).update(input.file.buffer);
  else digest.update(JSON.stringify(['document-re-extraction-v1', input.sourceDocumentId]));
  const inputHash = digest.digest('hex');
  const reserved = await withKnowledgeTransaction(merchantId, async tx => {
    const [prior] = await tx.select(receiptColumns).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId)));
    if (prior) {
      if (prior.inputHash !== inputHash || prior.reviewId) throw new TRPCError({ code: 'CONFLICT', message: 'Request belongs to another document' });
      return { created: false as const, receipt: receiptView(prior) };
    }
    const [running] = await tx.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.merchantId, merchantId), eq(receipts.state, 'processing'))).limit(1);
    if (running) throw new TRPCError({ code: 'CONFLICT', message: 'Review the running knowledge operation first' });
    let fileName = uploaded?.name || '', fileType = uploaded?.type, fileSize = 'file' in input ? input.file.buffer.length : 0, fileUrl: string | null = null;
    if ('sourceDocumentId' in input) {
      const [source] = await tx.select().from(docs).where(and(eq(docs.merchantId, merchantId), eq(docs.id, input.sourceDocumentId))).limit(1);
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Source document not found' });
      if (!source.fileUrl || !Object.hasOwn(fileTypes, source.fileType)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No original file is available for extraction' });
      const [budget] = await tx.select({ total: sql<number>`COUNT(*)`.mapWith(Number) }).from(receipts).where(and(
        eq(receipts.merchantId, merchantId), sql`${receipts.documentResult} IS NOT NULL`, sql`${receipts.sourceDocumentId} IS NOT NULL`,
        sql`${receipts.createdAt} >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)`));
      if (budget.total >= 5) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Document re-extraction limit reached; check the saved request or try later' });
      fileName = source.fileName; fileType = source.fileType as keyof typeof fileTypes; fileSize = source.fileSize; fileUrl = source.fileUrl;
    }
    const documentResult: KnowledgeDocumentResult = { fileName, fileType: fileType!, sourceDocumentId: 'sourceDocumentId' in input ? input.sourceDocumentId : null,
      extraction: 'pending', issue: null, characters: null, originalStored: !!fileUrl };
    const execution: IntakeExecution = { merchantId, requestId, token: randomUUID() };
    const [created] = await tx.insert(docs).values({ merchantId, fileName, fileType: fileType!, fileSize, fileUrl, extractionStatus: 'processing', intakeRequestId: requestId });
    await tx.insert(receipts).values({ merchantId, requestId, inputHash, documentId: created.insertId, sourceDocumentId: documentResult.sourceDocumentId,
      documentResult, contentType: 'document', state: 'processing', executionToken: execution.token, leaseExpiresAt: sql`DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 SECOND)` });
    return { created: true as const, documentId: created.insertId, documentResult, execution, fileUrl };
  });
  if (!reserved.created) return reserved.receipt;
  const stop = startIntakeHeartbeat(reserved.execution);
  try {
    return await runIntakeExecution(reserved.execution, async () => {
      let result = reserved.documentResult;
      let parsed = false;
      try {
        await assertIntakeCheckpoint(merchantId);
        let buffer: Buffer;
        if ('file' in input) {
          buffer = input.file.buffer;
          try {
            const { storagePut } = await import('../storage');
            const stored = await storagePut(`knowledge-docs/${merchantId}/${requestId}-${result.fileName}`, buffer, fileTypes[result.fileType]);
            const storedResult = { ...result, originalStored: true };
            await withKnowledgeTransaction(merchantId, async tx => {
              await tx.update(docs).set({ fileUrl: stored.key }).where(and(eq(docs.merchantId, merchantId), eq(docs.id, reserved.documentId)));
              await tx.update(receipts).set({ documentResult: storedResult }).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId)));
            });
            result = storedResult;
          } catch { /* Text can still be extracted, but the UI must disclose the missing original. */ }
        } else {
          const { storageGet } = await import('../storage');
          const source = await storageGet(reserved.fileUrl!);
          buffer = (await downloadPublicMedia(source.url, MAX_FILE_SIZE)).data;
          assertKnowledgeDocumentSignature(buffer, result.fileType);
        }
        await assertIntakeCheckpoint(merchantId);
        const { text } = await extractTextFromDocument(buffer, result.fileType);
        parsed = true;
        result = { ...result, extraction: 'extracted', characters: text.length };
        await withKnowledgeTransaction(merchantId, async tx => {
          await tx.update(docs).set({ extractedText: text, extractionStatus: 'completed' }).where(and(eq(docs.merchantId, merchantId), eq(docs.id, reserved.documentId)));
          await tx.update(receipts).set({ documentResult: result }).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId)));
        });
        return await finishIntake(merchantId, requestId, 'empty', null, reserved.execution);
      } catch (error) {
        if (parsed) return finishIntake(merchantId, requestId, 'uncertain', null, reserved.execution);
        result = { ...result, extraction: 'failed', issue: error instanceof DocumentExtractionError ? error.issue : 'unreadable', characters: null };
        try {
          await withKnowledgeTransaction(merchantId, async tx => {
            await tx.update(docs).set({ extractionStatus: 'failed' }).where(and(eq(docs.merchantId, merchantId), eq(docs.id, reserved.documentId)));
            await tx.update(receipts).set({ documentResult: result }).where(and(eq(receipts.merchantId, merchantId), eq(receipts.requestId, requestId)));
          });
          return await finishIntake(merchantId, requestId, 'empty', null, reserved.execution);
        } catch {
          return finishIntake(merchantId, requestId, 'uncertain', null, reserved.execution);
        }
      }
    });
  } finally { await stop(); }
}
