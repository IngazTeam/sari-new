import type { PoolConnection } from 'mysql2/promise';
import { catalogVisibleSql } from '../integrations/catalog-scope';

export type ConversationCatalogItem = {
  id: number; name: string; provider: string;
  description?: string; category?: string; priceMinor?: number | null; currency?: string;
};
const stopWords = new Set('من في على عن هذا هذه ذلك اللي إلى الى مع او أو و هل ما كم كيف ابغى اريد أريد ممكن عندكم عندك ابي لي هو هي ان أن the a an and or for to of in is are i want need please this that it how much'.split(' '));
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي');

/** Retrieval hints only: matching a word never selects an item or authorizes an action. */
export function catalogSearchTerms(text: string): string[] {
  return Array.from(new Set(normalize(text).split(new RegExp('[^\\p{L}\\p{N}]+', 'u'))
    .map(word => word.replace(/^(?:لل|ال)(?=.{3})/, ''))
    .filter(word => word.length >= 2 && word.length <= 64 && !stopWords.has(word) && !/^\d+$/.test(word)))).slice(0, 12);
}

export async function readConversationCatalog(c: PoolConnection, input: {
  merchantId: number;
  messages: { role: 'user' | 'assistant'; content: string }[];
  previousProductIds?: number[];
}): Promise<ConversationCatalogItem[]> {
  if (!Number.isSafeInteger(input.merchantId) || input.merchantId < 1) throw Error('Invalid catalogue tenant');
  const currentTerms = catalogSearchTerms(input.messages.at(-1)?.content || '');
  const historyTerms = catalogSearchTerms(input.messages.slice(-5, -1).map(m => m.content).join(' '))
    .filter(term => !currentTerms.includes(term)).slice(0, 8);
  const pinned = Array.from(new Set(input.previousProductIds || [])).filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 20);
  const searchable = "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(CONCAT_WS(' ',name,nameAr,description,descriptionAr,category,sku),'أ','ا'),'إ','ا'),'آ','ا'),'ى','ي'))";
  const rankings: string[] = [];
  const rankArgs: (string | number)[] = [];
  if (pinned.length) {
    rankings.push(`IF(id IN (${pinned.map(() => '?').join(',')}),200,0)`);
    rankArgs.push(...pinned);
  }
  for (const [terms, weight] of [[currentTerms, 8], [historyTerms, 2]] as const) {
    for (const term of terms) { rankings.push(`IF(LOCATE(?,${searchable})>0,${weight},0)`); rankArgs.push(term); }
  }
  // Search the whole tenant catalogue before limiting the model context. No foreign,
  // retired, unverified-price or out-of-stock item is promoted by the search rank.
  const [rows] = await c.execute<any[]>(`SELECT id,COALESCE(NULLIF(nameAr,''),name) AS name,
    LEFT(CONCAT_WS(' ',descriptionAr,description),600) AS description,category,price,currency,sallaProductId
    FROM products WHERE merchantId=? AND isActive=1 AND status='active' AND price_unit='minor'
      AND (registration_open IS NULL OR registration_open=1)
      AND (product_type IN ('digital','service') OR track_inventory=0 OR stock>0)
      AND ${catalogVisibleSql()}
    ORDER BY ${rankings.length ? `(${rankings.join('+')}) DESC,` : ''} id LIMIT 200`, [input.merchantId, ...rankArgs]);
  const [zid] = await c.execute<any[]>("SELECT id FROM platform_integrations WHERE merchant_id=? AND platform_type='zid' AND is_active=1 LIMIT 1", [input.merchantId]);
  let descriptionBudget = 24000;
  return rows.map(p => {
    const description = String(p.description || '').slice(0, descriptionBudget);
    descriptionBudget -= description.length;
    return { id: p.id, name: String(p.name).slice(0, 255), description,
    category: String(p.category || '').slice(0, 100), priceMinor: Number.isSafeInteger(p.price) && p.price >= 0 ? p.price : null,
    currency: p.currency, provider: String(p.sallaProductId || '').startsWith('byaan:') ? 'byaan_checkout' : zid.length ? 'zid' : p.sallaProductId ? 'salla_cart' : 'local' };
  });
}
