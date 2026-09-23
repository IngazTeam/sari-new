import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { knowledgeChangelog, knowledgeSections } from '../../drizzle/schema';
import { withKnowledgeTransaction } from './transaction';

const inputSchema = z.object({
  merchantId: z.number().int().positive(), question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(2000),
  origin: z.enum(['teach_command', 'coaching_correction', 'escalation_reply']),
  referenceId: z.number().int().positive().optional(),
}).strict();

/** Only an explicit general teaching command is approval to reuse knowledge across customers.
 * Approving a reply to one customer is NOT approval to publish it to every customer. */
export async function saveMerchantTeaching(input: z.infer<typeof inputSchema>) {
  const data = inputSchema.parse(input);
  const approved = data.origin === 'teach_command';
  const key = createHash('sha256').update(JSON.stringify([data.origin, data.referenceId ?? null, data.question])).digest('hex');
  const sourceUrl = `merchant-teaching://${key}`;
  const content = `السؤال: ${data.question}\nالمعلومة: ${data.answer}`;
  return withKnowledgeTransaction(data.merchantId, async tx => {
    const [existing] = await tx.select().from(knowledgeSections).where(and(
      eq(knowledgeSections.merchantId, data.merchantId), eq(knowledgeSections.sourceUrl, sourceUrl))).for('update');
    // Retried webhook/coaching approval must not duplicate, re-publish or revoke a reviewed record.
    if (existing?.content === content) return { sectionId: existing.id, approved: existing.status === 'approved' && !!existing.useInBot };
    const fields = {
      title: data.question, content, source: 'manual' as const, sectionType: 'faq' as const,
      status: approved ? 'approved' as const : 'pending_review' as const, useInBot: approved ? 1 : 0,
      injectAs: 'fact' as const, merchantEdited: 1, embedding: null, embeddingContentHash: null,
      provenance: { origin: data.origin, referenceId: data.referenceId ?? null, scope: approved ? 'merchant' : 'needs_generalization',
        recordedAt: new Date().toISOString(), approval: approved ? 'explicit_merchant_teaching' : 'required' },
    };
    let sectionId: number;
    if (existing) {
      await tx.update(knowledgeSections).set(fields).where(and(eq(knowledgeSections.id, existing.id), eq(knowledgeSections.merchantId, data.merchantId)));
      sectionId = existing.id;
    } else {
      const [result] = await tx.insert(knowledgeSections).values({ ...fields, merchantId: data.merchantId, sourceUrl });
      sectionId = Number(result.insertId);
    }
    await tx.insert(knowledgeChangelog).values({ merchantId: data.merchantId, sectionId,
      action: approved ? 'manual_edit' : 'conflict', source: data.origin,
      reason: approved ? 'تعليم عام صريح من التاجر' : 'تصحيح حالة فردية؛ يجب تنقيحه واعتماده قبل تعميمه',
      oldContent: existing?.content ?? null, newContent: content });
    return { sectionId, approved };
  });
}
