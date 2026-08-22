export class ApiFaqSyncValidationError extends Error {
  constructor() {
    super('Invalid API FAQ sync entry');
    this.name = 'ApiFaqSyncValidationError';
  }
}

export interface NormalizedApiFaq {
  externalId: string;
  question: string;
  answer: string;
  category: string;
}

function cleanText(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

export function normalizeApiFaqBatch(faqs: unknown): Map<string, NormalizedApiFaq> {
  if (!Array.isArray(faqs) || faqs.length > 50) throw new ApiFaqSyncValidationError();
  const normalized = new Map<string, NormalizedApiFaq>();
  for (const raw of faqs) {
    if (!raw || typeof raw !== 'object') throw new ApiFaqSyncValidationError();
    const faq = raw as Record<string, unknown>;
    if (
      (typeof faq.id !== 'string' && typeof faq.id !== 'number')
      || (typeof faq.id === 'number' && !Number.isFinite(faq.id))
      || typeof faq.question !== 'string'
      || typeof faq.answer !== 'string'
      || (faq.category !== undefined && faq.category !== null && typeof faq.category !== 'string')
    ) {
      throw new ApiFaqSyncValidationError();
    }
    const externalId = String(faq.id).trim();
    const question = cleanText(faq.question);
    const answer = cleanText(faq.answer);
    const category = faq.category === undefined || faq.category === null || faq.category === ''
      ? 'عام'
      : cleanText(faq.category as string);
    if (
      !externalId || externalId.length > 100 || /[\u0000-\u001f\u007f]/.test(externalId)
      || !question || question.length > 500
      || !answer || answer.length > 2_000
      || !category || category.length > 100
    ) {
      throw new ApiFaqSyncValidationError();
    }
    normalized.set(externalId, { externalId, question, answer, category });
  }
  return normalized;
}
