/**
 * ═══════════════════════════════════════════════════════════════
 * LAYER 3: Contract Guards — Cross-Layer Integrity
 * ═══════════════════════════════════════════════════════════════
 * 
 * These tests verify that different layers of the system
 * stay synchronized with each other:
 * 
 *   Schema ↔ Router   (MySQL enum must match Zod enum)
 *   Frontend ↔ Backend (UI fields must exist in backend)
 *   Webhook ↔ Polling  (both paths must behave identically)
 *   AI Layer ↔ Config  (bot reads correct settings source)
 * 
 * Purpose: Prevent the exact type of bugs we fixed in GAP-1→5.
 * If someone adds a new tone to the schema but forgets the router,
 * THIS test catches it before production.
 * 
 * Run: npx vitest run server/contract-guards.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { botSettings } from '../drizzle/schema';
import { assistantOptionInput } from '../shared/assistant-options';
import { setupReviewInput, setupCompletionInput } from '../shared/setup-completion';

// Helper: read file with cache
const _cache = new Map<string, string>();
function readFile(path: string): string {
  if (!_cache.has(path)) _cache.set(path, fs.readFileSync(path, 'utf-8'));
  return _cache.get(path)!;
}

// ═══════════════════════════════════════════════════════════════
// CG-01: Schema ↔ Router — bot_settings fields
// ═══════════════════════════════════════════════════════════════
describe('CG-01: bot_settings schema ↔ router contract', () => {
  const schema = () => readFile('./drizzle/schema.ts');
  const router = () => readFile('./server/routers-bot-settings.ts');

  it('tone must accept any string and normalize to valid DB values', () => {
    const s = schema();
    const r = router();

    // Extract tone values from schema: mysqlEnum(['friendly', 'professional', 'casual'])
    const schemaMatch = s.match(/tone:\s*mysqlEnum\(\[([^\]]+)\]/);
    expect(schemaMatch).not.toBeNull();
    const schemaValues = schemaMatch![1].replace(/'/g, '').split(',').map(v => v.trim());

    // Router must use z.string().transform() to accept any value
    expect(r).toContain('tone: z.string().transform(');

    // Router must list all valid schema values in its normalizer
    for (const val of schemaValues) {
      expect(r).toContain(`'${val}'`);
    }

    // Router must default invalid values to 'friendly'
    expect(r).toContain(": 'friendly'");
  });

  it('language enum in schema must match router Zod enum exactly', () => {
    const s = schema();
    const r = router();

    const schemaMatch = s.match(/language:\s*mysqlEnum\(\[([^\]]+)\]/);
    expect(schemaMatch).not.toBeNull();
    const schemaValues = schemaMatch![1].replace(/'/g, '').split(',').map(v => v.trim());

    const routerMatch = r.match(/language:\s*z\.enum\(\[([^\]]+)\]/);
    expect(routerMatch).not.toBeNull();
    const routerValues = routerMatch![1].replace(/'/g, '').split(',').map(v => v.trim());

    expect(routerValues.sort()).toEqual(schemaValues.sort());
  });

  it('autoDiscountEnabled field must exist in both schema and router', () => {
    expect(schema()).toContain('auto_discount_enabled');
    expect(router()).toContain('autoDiscountEnabled');
  });

  it('autoDiscountMaxPercent field must exist in both schema and router', () => {
    expect(schema()).toContain('auto_discount_max_percent');
    expect(router()).toContain('autoDiscountMaxPercent');
  });

  it('autoDiscountExpireHours field must exist in both schema and router', () => {
    expect(schema()).toContain('auto_discount_expire_hours');
    expect(router()).toContain('autoDiscountExpireHours');
  });

  it('groupMode enum in schema must match router Zod enum exactly', () => {
    const s = schema();
    const r = router();

    const schemaMatch = s.match(/group_mode.*mysqlEnum\([^,]*,\s*\[([^\]]+)\]/);
    if (!schemaMatch) return; // Field may use different format

    const schemaValues = schemaMatch[1].replace(/'/g, '').split(',').map(v => v.trim());

    const routerMatch = r.match(/groupMode:\s*z\.enum\(\[([^\]]+)\]/);
    if (!routerMatch) return;

    const routerValues = routerMatch[1].replace(/'/g, '').split(',').map(v => v.trim());
    expect(routerValues.sort()).toEqual(schemaValues.sort());
  });
});

// ═══════════════════════════════════════════════════════════════
// CG-02: Frontend ↔ Backend — BotSettings UI fields
// ═══════════════════════════════════════════════════════════════
describe('CG-02: BotSettings UI ↔ backend field sync', () => {
  const frontend = () => readFile('./client/src/pages/merchant/BotSettings.tsx');
  const router = () => readFile('./server/routers-bot-settings.ts');

  const criticalFields = [
    'autoReplyEnabled',
    'welcomeMessage',
    'responseDelay',
    'tone',
  ];

  for (const field of criticalFields) {
    it(`"${field}" must exist in BOTH frontend and router`, () => {
      expect(frontend()).toContain(field);
      expect(router()).toContain(field);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// CG-03: Webhook ↔ Polling — autoReplyEnabled source parity
// ═══════════════════════════════════════════════════════════════
describe('CG-03: Webhook ↔ Polling — config source parity', () => {
  const webhook = () => readFile('./server/webhooks/greenapi.ts');
  const polling = () => readFile('./server/polling.ts');
  const aiLayer = () => readFile('./server/ai.ts');

  it('webhook must use getBotSettings for bot config (tone, delay, etc.)', () => {
    const w = webhook();
    // Webhook loads botSettings for responseDelay, humanTakeover, working hours
    // autoReplyEnabled is checked in ai.ts processIncomingMessage (single gate)
    expect(w).toContain('getBotSettings');
  });

  it('polling must check botSettings.autoReplyEnabled', () => {
    const p = polling();
    expect(p).toContain('await acceptWhatsAppEvent(');
    expect(webhook()).toContain('await shouldBotRespond(instance.merchantId)');
    expect(readFile('./server/db.ts')).toContain('if (!settings.autoReplyEnabled)');
  });

  it('AI layer processIncomingMessage must NOT check merchants.autoReplyEnabled', () => {
    const ai = aiLayer();
    // Find the processIncomingMessage function body
    const fnStart = ai.indexOf('export async function processIncomingMessage');
    const fnBody = ai.substring(fnStart, fnStart + 600);
    // Must NOT reference merchant.autoReplyEnabled (the old broken pattern)
    expect(fnBody).not.toContain('merchant.autoReplyEnabled');
    // Must reference getBotSettings (the fixed pattern)
    expect(fnBody).toContain('getBotSettings');
  });

  it('webhook and polling must both check humanTakeover', () => {
    expect(webhook()).toContain('humanTakeover');
    expect(polling()).toContain('await acceptWhatsAppEvent(');
    expect(readFile('./server/messaging/inbound-worker.ts')).toContain('executeInbound(job, handleGreenAPIWebhook)');
  });

  it('webhook and polling must both support responseDelay', () => {
    expect(webhook()).toContain('responseDelay');
    expect(polling()).toContain('await acceptWhatsAppEvent(');
    expect(readFile('./server/messaging/inbound-worker.ts')).toContain('executeInbound(job, handleGreenAPIWebhook)');
  });
});

// ═══════════════════════════════════════════════════════════════
// CG-04: LanguageSettings ↔ bot_settings sync
// ═══════════════════════════════════════════════════════════════
describe('CG-04: LanguageSettings must sync via botSettings', () => {
  it('LanguageSettings must read and save botSettings through the reviewed option hook', () => {
    const lang = readFile('./client/src/pages/merchant/LanguageSettings.tsx');
    const hook = readFile('./client/src/hooks/useReviewedAssistantOption.ts');
    const router = readFile('./server/routers-bot-settings.ts');
    expect(lang).toMatch(/import\s*\{\s*useReviewedAssistantOption\s*\}\s*from\s*["']@\/hooks\/useReviewedAssistantOption["']/);
    expect(lang).toMatch(/useReviewedAssistantOption\(\s*["']language["'],\s*readLanguage,\s*input,\s*scope/);
    expect(hook).toContain('trpc.botSettings.get.useQuery');
    expect(hook).toContain('trpc.botSettings.updateOption.useMutation');
    expect(router).toMatch(/updateOption:\s*permissionProcedure\('bot_settings.manage'\)\.input\(assistantOptionInput\)/);
    expect(router).toContain("input.kind === 'language' ? { language: input.language } : input.draft");
    expect(router).toContain('updateBotSettings(ctx.merchantId, patch');
    expect(router).toContain('expectedOptionRevision: input.expectedRevision');
    expect(lang).not.toContain('settings.update');
  });

  it('LanguageSettings must submit a revisioned assistant language supported by the database', () => {
    const lang = readFile('./client/src/pages/merchant/LanguageSettings.tsx');
    const hook = readFile('./client/src/hooks/useReviewedAssistantOption.ts');
    expect(lang).toContain('language: draft.language');
    expect(lang).toContain('expectedRevision');
    expect(hook).toContain('mutation.mutateAsync(input(draft, revision))');
    const languages = assistantOptionInput.options.flatMap(option => 'language' in option.shape ? option.shape.language.options : []);
    expect(languages.sort()).toEqual([...botSettings.language.enumValues].sort());
    for (const language of botSettings.language.enumValues) {
      expect(assistantOptionInput.safeParse({ kind: 'language', language, expectedRevision: 'a'.repeat(64) }).success).toBe(true);
    }
    expect(assistantOptionInput.safeParse({ kind: 'language', language: 'invalid', expectedRevision: 'a'.repeat(64) }).success).toBe(false);
    expect(assistantOptionInput.safeParse({ kind: 'language', language: 'ar' }).success).toBe(false);
    expect(lang).not.toContain('changeAppLanguage');
    expect(hook).not.toContain('changeAppLanguage');
  });
});

// ═══════════════════════════════════════════════════════════════
// CG-05: Knowledge Pipeline — cache invalidation coverage
// ═══════════════════════════════════════════════════════════════
describe('CG-05: Knowledge pipeline cache invalidation coverage', () => {
  const brain = () => readFile('./server/routers-sari-brain.ts');

  // Every mutation that changes knowledge must invalidateCache
  const mutations = [
    { name: 'createSection', searchStart: 'createSection: permissionProcedure', window: 3000 },
    { name: 'updateSection', searchStart: 'updateSection: permissionProcedure', window: 3000 },
    { name: 'deleteSection', searchStart: 'deleteSection: permissionProcedure', window: 2000 },
    { name: 'approveSection', searchStart: 'approveSection: permissionProcedure', window: 3000 },
    { name: 'reembedSections', searchStart: 'reembedSections: permissionProcedure', window: 1000 },
  ];

  for (const m of mutations) {
    it(`${m.name} handler must call invalidateCache`, () => {
      const content = brain();
      const idx = content.indexOf(m.searchStart);
      expect(idx).toBeGreaterThan(-1);
      const block = content.substring(idx, idx + m.window);
      expect(block).toContain(['createSection', 'updateSection', 'deleteSection'].includes(m.name) ? 'mutation(retiredSectionMutation)' : 'invalidateCache');
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// CG-06: Auto-Discount Pipeline — end-to-end field contract
// ═══════════════════════════════════════════════════════════════
describe('CG-06: Auto-discount pipeline field contract', () => {
  it('schema discount_codes must have isAutoGenerated + customerPhone', () => {
    const s = readFile('./drizzle/schema.ts');
    expect(s).toContain('is_auto_generated');
    expect(s).toContain('customer_phone');
  });

  it('auto-discount engine must set isAutoGenerated flag', () => {
    const engine = readFile('./server/ai/auto-discount.ts');
    expect(engine).toContain('isAutoGenerated: 1');
  });

  it('action-selector must pass customerMessage to auto-discount', () => {
    const sel = readFile('./server/ai/action-selector.ts');
    expect(sel).toContain('customerMessage');
    expect(sel).toContain('customerName');
  });

  it('webhook must pass customerMessage and customerName to executeAction', () => {
    const wh = readFile('./server/webhooks/greenapi.ts');
    expect(wh).toContain('customerMessage:');
    expect(wh).toContain('customerName:');
  });
});

// ═══════════════════════════════════════════════════════════════
// CG-07: Security Guards — prompt injection defenses
// ═══════════════════════════════════════════════════════════════
describe('CG-07: Prompt injection defense must be present', () => {
  it('customer message sanitizer must exist in ai.ts', () => {
    const ai = readFile('./server/ai.ts');
    expect(ai).toContain('ignore\\s+(all\\s+)?(previous|above|prior)');
    expect(ai).toContain('[filtered]');
  });

  it('website content sanitizer must exist (SEC-01)', () => {
    const ai = readFile('./server/ai.ts');
    expect(ai).toContain('بيانات مرجعية فقط');
    expect(ai).toContain('[role]:');
  });

  it('knowledge doc delimiter must exist (SEC-05)', () => {
    const ai = readFile('./server/ai.ts');
    expect(ai).toContain('بداية بيانات الملف التعريفي');
    expect(ai).toContain('نهاية بيانات الملف التعريفي');
  });

  it('promo text sanitizer must exist (PEN-PROMO-07)', () => {
    const ai = readFile('./server/ai.ts');
    expect(ai).toContain('sanitizeForPrompt');
  });

  it('cross-tenant promo guard must exist (PEN-PROMO-01)', () => {
    const ai = readFile('./server/ai.ts');
    expect(ai).toContain('promo.merchantId === merchantId');
  });
});

// ═══════════════════════════════════════════════════════════════
// CG-08: Group Messaging — reply destination contract
// ═══════════════════════════════════════════════════════════════
describe('CG-08: Group message reply routing', () => {
  it('webhook must track groupChatId for group-mode routing', () => {
    const wh = readFile('./server/webhooks/greenapi.ts');
    expect(wh).toMatch(/(?:let|const)\s+groupChatId(?:\s*:\s*string\s*\|\s*null)?\s*=\s*isGroupMessage\(payload\.senderData\.chatId\)\s*\?\s*payload\.senderData\.chatId\s*:\s*null/);
    expect(wh).toContain("return chatId.endsWith('@g.us')");
  });

  it('main reply send must use groupChatId when available', () => {
    const wh = readFile('./server/webhooks/greenapi.ts');
    expect(wh).toContain('groupChatId || customerPhone');
  });

  it('sendMessageWithCredentials must support pre-formatted @g.us chatIds', () => {
    const wa = readFile('./server/whatsapp.ts');
    const fnIdx = wa.indexOf('export async function sendMessageWithCredentials');
    const fnBlock = wa.substring(fnIdx, fnIdx + 2500);
    expect(fnBlock).toContain("phoneNumber.includes('@')");
  });
});

// ═══════════════════════════════════════════════════════════════
// CG-09: Setup Wizard ↔ Schema — language enum parity
// ═══════════════════════════════════════════════════════════════
describe('CG-09: Setup wizard language ↔ schema parity', () => {
  // routers.ts mounts the extracted setupWizardRouter. Verify both the mount
  // and the implementation module so moving the router cannot weaken parity.
  const liveRouter = () => readFile('./server/routers.ts');
  const standaloneWizard = () => readFile('./server/routers-setup-wizard.ts');

  it('LIVE router must validate review and completion with the shared setup inputs', () => {
    const router = liveRouter();
    expect(router).toContain('import { setupWizardRouter } from "./routers-setup-wizard"');
    expect(router).toContain('setupWizard: setupWizardRouter');
    const wizard = standaloneWizard();
    expect(wizard).toMatch(/import\s*\{\s*setupReviewInput,\s*setupCompletionInput,\s*setupReceiptInput,?\s*\}\s*from\s*["']\.\.\/shared\/setup-completion["']/);
    expect(wizard).toMatch(/reviewSetup:\s*protectedProcedure\s*\.input\(setupReviewInput\)/);
    expect(wizard).toMatch(/completeSetup:\s*protectedProcedure\s*\.input\(setupCompletionInput\)/);
  });

  it('review and completion botLanguage enums must match the bot_settings column', () => {
    for (const input of [setupReviewInput, setupCompletionInput]) {
      const language = input.shape.fields.shape.botLanguage;
      expect([...language.options].sort()).toEqual([...botSettings.language.enumValues].sort());
      for (const value of botSettings.language.enumValues) {
        expect(language.safeParse(value).success).toBe(true);
      }
      expect(language.safeParse('invalid').success).toBe(false);
    }
  });

  it('review and completion botTone enums must match the bot_settings column', () => {
    for (const input of [setupReviewInput, setupCompletionInput]) {
      const tone = input.shape.fields.shape.botTone;
      expect([...tone.options].sort()).toEqual([...botSettings.tone.enumValues].sort());
      for (const value of botSettings.tone.enumValues) {
        expect(tone.safeParse(value).success).toBe(true);
      }
      expect(tone.safeParse('invalid').success).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// CG-10: Group routing — ALL message types use groupChatId
// ═══════════════════════════════════════════════════════════════
describe('CG-10: Complete group routing coverage', () => {
  const webhook = () => readFile('./server/webhooks/greenapi.ts');

  it('routes the complete welcome/reply/media plan through the selected group destination', () => {
    const wh = webhook();
    const plan = wh.slice(wh.indexOf('const replyPlan = buildReplyPlan'), wh.indexOf('const delivery = await dispatchReplyPlan'));
    expect(plan).toContain('to: groupChatId || customerPhone');
    expect(plan).toContain('welcome: plannedWelcome');
    expect(plan).toContain('media: richReply.media');
    expect(readFile('./server/messaging/reply-plan.ts')).toContain('to: input.to');
  });

  it('out-of-hours message must use groupChatId', () => {
    const wh = webhook();
    // Find the out-of-hours block
    const oohIdx = wh.indexOf('outOfHoursMessage');
    const oohBlock = wh.substring(oohIdx, oohIdx + 500);
    expect(oohBlock).toContain('groupChatId || customerPhone');
  });

  it('typing indicator must use groupChatId', () => {
    const wh = webhook();
    const typingIdx = wh.indexOf('sendTypingWithCredentials');
    const typingBlock = wh.substring(typingIdx, typingIdx + 300);
    expect(typingBlock).toContain('groupChatId || customerPhone');
  });
});

// ═══════════════════════════════════════════════════════════════
// CG-11: No stale LanguageSettings file
// ═══════════════════════════════════════════════════════════════
describe('CG-11: Dead code guard', () => {
  it('stale pages/LanguageSettings.tsx must not exist (dead code)', () => {
    const exists = fs.existsSync('./client/src/pages/LanguageSettings.tsx');
    expect(exists).toBe(false);
  });

  it('App.tsx must route to merchant/LanguageSettings (not root)', () => {
    const app = readFile('./client/src/App.tsx');
    expect(app).toContain('pages/merchant/LanguageSettings');
  });
});
