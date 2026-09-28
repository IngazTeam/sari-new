import { and, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { merchantKnowledgeDocs as docs, knowledgeIntakeReceipts as receipts, knowledgeSections as sections } from '../../drizzle/schema';
import { getDb } from '../db/connection';
import { knowledgeSectionLinksSchema, knowledgeSectionLinksInput, KNOWLEDGE_SECTION_LINKS_PAGE_SIZE } from '../../shared/knowledge-section-links';
import { knowledgeSavedReviewSchema } from '../../shared/knowledge-intake';
import { sectionComparisonColumns, sectionFingerprints } from './section-fingerprints';

/** Permission-gated separately from file metadata. Never guess links from titles or current provenance. */
export async function readKnowledgeDocumentSections(merchantId: number, raw: unknown) {
  const input = knowledgeSectionLinksInput.parse(raw);
  if (!Number.isSafeInteger(merchantId) || merchantId < 1) throw Error('Invalid merchant');
  const db = await getDb(); if (!db) throw Error('Knowledge database unavailable');
  return db.transaction(async tx => {
    const [doc] = await tx.select({ id: docs.id, requestId: docs.intakeRequestId }).from(docs)
      .where(and(eq(docs.merchantId, merchantId), eq(docs.id, input.id))).limit(1);
    if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Knowledge document not found' });
    const [receipt] = doc.requestId ? await tx.select({ links: receipts.sectionLinks, review: receipts.reviewSnapshot }).from(receipts)
      .where(and(eq(receipts.merchantId, merchantId), eq(receipts.documentId, doc.id), eq(receipts.requestId, doc.requestId))).limit(1) : [];
    const links = knowledgeSectionLinksSchema.safeParse(receipt?.links);
    const review = knowledgeSavedReviewSchema.safeParse(receipt?.review);
    const plan = review.success ? review.data.plan : undefined;
    // Old records have no durable mapping. Broken/incomplete snapshots also fail closed.
    if (!links.success || !plan || links.data.items.length !== plan.items.length || links.data.items.some((item, index) => item.planIndex !== index)) {
      return { available: false as const, items: [], total: 0, page: 1, totalPages: 1 };
    }
    const total = links.data.items.length, totalPages = Math.max(1, Math.ceil(total / KNOWLEDGE_SECTION_LINKS_PAGE_SIZE));
    const page = Math.min(input.page, totalPages);
    const slice = links.data.items.slice((page - 1) * KNOWLEDGE_SECTION_LINKS_PAGE_SIZE, page * KNOWLEDGE_SECTION_LINKS_PAGE_SIZE);
    // IDs from a saved receipt are still untrusted: scope every current-section read to the resolved tenant.
    const current = slice.length ? await tx.select(sectionComparisonColumns).from(sections)
      .where(and(eq(sections.merchantId, merchantId), inArray(sections.id, slice.map(item => item.sectionId)))) : [];
    const items = slice.map(link => {
      const item = plan.items[link.planIndex], row = current.find(section => section.id === link.sectionId);
      const hashes = row ? sectionFingerprints(row) : null;
      return { planIndex: link.planIndex, sectionId: link.sectionId, action: item.action,
        saved: { title: item.title, content: item.content, summary: item.summary },
        current: row ? { ...row, useInBot: !!row.useInBot } : null,
        contentChanged: hashes ? hashes.contentHash !== link.contentHash : null,
        settingsChanged: hashes ? hashes.settingsHash !== link.settingsHash : null,
      };
    });
    return { available: true as const, items, total, page, totalPages };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
