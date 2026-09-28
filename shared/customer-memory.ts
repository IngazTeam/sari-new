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

export const contextualMemoryFactSchema = z.object({
  field: z.enum(memoryFields), kind: z.enum(['explicit', 'inferred']),
  // Canonical object order is essential: MySQL JSON reorders object keys before the seal is read again.
  value: z.union([z.string(),z.boolean(),memoryValueSchemas.budget,z.array(z.string()).max(5),z.null()]),
  evidence: z.array(z.object({ messageId: z.number().int().positive(), excerpt: z.string().min(1).max(300) }).strict()).min(1).max(3),
}).strict().superRefine((fact, ctx) => {
  if (!memoryValueSchemas[fact.field].safeParse(fact.value).success) ctx.addIssue({code:'custom',message:'Invalid contextual memory value'});
  if (['preferredName','budget'].includes(fact.field) && fact.kind !== 'explicit') ctx.addIssue({code:'custom',message:'Identity and budget require explicit context'});
});
export type ContextualMemoryFact = z.infer<typeof contextualMemoryFactSchema>;

/** Explicit privacy controls remain available without a paid model. Free-text facts require the interpreter. */
export function parseDirectMemory(text: string): { kind: 'forget'; field: MemoryField | 'all' } | null {
  const s = text.normalize('NFKC').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/٫/g, '.').trim().replace(/[.!。]+$/, '').trim();
  if (/^(?:احذف|امسح) ذاكرة المبيعات الخاصة بي$|^forget my sales memory$/i.test(s)) return { kind: 'forget', field: 'all' };
  if (/^(?:انس|احذف) ميزانيتي$|^forget my budget$/i.test(s)) return { kind: 'forget', field: 'budget' };
  if (/^(?:انس|احذف) اسمي المفضل$|^forget my preferred name$/i.test(s)) return { kind: 'forget', field: 'preferredName' };
  return null;
}

/** JSON escaping preserves the data boundary; this is not a claim of universal prompt-injection protection. */
export function serializeMemoryData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
