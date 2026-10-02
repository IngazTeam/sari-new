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
    const discounts = read('./server/routers-discounts.ts');
    expect(routers).toContain('discounts: discountsRouter');
    const preferences = section(routers, 'notificationPreferences: router({', '// Email Templates APIs');

    expect(discountClient).not.toMatch(/merchantId\s*=\s*1/);
    expect(discountClient).not.toMatch(/merchantId\s*:/);
    expect(notificationClient).not.toContain('merchants.list');
    expect(discounts).toContain('merchantProcedure.input');
    expect(discounts).toContain('ctx.user.id, ctx.merchantId');
    expect(discounts).not.toContain('getMerchantByUserId');
    expect(preferences).toContain('getMerchantByUserId(ctx.user.id)');
  });

  it('keeps quick-response updates tenant-scoped and blocks unverified action claims', () => {
    const routers = read('./server/routers.ts');
    expect(routers).toContain('quickResponses: quickResponsesRouter');
    const quickResponses = read('./server/quick-response-workspace.ts');
    expect(read('./server/routers-quick-responses.ts')).toContain('permissionProcedure("bot_settings.manage")');
    expect(quickResponses).toContain('eq(quickResponses.merchantId, merchantId)');
    expect(quickResponses).toContain('containsUnverifiedActionClaim(draft.response)');
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

  it('delegates voice reply effects to the durable service and validates standalone uploads', () => {
    const routers = read('./server/routers.ts');
    const voiceSend = section(routers, "sendVoiceReply: permissionProcedure('conversations.reply')", '...conversationImportProcedures');
    const voiceUpload = section(routers, 'voice: router({', 'messageAnalytics:');
    const client = read('./client/src/pages/merchant/Conversations.tsx');

    expect(voiceSend).toContain('.input(staffVoiceInput)');
    expect(voiceSend).toContain('routeDashboardStaffVoice(ctx.merchantId,ctx.user.id,input)');
    expect(voiceSend).not.toMatch(/audioUrl:\s*z\.string/);
    expect(voiceSend).not.toMatch(/sendFileWithCredentials|storagePut|createMessage/);
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
    expect(routers).toContain('customers: customersRouter,');
    const customers = read('./server/routers-customers.ts');
    const csv = read('./server/utils/csv.ts');

    expect(customers).toContain('export: permissionProcedure("customers.manage")');
    expect(customers).toContain('exportCustomerWorkspace(ctx.merchantId, input)');
    expect(read('./server/customer-workspace.ts')).toContain('buildCsv');
    expect(csv).toMatch(/FORMULA_PREFIX/);
    expect(csv).toContain("text = `'${text}`;");
  });
});
