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
} from './db';

import { removeKnowledgeSource } from './knowledge/source-lifecycle';
import { extractKnowledgeDocument } from './knowledge/document-extraction';
import { getDocumentReviewSource } from './knowledge/document-source';
import { knowledgeDocumentReprocess } from '../shared/knowledge-document';
import { knowledgeLibraryInput, knowledgeTextInput } from '../shared/knowledge-library';
import { listKnowledgeDocuments, readKnowledgeDocument, listKnowledgeDocumentCopies } from './knowledge/document-library';
import { hasPermission } from './_core/permissions';
import { knowledgeSectionLinksInput } from '../shared/knowledge-section-links';
import { readKnowledgeDocumentSections } from './knowledge/document-sections';

export const knowledgeDocsRouter = router({
  copies: permissionProcedure('bot_settings.manage').input(knowledgeTextInput.pick({ id: true, page: true })).query(async ({ ctx, input }) => {
    try { return await listKnowledgeDocumentCopies(ctx.merchantId, input); }
    catch (error) { if (error instanceof TRPCError) throw error; throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Linked copies are temporarily unavailable' }); }
  }),
  sections: permissionProcedure('bot_settings.manage').input(knowledgeSectionLinksInput).query(async ({ ctx, input }) => {
    try { return await readKnowledgeDocumentSections(ctx.merchantId, input); }
    catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Knowledge section links are temporarily unavailable' });
    }
  }),
  list: merchantProcedure.input(knowledgeLibraryInput).query(async ({ ctx, input }) => {
    try {
      return { ...await listKnowledgeDocuments(ctx.merchantId, input), canReadText: hasPermission(ctx.merchantRole, 'bot_settings.manage') };
    } catch {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Knowledge library is temporarily unavailable' });
    }
  }),
  // Source text is deliberately separate from metadata and restricted to knowledge managers.
  readText: permissionProcedure('bot_settings.manage').input(knowledgeTextInput).query(async ({ ctx, input }) => {
    try { return await readKnowledgeDocument(ctx.merchantId, input); }
    catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Knowledge document is temporarily unavailable' });
    }
  }),
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
    catch (error) { if (error instanceof TRPCError) throw error; throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر حذف مصدر المعرفة. لم يتم اعتماد عملية جزئية.' }); }
    return { success: true };
  }),

  reviewSource: permissionProcedure('bot_settings.manage').input(knowledgeDocumentReprocess.pick({ id: true })).query(async ({ ctx, input }) => {
    try { return await getDocumentReviewSource(ctx.merchantId, input.id); }
    catch (error) { if (error instanceof TRPCError) throw error; throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Source text is temporarily unavailable' }); }
  }),
  reprocess: permissionProcedure('bot_settings.manage').input(knowledgeDocumentReprocess).mutation(async ({ ctx, input }) => {
    try { return await extractKnowledgeDocument(ctx.merchantId, input.requestId, { sourceDocumentId: input.id }); }
    catch (error) { if (error instanceof TRPCError) throw error; throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Check the saved request before extracting again' }); }
  }),
});

export type KnowledgeDocsRouter = typeof knowledgeDocsRouter;
