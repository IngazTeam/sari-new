import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Behavioral coverage lives in review-workspace-access.test.ts and the isolated
// review-workspace/review-reply MySQL suites, with owned, cleaned-up fixtures.
const db = readFileSync('server/db.ts', 'utf8');
it.each([
  'createCustomerReview', 'getCustomerReviewById', 'getCustomerReviewsByMerchantId',
  'getCustomerReviewsByOrderId', 'getPublicReviews', 'updateCustomerReview',
  'getOrdersForReviewRequest', 'markOrderReviewRequested',
])('keeps the unscoped legacy helper %s retired', name => {
  expect(db).not.toMatch(new RegExp(`export\\s+async\\s+function\\s+${name}\\b`));
});
