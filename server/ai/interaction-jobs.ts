import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import type { ReplyPlan } from '../messaging/reply-plan';
import { LearningSignalCaptureError } from './learning-signal-capture';
import { checkoutTransaction } from './checkout-agreements';
import { reserveOrdinaryReply, ordinaryReplyDigest, ordinaryReplyText } from './reply-reservation';

export async function assertInteractionSchema() {
  const { assertReplyUsageSchema } = await import('./reply-usage-quota');
  await assertReplyUsageSchema();
  const { assertCheckoutAgreementSchema } = await import('./checkout-agreements');
  await assertCheckoutAgreementSchema();
  const { assertBookingAgreementSchema } = await import('./booking-agreements');
  await assertBookingAgreementSchema();
  await assertRuntimeSchema('sales interaction events', [
    { table: 'ai_sales_sector_settings', columns: ['playbook_id', 'revision', 'updated_by'] },
    { table: 'ai_interaction_jobs', columns: ['reply_origin', 'reply_digest', 'reply_plan', 'sales_delivery_id', 'outgoing_message_reference'], uniqueIndexes: ['uq_ai_interaction_message'] },
    { table: 'sari_learning_signals', columns: ['source_key'], uniqueIndexes: ['uq_learning_source'] },
    { table: 'ai_learning_proposals' },
    { table: 'ai_learning_evidence_links' },
    { table: 'ai_sales_playbooks' },
    { table: 'knowledge_sections', columns: ['embedding_content_hash', 'valid_until', 'provenance'] },
    { table: 'customer_profiles', columns: ['memory_version', 'last_enriched_message_id', 'memory_forget_before_message_id'] },
    { table: 'customer_memory_facts', columns: ['value_json', 'source_message_id', 'expires_at', 'deleted'], uniqueIndexes: ['uq_memory_profile_field'] },
  ]);
}

/** Stage before delivery, so replay of a saved reply also repairs a missing event. */
export async function stageInteraction(plan: ReplyPlan): Promise<void> {
  await checkoutTransaction(c => reserveOrdinaryReply(c, plan));
}

/** Accepted by the transport, not a claim that the customer has read the message. */
export async function finishInteractionDelivery(plan: ReplyPlan, accepted: boolean): Promise<void> {
  if (!plan.incomingMessageId) return;
  const pool = await getPool();
  if (!pool) throw new Error('Interaction storage unavailable');
  await pool.execute(`UPDATE ai_interaction_jobs SET state = ?, available_at = UTC_TIMESTAMP(3)
    WHERE merchant_id = ? AND conversation_id = ? AND incoming_message_id = ? AND state = 'waiting_delivery'
      AND reply_origin='ordinary' AND reply_digest=? AND BINARY reply_text=BINARY ?`,
  [accepted ? 'pending' : 'suppressed', plan.effects[0].merchantId, plan.conversationId, plan.incomingMessageId, ordinaryReplyDigest(plan), ordinaryReplyText(plan)]);
}

export async function runInteractionJob(): Promise<boolean> {
  const pool = await getPool();
  if (!pool) throw new Error('Interaction storage unavailable');
  await pool.execute(`UPDATE ai_interaction_jobs SET state = 'failed', lease_token = NULL,
    lease_until = NULL, last_error = 'attempts_exhausted' WHERE state = 'processing'
    AND lease_until < UTC_TIMESTAMP(3) AND attempts >= 8`);
  const token = randomUUID();
  const connection = await pool.getConnection();
  let job: RowDataPacket | undefined;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT j.* FROM ai_interaction_jobs j
       WHERE ((j.state = 'pending' AND j.available_at <= UTC_TIMESTAMP(3))
         OR (j.state = 'processing' AND j.lease_until < UTC_TIMESTAMP(3)))
       AND j.attempts < 8
       AND NOT EXISTS (SELECT 1 FROM ai_interaction_jobs prior
         WHERE prior.merchant_id = j.merchant_id AND prior.conversation_id = j.conversation_id
         AND prior.id < j.id AND prior.state IN ('pending', 'processing'))
       ORDER BY j.id LIMIT 1 FOR UPDATE SKIP LOCKED`);
    job = rows[0];
    if (job) await connection.execute(`UPDATE ai_interaction_jobs SET state = 'processing',
      attempts = attempts + 1, lease_token = ?, lease_until = TIMESTAMPADD(MINUTE, 5, UTC_TIMESTAMP(3)) WHERE id = ?`,
    [token, job.id]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  if (!job) return false;

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT c.customerPhone, c.customerName, m.content,
        (SELECT CASE WHEN previous.isProcessed = 1 AND previous.aiResponse IS NOT NULL THEN previous.content ELSE NULL END
          FROM messages previous WHERE previous.conversationId = c.id
          AND previous.id < m.id AND previous.direction = 'outgoing' ORDER BY previous.id DESC LIMIT 1) AS previous_bot_response,
        (SELECT COUNT(*) FROM messages history WHERE history.conversationId = c.id
          AND history.direction = 'incoming' AND history.id <= m.id) AS message_count
       FROM conversations c JOIN messages m ON m.conversationId = c.id
       WHERE c.id = ? AND c.merchantId = ? AND m.id = ?`,
      [job.conversation_id, job.merchant_id, job.incoming_message_id]);
    const interaction = rows[0];
    if (!interaction) throw new Error('Interaction source unavailable');
    const { runWithZahyPiContext } = await import('./zahypi-client');
    await runWithZahyPiContext({ merchantId: job.merchant_id, conversationId: job.conversation_id, taskType: 'sari.profile.enrichment' }, async () => {
      const { captureConversationSignals } = await import('./learning-engine');
      const { getOrCreateProfile } = await import('../db/customer-intelligence');
      await captureConversationSignals({ merchantId: job!.merchant_id, conversationId: job!.conversation_id,
        customerMessage: interaction.content || '', botResponse: job!.reply_text,
        previousBotResponse: interaction.previous_bot_response || undefined,
        sourceKey: `message:${job!.incoming_message_id}`, strict: true });
      const profile = await getOrCreateProfile(job!.merchant_id, interaction.customerPhone, interaction.customerName);
      if (Number(interaction.message_count) % 5 === 0) {
        const { enrichCustomerProfile } = await import('./profile-enrichment');
        await enrichCustomerProfile({ merchantId: job!.merchant_id, conversationId: job!.conversation_id,
          customerPhone: interaction.customerPhone, currentProfile: profile, strict: true,
          throughMessageId: job!.incoming_message_id, jobId: job!.id, leaseToken: token });
      }
    });
    await pool.execute(`UPDATE ai_interaction_jobs SET state = 'completed', completed_at = UTC_TIMESTAMP(3),
      lease_token = NULL, lease_until = NULL, last_error = NULL WHERE id = ? AND lease_token = ?`, [job.id, token]);
  } catch (error) {
    if (error instanceof LearningSignalCaptureError && error.code === 'daily_limit') {
      // Admission is deferred, not a failed processing attempt. Preserve the durable source for tomorrow.
      await pool.execute(`UPDATE ai_interaction_jobs SET state='pending', attempts=GREATEST(0,attempts-1),
        available_at=TIMESTAMPADD(DAY,1,UTC_DATE()),lease_token=NULL,lease_until=NULL,last_error='learning_daily_limit'
        WHERE id=? AND lease_token=? AND lease_until>UTC_TIMESTAMP(3)`,[job.id,token]);
      return true;
    }
    await pool.execute(`UPDATE ai_interaction_jobs SET state = IF(attempts >= 8, 'failed', 'pending'),
      available_at = TIMESTAMPADD(SECOND, LEAST(3600, POW(2, attempts) * 15), UTC_TIMESTAMP(3)),
      lease_token = NULL, lease_until = NULL, last_error = 'interaction_processing_failed'
      WHERE id = ? AND lease_token = ?`, [job.id, token]);
  }
  return true;
}

export async function startInteractionWorker(): Promise<() => Promise<void>> {
  await assertInteractionSchema();
  let active: Promise<unknown> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || active) return;
    active = runInteractionJob().catch(() => console.error('[SalesMemory] Durable job remains pending'))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, 2000);
  timer.unref();
  tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
