import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `Missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `Missing section end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('10/10 remediation regression guards', () => {
  it('never trusts a browser-supplied merchant id for discounts or notification preferences', () => {
    const discountClient = read('./client/src/pages/DiscountCodes.tsx');
    const notificationClient = read('./client/src/pages/NotificationSettings.tsx');
    const routers = read('./server/routers.ts');
    const discounts = section(routers, 'discounts: router({', '// Referrals & Rewards Management');
    const preferences = section(routers, 'notificationPreferences: router({', '// Email Templates APIs');

    expect(discountClient).not.toMatch(/merchantId\s*=\s*1/);
    expect(discountClient).not.toMatch(/merchantId\s*:/);
    expect(notificationClient).not.toContain('merchants.list');
    expect(discounts).toContain('getMerchantByUserId(ctx.user.id)');
    expect(preferences).toContain('getMerchantByUserId(ctx.user.id)');
  });

  it('keeps quick-response updates tenant-scoped and blocks unverified action claims', () => {
    const routers = read('./server/routers.ts');
    const quickResponses = section(routers, 'quickResponses: router({', '// Sentiment Analysis');

    expect(quickResponses).toContain('getQuickResponseById(input.id)');
    expect(quickResponses).toContain('existingResponse.merchantId !== merchant.id');
    expect(quickResponses).toContain('containsUnverifiedActionClaim(response)');
  });

  it('resolves deterministic quick responses before off-topic classification', () => {
    const personality = read('./server/ai/sari-personality.ts');
    const quickResponseIndex = personality.indexOf('findMatchingQuickResponse(params.merchantId, params.message)');
    const offTopicIndex = personality.indexOf('isOffTopicQuestion(params.message)', quickResponseIndex);

    expect(quickResponseIndex).toBeGreaterThanOrEqual(0);
    expect(offTopicIndex).toBeGreaterThan(quickResponseIndex);
    expect(personality).toContain('containsUnverifiedActionClaim(quickResponse.response)');
    expect(personality).toContain('incrementQuickResponseUse(quickResponse.id)');
  });

  it('sends uploaded voice media through WhatsApp before recording success locally', () => {
    const routers = read('./server/routers.ts');
    const voiceSend = section(routers, 'sendVoiceReply: protectedProcedure', '// ── Sync conversations');
    const voiceUpload = section(routers, 'voice: router({', 'messageAnalytics: router({');
    const client = read('./client/src/pages/merchant/Conversations.tsx');

    expect(voiceSend).toContain('conversation.merchantId !== merchant.id');
    expect(voiceSend).toContain('input.storageKey.startsWith(expectedPrefix)');
    expect(voiceSend).not.toMatch(/audioUrl:\s*z\.string/);
    expect(voiceSend.indexOf('sendFileWithCredentials(')).toBeLessThan(voiceSend.indexOf('createMessage({'));
    expect(voiceSend).toContain('!result.success || !result.messageId');
    expect(voiceUpload).toContain('decodeValidatedAudio(input.audioBase64, input.mimeType)');
    expect(client).toContain('sendVoiceReplyMutation.mutateAsync');
  });

  it('does not route merchants to fabricated analytics screens', () => {
    const app = read('./client/src/App.tsx');

    expect(app).not.toMatch(/import\(["'].+\/(SariAnalytics|AdvancedAnalytics|AdvancedAnalyticsDashboard)["']\)/);
    expect(app).toContain('<Route path="/merchant/sari-analytics">');
    expect(app).toContain('<Route path="/merchant/advanced-analytics">');
    expect(app).toContain('<Analytics />');
  });

  it('keeps customer export tenant-scoped and CSV-injection safe', () => {
    const routers = read('./server/routers.ts');
    const customers = section(routers, 'customers: router({', '// Website Analysis');
    const csv = read('./server/utils/csv.ts');

    expect(customers).toContain('exportCsv: protectedProcedure.query(async ({ ctx })');
    expect(customers).toContain('getMerchantByUserId(ctx.user.id)');
    expect(csv).toMatch(/FORMULA_PREFIX/);
    expect(csv).toContain("text = `'${text}`;");
  });
});
