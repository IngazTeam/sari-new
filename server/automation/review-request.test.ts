import { describe, expect, it, vi } from 'vitest';

// Importing a side-effect module is itself a failure. This suite never touches
// a developer database or sends a message to a test phone.
vi.mock('../db', () => { throw new Error('Legacy review automation reached the database'); });
vi.mock('../whatsapp', () => { throw new Error('Legacy review automation reached global WhatsApp'); });
vi.mock('../channels/whatsapp/service', () => { throw new Error('No invitation authorizes tenant WhatsApp'); });
vi.mock('node-cron', () => { throw new Error('A blocked review job must not schedule'); });
import { generateReviewMessage, getMerchantReviewStats, processReviewResponse, REVIEW_AUTOMATION_BLOCKED, reviewAutomationReadiness, sendReviewRequest, shouldRequestReview } from './review-request';
import { startReviewRequestJob } from '../jobs/review-request';

describe('review automation safety boundary', () => {
  it.each([1, 2147483647, 0, -1, NaN, Infinity])('does not look up, qualify or send bare order ID %s', async id => {
    expect(await shouldRequestReview(id)).toBe(false);
    expect(await sendReviewRequest(id)).toEqual({ success: false, error: REVIEW_AUTOMATION_BLOCKED });
  });
  it.each([1, 2, 3, 4, 5])('does not fabricate a customer review or selectively publish score %s', async rating => {
    expect(await processReviewResponse(123, rating, 'Unverified text')).toEqual({ success: false, error: REVIEW_AUTOMATION_BLOCKED });
  });
  it.each([NaN, Infinity, -Infinity, 0, 6, 1.5, '5', null, undefined])('rejects invalid score %s without side effects', async rating => {
    expect(await processReviewResponse(123, rating as number)).toEqual({ success: false, error: 'Invalid rating' });
  });
  it('does not report missing authority as empty/zero statistics', async () => {
    await expect(getMerchantReviewStats(123)).rejects.toThrow('review_request:authenticated_workspace_required');
  });
  it('reports blocked startup without a scheduler or recipient scan', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      expect(startReviewRequestJob()).toBe(reviewAutomationReadiness);
      expect(reviewAutomationReadiness).toMatchObject({ state: 'blocked', schedulesMessages: false });
      expect(log).toHaveBeenCalledWith('[Review Request Job] Blocked:', REVIEW_AUTOMATION_BLOCKED);
      expect(Object.isFrozen(reviewAutomationReadiness.requirements)).toBe(true);
    } finally { log.mockRestore(); }
  });
  it('shows an unambiguous increasing score, with five stars best', () => {
    const message = generateReviewMessage('أحمد', 'LOCAL-123', 'متجر المثال');
    expect(message).toContain('أحمد'); expect(message).toContain('#LOCAL-123'); expect(message).toContain('متجر المثال');
    expect(message.split('\n').filter(line => /^\d ·/.test(line))).toEqual([
      '5 · ⭐⭐⭐⭐⭐ ممتاز', '4 · ⭐⭐⭐⭐ جيد جداً', '3 · ⭐⭐⭐ جيد', '2 · ⭐⭐ مقبول', '1 · ⭐ ضعيف',
    ]);
  });
});
