/**
 * Knowledge Docs Router Module
 * Handles merchant business profile document management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const knowledgeDocsRouter = router({
  // Get current knowledge doc for logged-in merchant
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const doc = await db.getKnowledgeDocByMerchantId(merchant.id);
    if (!doc) return null;

    // SEC-06 FIX: Don't send extractedText to frontend (only metadata needed)
    const { extractedText, ...metadata } = doc;
    return { ...metadata, hasText: !!extractedText };
  }),

  // Delete knowledge doc
  delete: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    await db.deleteKnowledgeDocsByMerchantId(merchant.id);
    return { success: true };
  }),

  // Reprocess (re-extract text from existing doc)
  reprocess: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const doc = await db.getKnowledgeDocByMerchantId(merchant.id);
    if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'لا يوجد ملف تعريفي مرفوع' });

    if (!doc.fileUrl) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد ملف محفوظ لإعادة المعالجة' });
    }

    // Re-download and re-extract
    try {
      const { storageGet } = await import('./storage');
      const fileData = await storageGet(doc.fileUrl);

      const response = await fetch(fileData.url);
      const buffer = Buffer.from(await response.arrayBuffer());

      const { extractTextFromDocument } = await import('./document-parser');
      const { text } = await extractTextFromDocument(buffer, doc.fileType as 'pdf' | 'docx');

      await db.updateKnowledgeDoc(doc.id, {
        extractedText: text,
        extractionStatus: 'completed',
      });

      return { success: true, textLength: text.length };
    } catch (error) {
      console.error('[KnowledgeDocs] Reprocess failed:', error);
      await db.updateKnowledgeDoc(doc.id, { extractionStatus: 'failed' });
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل إعادة معالجة الملف' });
    }
  }),
});

export type KnowledgeDocsRouter = typeof knowledgeDocsRouter;
