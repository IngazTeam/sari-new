/**
 * Knowledge Docs Router Module
 * Handles merchant business profile document management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  getKnowledgeDocByMerchantId,
  getMerchantById,
  updateKnowledgeDoc,
} from './db';

import { removeKnowledgeSource } from './knowledge/source-lifecycle';
import { downloadPublicMedia } from './security/download-media';
import { assertKnowledgeDocumentSignature } from './security/upload-validation';

export const knowledgeDocsRouter = router({
  // Get current knowledge doc for logged-in merchant
  getCurrent: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const doc = await getKnowledgeDocByMerchantId(merchant.id);
    if (!doc) return null;

    // SEC-06 FIX: Don't send extractedText to frontend (only metadata needed)
    const { extractedText, ...metadata } = doc;
    return { ...metadata, hasText: !!extractedText };
  }),

  // Delete knowledge doc
  delete: permissionProcedure('bot_settings.manage').mutation(async ({ ctx }) => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    try { await removeKnowledgeSource(merchant.id, 'document'); }
    catch { throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر حذف مصدر المعرفة. لم يتم اعتماد عملية جزئية.' }); }
    return { success: true };
  }),

  // Reprocess (re-extract text from existing doc)
  reprocess: permissionProcedure('bot_settings.manage').mutation(async ({ ctx }) => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const doc = await getKnowledgeDocByMerchantId(merchant.id);
    if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'لا يوجد ملف تعريفي مرفوع' });

    if (!doc.fileUrl) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد ملف محفوظ لإعادة المعالجة' });
    }
    const fileType = doc.fileType;
    if (fileType !== 'pdf' && fileType !== 'docx' && fileType !== 'xlsx') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع الملف غير مدعوم لإعادة المعالجة' });
    }

    // Re-download and re-extract
    try {
      const { storageGet } = await import('./storage');
      const fileData = await storageGet(doc.fileUrl);

      const { data: buffer } = await downloadPublicMedia(fileData.url, 5 * 1024 * 1024);
      assertKnowledgeDocumentSignature(buffer, fileType);

      const { extractTextFromDocument } = await import('./document-parser');
      const { text } = await extractTextFromDocument(buffer, fileType);

      await updateKnowledgeDoc(doc.id, {
        extractedText: text,
        extractionStatus: 'completed',
      });

      // === Knowledge Engine v4: Classify document into structured sections ===
      try {
        if (text.trim().length > 100) {
          const { ingestContent } = await import('./ai/knowledge-engine');
          const { embedAllSections } = await import('./ai/rag-engine');
          const knowledgeDb = await import('./db/knowledge');
          
          await ingestContent(
            merchant.id,
            text,
            'document',
            { businessName: merchant.businessName },
          );
          
          await embedAllSections(merchant.id, true);
          await knowledgeDb.invalidateCache(merchant.id);
        }
      } catch {
        console.warn('[KnowledgeDocs] Knowledge Engine pipeline failed (non-blocking)');
      }

      return { success: true, textLength: text.length };
    } catch {
      console.error('[KnowledgeDocs] Reprocess failed');
      await updateKnowledgeDoc(doc.id, { extractionStatus: 'failed' });
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل إعادة معالجة الملف' });
    }
  }),
});

export type KnowledgeDocsRouter = typeof knowledgeDocsRouter;
