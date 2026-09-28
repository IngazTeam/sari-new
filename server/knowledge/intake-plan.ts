import { createHash } from 'node:crypto';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { knowledgeSections, knowledgeChangelog, merchants } from '../../drizzle/schema';
import { knowledgePlanSchema, knowledgeProposalsSchema, type KnowledgePlan } from '../../shared/knowledge-plan';
import { getDb } from '../db/connection';
import type { KnowledgeTransaction } from './transaction';
import type { KnowledgeSectionLinks } from '../../shared/knowledge-section-links';
import { sectionComparisonColumns, sectionFingerprints } from './section-fingerprints';

// Embedding writes change updatedAt; they do not change the knowledge being approved.
const { embedding, embeddingContentHash, updatedAt, ...basisColumns } = getTableColumns(knowledgeSections);
export async function readPlanBasis(tx: KnowledgeTransaction, merchantId: number) {
  const [merchant] = await tx.select({ businessName: merchants.businessName }).from(merchants).where(eq(merchants.id, merchantId)).for('update');
  if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
  const sections = await tx.select(basisColumns).from(knowledgeSections).where(eq(knowledgeSections.merchantId, merchantId)).orderBy(asc(knowledgeSections.id)).for('update');
  const hash = createHash('sha256').update(JSON.stringify({ merchantId, merchant, sections })).digest('hex');
  return { hash, businessName: merchant.businessName, sections };
}
export type KnowledgePlanBasis = Awaited<ReturnType<typeof readPlanBasis>>;
export async function capturePlanBasis(merchantId: number) {
  const db = await getDb(); if (!db) throw Error('Knowledge plan database unavailable');
  return db.transaction(tx => readPlanBasis(tx, merchantId));
}
export function planContext(basis: KnowledgePlanBasis) {
  const context = JSON.stringify({ businessName: basis.businessName, sections: basis.sections.map(s => ({ id: s.id, parentId: s.parentId, sectionType: s.sectionType, title: s.title, content: s.content, summary: s.summary, merchantEdited: !!s.merchantEdited, status: s.status, useInBot: !!s.useInBot, injectAs: s.injectAs, validUntil: s.validUntil })) });
  // Never silently omit a section from a plan that may update existing knowledge.
  if (context.length > 120_000) throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Knowledge is too large for one complete review' });
  return context;
}
export function buildKnowledgePlan(basis: KnowledgePlanBasis, raw: unknown): KnowledgePlan {
  const proposals = knowledgeProposalsSchema.parse(raw), targets = new Set<number>();
  const items: KnowledgePlan['items'] = [];
  proposals.forEach((proposal, index) => {
    if (Buffer.byteLength(proposal.content, 'utf8') > 65_535) throw Error('Section exceeds storage limit');
    const existing = proposal.targetId === null ? null : basis.sections.find(s => s.id === proposal.targetId);
    if ((proposal.action === 'add') !== (proposal.targetId === null) || (proposal.targetId !== null && !existing)) throw Error('Invalid plan target');
    if (proposal.parentIndex !== null && (proposal.action !== 'add' || proposal.parentIndex >= index || !['add', 'conflict'].includes(proposals[proposal.parentIndex]?.action))) throw Error('Invalid plan parent');
    if (existing && proposal.sectionType !== existing.sectionType) throw Error('Plan cannot change a section type');
    if (existing && proposal.action === 'update' && existing.merchantEdited) throw Error('Plan cannot overwrite merchant-edited knowledge');
    if (existing && ['update', 'unchanged'].includes(proposal.action)) {
      if (targets.has(existing.id)) throw Error('Plan repeats an existing target');
      targets.add(existing.id);
    }
    const unchanged = proposal.action === 'unchanged', update = proposal.action === 'update';
    const before = existing ? { title: existing.title, content: existing.content, summary: existing.summary } : null;
    const parent = proposal.parentIndex === null ? null : items[proposal.parentIndex];
    items.push({ ...proposal,
      ...(unchanged && before ? { ...before, summary: before.summary || '' } : {}),
      // Updates preserve eligibility and identity, as shown in the review. Conflicts never activate themselves.
      title: existing && (update || unchanged) ? existing.title : proposal.title,
      before,
      status: existing && (update || unchanged) ? existing.status || 'pending_review' : proposal.action === 'conflict' || parent?.status === 'pending_review' ? 'pending_review' as const : 'approved' as const,
      useInBot: existing && (update || unchanged) ? !!existing.useInBot : proposal.action !== 'conflict' && proposal.sectionType !== 'opportunities' && (!parent || parent.useInBot),
      injectAs: existing && (update || unchanged) ? existing.injectAs || 'none' : proposal.sectionType === 'opportunities' ? 'none' as const : proposal.sectionType === 'sales_intel' ? 'behavior' as const : 'fact' as const,
    });
  });
  const plan = knowledgePlanSchema.parse({ version: 1, items });
  if (JSON.stringify(plan).length > 300_000) throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Knowledge plan is too large for one review' });
  return plan;
}

/** Apply the saved plan inside the same transaction as receipt/archive creation; no model calls here. */
export async function applyKnowledgePlan(tx: KnowledgeTransaction, merchantId: number, plan: KnowledgePlan, source: 'document' | 'manual', provenance: { requestId: string; reviewId: string; documentId: number }) {
  const counts = { added: 0, evolved: 0, conflicts: 0, unchanged: 0, merged: 0 }, created = new Map<number, number>();
  const sectionLinks: KnowledgeSectionLinks = { version: 1, items: [] };
  for (let index = 0; index < plan.items.length; index++) {
    const item = plan.items[index];
    let sectionId: number;
    if (item.action === 'unchanged') {
      sectionId = item.targetId!;
      counts.unchanged++;
    } else if (item.action === 'update') {
      sectionId = item.targetId!;
      await tx.update(knowledgeSections).set({ content: item.content, summary: item.summary, source, sourceUrl: null, provenance: { ...provenance, planVersion: plan.version }, embedding: null, embeddingContentHash: null })
        .where(and(eq(knowledgeSections.merchantId, merchantId), eq(knowledgeSections.id, sectionId)));
      counts.evolved++;
    } else {
      const parentId = item.parentIndex === null ? null : created.get(item.parentIndex);
      if (item.parentIndex !== null && parentId === undefined) throw Error('Missing planned parent');
      const [inserted] = await tx.insert(knowledgeSections).values({ merchantId, parentId, sectionType: item.sectionType, title: item.title, content: item.content, summary: item.summary,
        source, confidence: null, status: item.status, useInBot: item.useInBot ? 1 : 0, injectAs: item.injectAs, provenance: { ...provenance, planVersion: plan.version } });
      sectionId = inserted.insertId; created.set(index, sectionId);
      if (item.action === 'conflict') counts.conflicts++; else counts.added++;
    }
    if (item.action !== 'unchanged') await tx.insert(knowledgeChangelog).values({ merchantId, sectionId, action: item.action === 'update' ? 'evolve' : item.action, reason: item.reason,
      oldContent: item.before?.content || null, newContent: item.content, source: `intake:${provenance.requestId}` });
    // Read the actual stored result, including nullable legacy settings and generated parent IDs.
    const [saved] = await tx.select(sectionComparisonColumns).from(knowledgeSections)
      .where(and(eq(knowledgeSections.merchantId, merchantId), eq(knowledgeSections.id, sectionId)));
    if (!saved) throw Error('Applied knowledge section disappeared');
    sectionLinks.items.push({ planIndex: index, sectionId, ...sectionFingerprints(saved) });
  }
  return { counts, sectionLinks };
}
