import { and, desc, eq, inArray } from 'drizzle-orm';
import { discoveredPages, extractedFaqs, knowledgeChangelog, knowledgeSections, merchantKnowledgeDocs, merchants, products, sariActivityLog, websiteAnalyses } from '../../drizzle/schema';
import { withKnowledgeTransaction, type KnowledgeTransaction } from './transaction';
import type { SectionSource } from '../db/knowledge';

type Source = 'document' | 'website' | 'products' | 'faqs';
export class KnowledgeSourceNotFoundError extends Error {
  constructor() { super('Knowledge source not found'); this.name = 'KnowledgeSourceNotFoundError'; }
}

/** Traverse tenant-filtered rows only; arbitrary depth and cycles are both bounded. */
export function sectionDescendants(rows: Array<{ id: number; parentId: number | null }>, roots: number[]): number[] {
  const owned = new Set(rows.map(row => row.id));
  const children = new Map<number, number[]>();
  for (const row of rows) if (row.parentId !== null) children.set(row.parentId, [...(children.get(row.parentId) || []), row.id]);
  const queue = roots.filter(id => owned.has(id)), result = new Set<number>();
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) || []));
  }
  return Array.from(result);
}

async function deleteSections(tx: KnowledgeTransaction, merchantId: number, source?: SectionSource) {
  const rows = await tx.select({ id: knowledgeSections.id, parentId: knowledgeSections.parentId, source: knowledgeSections.source })
    .from(knowledgeSections).where(eq(knowledgeSections.merchantId, merchantId)).for('update');
  const ids = sectionDescendants(rows, rows.filter(row => source === undefined || row.source === source).map(row => row.id));
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500);
    await tx.delete(knowledgeChangelog).where(and(eq(knowledgeChangelog.merchantId, merchantId), inArray(knowledgeChangelog.sectionId, batch)));
    const [result] = await tx.delete(knowledgeSections).where(and(eq(knowledgeSections.merchantId, merchantId), inArray(knowledgeSections.id, batch)));
    deleted += result.affectedRows;
  }
  if (source === undefined) await tx.delete(knowledgeChangelog).where(eq(knowledgeChangelog.merchantId, merchantId));
  return deleted;
}

export function removeKnowledgeSections(merchantId: number, source?: SectionSource) {
  return withKnowledgeTransaction(merchantId, tx => deleteSections(tx, merchantId, source));
}

function validateSourceId(merchantId: number, source: Source, sourceId?: string) {
  if (sourceId === undefined) return;
  const prefix = source === 'document' ? 'doc' : source;
  if (!new RegExp(`^${prefix}-[1-9]\\d*$`).test(sourceId)) throw new KnowledgeSourceNotFoundError();
  const id = Number(sourceId.slice(prefix.length + 1));
  if (!Number.isSafeInteger(id) || id > 2_147_483_647) throw new KnowledgeSourceNotFoundError();
  if (['products', 'faqs'].includes(source) && sourceId !== `${source}-${merchantId}`) throw new KnowledgeSourceNotFoundError();
}

async function deleteSource(tx: KnowledgeTransaction, merchantId: number, source: Source, sourceId?: string) {
  validateSourceId(merchantId, source, sourceId);
  let deleted = 0, sections = 0;
  if (source === 'document') {
    const rows = await tx.select({ id: merchantKnowledgeDocs.id }).from(merchantKnowledgeDocs)
      .where(eq(merchantKnowledgeDocs.merchantId, merchantId)).orderBy(desc(merchantKnowledgeDocs.uploadedAt), desc(merchantKnowledgeDocs.id)).for('update');
    if (sourceId !== undefined && sourceId !== `doc-${rows[0]?.id}`) throw new KnowledgeSourceNotFoundError();
    // There is one active document source; do not expose an older upload after removing the latest.
    const [result] = await tx.delete(merchantKnowledgeDocs).where(eq(merchantKnowledgeDocs.merchantId, merchantId));
    deleted = result.affectedRows;
    sections = await deleteSections(tx, merchantId, 'document');
  } else if (source === 'website') {
    if (sourceId !== undefined) {
      const rows = await tx.select({ id: websiteAnalyses.id }).from(websiteAnalyses)
        .where(and(eq(websiteAnalyses.merchantId, merchantId), eq(websiteAnalyses.id, Number(sourceId.slice(8))))).for('update');
      if (!rows.length) throw new KnowledgeSourceNotFoundError();
    }
    const [analyses] = await tx.delete(websiteAnalyses).where(eq(websiteAnalyses.merchantId, merchantId));
    const [pages] = await tx.delete(discoveredPages).where(eq(discoveredPages.merchantId, merchantId));
    deleted = analyses.affectedRows + pages.affectedRows;
    sections = await deleteSections(tx, merchantId, 'website');
    await tx.update(merchants).set({ analysisStatus: 'pending', lastAnalysisDate: null }).where(eq(merchants.id, merchantId));
  } else if (source === 'products') {
    const [result] = await tx.delete(products).where(eq(products.merchantId, merchantId));
    deleted = result.affectedRows;
  } else {
    const [result] = await tx.delete(extractedFaqs).where(eq(extractedFaqs.merchantId, merchantId));
    deleted = result.affectedRows;
  }
  return { deleted, sections };
}

export async function removeKnowledgeSource(merchantId: number, source: Source, sourceId?: string) {
  validateSourceId(merchantId, source, sourceId);
  return withKnowledgeTransaction(merchantId, async tx => {
    const result = await deleteSource(tx, merchantId, source, sourceId);
    await tx.insert(sariActivityLog).values({ merchantId, actionType: `${source}_deleted`, description: 'تم حذف مصدر المعرفة وبياناته المرتبطة', details: JSON.stringify({ source, ...result }) });
    return result;
  });
}

/** Full reset keeps account, conversations, orders and settings outside its scope. */
export async function resetKnowledgeSources(merchantId: number) {
  return withKnowledgeTransaction(merchantId, async tx => {
    const deletedSources: string[] = [];
    const counts: Record<string, number> = {};
    for (const source of ['document', 'products', 'website', 'faqs'] as const) {
      const result = await deleteSource(tx, merchantId, source);
      counts[source] = result.deleted;
      counts[`${source}_sections`] = result.sections;
      if (result.deleted || result.sections) deletedSources.push(source);
    }
    counts.knowledge_sections = await deleteSections(tx, merchantId);
    if (counts.knowledge_sections) deletedSources.push('knowledge_sections');
    await tx.insert(sariActivityLog).values({ merchantId, actionType: 'brain_reset', description: 'تم إعادة ضبط مصادر المعرفة', details: JSON.stringify({ deletedSources, counts }) });
    return { deletedSources, counts };
  });
}
