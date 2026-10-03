import { reviewAutomationReadiness } from '../automation/review-request';

/** No timer, recipient scan or transport while scoped invitations are unavailable. */
export function startReviewRequestJob() {
  console.info('[Review Request Job] Blocked:', reviewAutomationReadiness.reason);
  return reviewAutomationReadiness;
}
