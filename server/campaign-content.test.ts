import { describe, expect, it } from 'vitest';
import { CAMPAIGN_OPT_OUT_NOTICE_AR, campaignMessageIssue, withCampaignOptOutNotice } from '../shared/campaign-message';
import { assertCampaignContent, CampaignContentError } from './campaign-content';

describe('final campaign payload bounds shared with the preview', () => {
  it.each(['', ' \n ', null, undefined, 42])('rejects empty or malformed content %j', message => {
    expect(campaignMessageIssue(message, null)).toBe('empty_message');
    expect(() => assertCampaignContent(message, null)).toThrow(CampaignContentError);
  });
  it.each(['', 'http://example.test/x', 'javascript:alert(1)', 'https://user:password@example.test/x', 'not a URL', 42])('rejects unsafe image input %j', image => {
    expect(campaignMessageIssue('Hello', image)).toBe('invalid_image');
  });
  it.each([null, 'https://example.test/image.png'])('accepts the exact outgoing limit and rejects one unit above it (%s)', image => {
    const limit = image ? 1024 : 4096, length = limit - CAMPAIGN_OPT_OUT_NOTICE_AR.length - 2;
    expect(withCampaignOptOutNotice('x'.repeat(length))).toHaveLength(limit);
    expect(campaignMessageIssue('x'.repeat(length), image)).toBeNull();
    expect(campaignMessageIssue('x'.repeat(length + 1), image)).toBe(image ? 'caption_too_long' : 'text_too_long');
  });
  it.each(['إلغاء الاشتراك', 'الغاء الاشتراك', 'unsubscribe', 'opt-out'])('does not append a second notice when the existing content contains %s', notice => {
    const text = `x`.repeat(1024 - notice.length - 1) + ' ' + notice;
    expect(withCampaignOptOutNotice(text)).toBe(text);
    expect(campaignMessageIssue(text, 'https://example.test/image.png')).toBeNull();
    expect(campaignMessageIssue(text + 'x', 'https://example.test/image.png')).toBe('caption_too_long');
  });
  it('uses the same UTF-16 measure as transport for emoji and trims outer whitespace', () => {
    const text = '😀'.repeat(500);
    expect(campaignMessageIssue(text, 'https://example.test/image.png')).toBe('caption_too_long');
    expect(campaignMessageIssue(' \nHello\n ', undefined)).toBeNull();
    expect(withCampaignOptOutNotice(' \nHello\n ')).toBe(`Hello\n\n${CAMPAIGN_OPT_OUT_NOTICE_AR}`);
  });
});
