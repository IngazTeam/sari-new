import { expect, it } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
import { reviewAggregateQuery, summarizeReviewGroups } from './review-aggregates';

it('weights valid linked scores and keeps conflicts separate from invalid scores', () => {
  const a = summarizeReviewGroups([{ rating: 5, linked: 1, total: '2' }, { rating: 1, linked: '1', total: 1 },
    { rating: 9, linked: 1, total: 3 }, { rating: 5, linked: 0, total: 40 }, { rating: null, linked: '0', total: 1 }]);
  expect(a).toEqual({ linked: 6, unlinked: 41, rated: 3, invalidRatings: 3, positive: 2, average: 11 / 3,
    distribution: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 2 } });
});
it.each([[], [{ rating: 8, linked: 1, total: 2 }], [{ rating: 5, linked: 0, total: 3 }]].map(rows => ({ rows })))('has no invented zero average for $rows', ({ rows }) => {
  expect(summarizeReviewGroups(rows).average).toBeNull();
});
it.each([null, {}, [{ rating: 5, total: 1 }], [{ rating: 5, linked: true, total: 1 }],
  [{ rating: 5, linked: 1, total: -1 }], [{ rating: 5, linked: 1, total: null }],
  [{ rating: 5, linked: 1, total: 1.5 }], [{ rating: 5, linked: 1, total: Number.MAX_SAFE_INTEGER }]].map(rows => ({ rows })))('fails malformed aggregates rather than reporting zero $rows', ({ rows }) => {
  expect(() => summarizeReviewGroups(rows)).toThrow();
});
it('binds all variable scope/date values and shares tenant-scoped optional product joins', () => {
  const d = new MySqlDialect(), q = d.sqlToQuery(reviewAggregateQuery(7, "date' OR 1=1 --", 'through'));
  expect(q.params).toEqual([7, "date' OR 1=1 --", 'through']); expect(q.sql).not.toContain("OR 1=1");
  expect(q.sql).toContain('b.merchantId=r.merchantId'); expect(q.sql).toContain('p.merchantId=r.merchantId');
  expect(q.sql).toContain('r.productId IS NULL OR p.id IS NOT NULL');
});
