import { z } from 'zod';

export const memoryFields = ['preferredName', 'budget', 'priceConscious', 'qualityFocused', 'urgentBuyer',
  'fastDelivery', 'brandConscious', 'painPoints', 'interestTags', 'buyingStage', 'sentiment', 'lastObjection'] as const;
export type MemoryField = typeof memoryFields[number];
const shortText = z.string().trim().min(1).max(160).refine(v => !/[\u0000-\u001f\u007f<>]/.test(v));
export const memoryValueSchemas = {
  preferredName: z.string().trim().min(1).max(80).regex(new RegExp("^[\\p{L}\\p{M} '’-]+$", 'u')),
  budget: z.object({ amountMinor: z.number().int().positive().max(100_000_000), currency: z.enum(['SAR', 'USD', 'AED']) }).strict(),
  priceConscious: z.boolean(), qualityFocused: z.boolean(), urgentBuyer: z.boolean(), fastDelivery: z.boolean(), brandConscious: z.boolean(),
  painPoints: z.array(shortText).max(5), interestTags: z.array(shortText).max(5),
  buyingStage: z.enum(['exploring', 'comparing', 'ready', 'returning']),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'frustrated']),
  lastObjection: z.enum(['price', 'delivery', 'quality', 'trust']).nullable(),
} satisfies Record<MemoryField, z.ZodTypeAny>;
export type CustomerMemoryFact = { field: MemoryField; value: unknown; kind: 'explicit' | 'inferred';
  sourceMessageId: number; conversationId: number; observedAt: string; expiresAt: string; revision: number };

export const inferredMemorySchema = z.object({ facts: z.array(z.object({
  field: z.enum(memoryFields).refine(f => f !== 'preferredName' && f !== 'budget', 'Identity and budget require direct statements'),
  value: z.unknown(), sourceMessageId: z.number().int().positive(),
}).strict().superRefine((fact, ctx) => {
  if (!memoryValueSchemas[fact.field].safeParse(fact.value).success) ctx.addIssue({ code: 'custom', message: 'Invalid memory value' });
})).max(memoryFields.length).refine(facts => new Set(facts.map(f => f.field)).size === facts.length, 'Duplicate memory field') }).strict();

type DirectMemory = { kind: 'set'; field: MemoryField; value: unknown } | { kind: 'forget'; field: MemoryField | 'all' };
/** Deliberately bounded grammar: no questions, compound clauses, uncertain amounts or implicit currency. */
export function parseDirectMemory(text: string): DirectMemory | null {
  const s = text.normalize('NFKC').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/٫/g, '.').trim().replace(/[.!。]+$/, '').trim();
  if (/^(?:احذف|امسح) ذاكرة المبيعات الخاصة بي$|^forget my sales memory$/i.test(s)) return { kind: 'forget', field: 'all' };
  if (/^(?:انس|احذف) ميزانيتي$|^forget my budget$/i.test(s)) return { kind: 'forget', field: 'budget' };
  if (/^(?:انس|احذف) اسمي المفضل$|^forget my preferred name$/i.test(s)) return { kind: 'forget', field: 'preferredName' };
  const name = s.match(new RegExp("^(?:نادني|ناديني|call me) ([\\p{L}\\p{M} '’-]{1,80})$", 'iu'))?.[1];
  if (name && name.trim().split(/\s+/).length <= 4 && !/(?:تجاهل|تعليمات|ignore|system|instructions)/i.test(name)) {
    return { kind: 'set', field: 'preferredName', value: name.trim() };
  }
  const budget = s.match(/^(?:(?:عدل|عدّل|غير|غيّر) ميزانيتي (?:إلى|الى)|ميزانيتي(?: الآن| الان| الحالية)?|my budget is|change my budget to) ([0-9]{1,7}(?:\.[0-9]{1,2})?) (ريال(?: سعودي)?|ر\.س|SAR|دولار|USD|درهم|AED)$/i);
  if (budget) {
    const [whole, fraction = ''] = budget[1].split('.');
    const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    const currency = /^(?:دولار|USD)$/i.test(budget[2]) ? 'USD' : /^(?:درهم|AED)$/i.test(budget[2]) ? 'AED' : 'SAR';
    const value = { amountMinor, currency };
    if (memoryValueSchemas.budget.safeParse(value).success) return { kind: 'set', field: 'budget', value };
  }
  const preferences: Record<string, [MemoryField, boolean]> = {
    'السعر أهم شيء عندي': ['priceConscious', true], 'السعر ليس أولويتي': ['priceConscious', false],
    'الجودة أهم شيء عندي': ['qualityFocused', true], 'أحتاج توصيل سريع': ['fastDelivery', true],
    'لست مستعجلا': ['urgentBuyer', false], 'لست مستعجلاً': ['urgentBuyer', false],
  };
  const pref = preferences[s];
  return pref ? { kind: 'set', field: pref[0], value: pref[1] } : null;
}

/** JSON escaping preserves the data boundary; this is not a claim of universal prompt-injection protection. */
export function serializeMemoryData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
