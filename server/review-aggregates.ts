import { sql } from 'drizzle-orm';
import { reviewSource } from './review-workspace';

/** Use the workspace's fixed relationship policy for every order review chart. */
export function reviewAggregateQuery(merchantId: number, from: string, through: string) {
  if (!Number.isInteger(merchantId) || merchantId < 1 || merchantId > 2147483647) throw Error('Invalid review scope');
  const source = reviewSource('order');
  return sql`SELECT ${sql.raw(source.rating)} AS rating,${sql.raw(source.linked)} AS linked,COUNT(*) AS total
    FROM ${sql.raw(source.from)} WHERE ${sql.raw(source.tenant)}=${merchantId}
    AND ${sql.raw(source.created)}>=${from} AND ${sql.raw(source.created)}<=${through}
    GROUP BY ${sql.raw(source.rating)},${sql.raw(source.linked)}`;
}

export function summarizeReviewGroups(rows: unknown) {
  if (!Array.isArray(rows)) throw Error('Invalid review aggregates');
  const count = (value: unknown) => {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) throw Error('Invalid review count');
    const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw Error('Invalid review count'); return n;
  };
  let linked = 0, unlinked = 0, rated = 0, weighted = 0, positive = 0;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) {
    if (!row || ![0, 1, '0', '1'].includes(row.linked)) throw Error('Invalid review relationship');
    const n = count(row.total);
    if (Number(row.linked) === 0) { unlinked = count(unlinked + n); continue; }
    linked = count(linked + n);
    if (!Number.isInteger(row.rating) || row.rating < 1 || row.rating > 5) continue;
    rated = count(rated + n); weighted = count(weighted + row.rating * n);
    distribution[row.rating] = count(distribution[row.rating] + n);
    if (row.rating >= 4) positive = count(positive + n);
  }
  return { linked, unlinked, rated, invalidRatings: linked - rated, positive, average: rated ? weighted / rated : null, distribution };
}
