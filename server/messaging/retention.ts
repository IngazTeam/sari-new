import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import {
  activeKnowledgeReferenceSql,
  minimalKnowledgePayloadSql,
} from "./knowledge-retention-source";

/** Redact unused bodies; minimize still-referenced business evidence. Neither
 * operation resets the retention clock, recreates a source, or approves it. */
export async function purgeCompletedInboundPayloads(
  limit = 500
): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid retention batch");
  await assertRuntimeSchema("Knowledge-aware message retention", [
    { table: "merchant_onboarding_answers", columns: ["verified_event_key"] },
    { table: "merchant_onboarding_events" },
    { table: "merchant_onboarding_sessions" },
    { table: "merchant_teaching_drafts" },
    { table: "merchant_teaching_turns" },
    { table: "knowledge_sections", columns: ["provenance", "valid_until"] },
    {
      table: "ai_group_understanding",
      columns: ["decision_json", "inbound_id"],
    },
  ]);
  const pool = await getPool();
  if (!pool) throw new Error("Queue database unavailable");
  // Single-table UPDATEs retain source row locks: teaching commits also lock the
  // original row before attaching evidence. A purged source cannot be revived.
  const eligible = `j.status IN ('completed','dismissed')
    AND j.updated_at < TIMESTAMPADD(DAY,-30,UTC_TIMESTAMP())
    AND j.payload_json <> JSON_OBJECT('redacted',true)`;
  const [minimized] = await pool.execute<any>(
    `UPDATE whatsapp_inbound_jobs j SET j.payload_json=${minimalKnowledgePayloadSql},
       j.reply_plan_json=NULL,j.updated_at=j.updated_at
     WHERE ${eligible} AND ${activeKnowledgeReferenceSql}
       AND (j.payload_json <> ${minimalKnowledgePayloadSql} OR j.reply_plan_json IS NOT NULL)
     ORDER BY j.id LIMIT ${limit}`
  );
  const remaining = limit - Number(minimized.affectedRows);
  let redacted = 0;
  if (remaining > 0) {
    const [result] = await pool.execute<any>(
      `UPDATE whatsapp_inbound_jobs j SET j.payload_json=JSON_OBJECT('redacted',true),
         j.reply_plan_json=NULL,j.updated_at=j.updated_at
       WHERE ${eligible} AND NOT ${activeKnowledgeReferenceSql}
       ORDER BY j.id LIMIT ${remaining}`
    );
    redacted = Number(result.affectedRows);
  }
  const [deliveries] = await pool.execute<any>(
    `UPDATE whatsapp_message_deliveries SET request_json = NULL WHERE request_json IS NOT NULL
     AND status IN ('sent','delivered','read') AND status_updated_at < TIMESTAMPADD(DAY, -30, UTC_TIMESTAMP())
     AND NOT EXISTS (SELECT 1 FROM merchant_onboarding_sessions s WHERE s.merchant_id=whatsapp_message_deliveries.merchant_id
       AND s.instance_id=whatsapp_message_deliveries.instance_id AND s.status='active'
       AND s.delivery_key=whatsapp_message_deliveries.idempotency_key)
     AND NOT EXISTS (SELECT 1 FROM ai_interaction_jobs j WHERE j.usage_outbox_id=whatsapp_message_deliveries.id AND j.usage_state='held')
     AND NOT EXISTS (SELECT 1 FROM ai_sales_staff_replies s WHERE s.merchant_id=whatsapp_message_deliveries.merchant_id
       AND whatsapp_message_deliveries.idempotency_key IN (CONCAT('staff_reply:',s.merchant_id,':',s.id),CONCAT('staff_compat_text:',s.merchant_id,':',s.id)) AND s.status<>'accepted')
     AND NOT EXISTS (SELECT 1 FROM ai_sales_staff_voices s WHERE s.merchant_id=whatsapp_message_deliveries.merchant_id
       AND whatsapp_message_deliveries.idempotency_key IN (CONCAT('staff_voice:',s.merchant_id,':',s.id),CONCAT('staff_compat_voice:',s.merchant_id,':',s.id)) AND s.status<>'accepted')
     AND NOT EXISTS (SELECT 1 FROM sales_escalation_relays s WHERE s.merchant_id=whatsapp_message_deliveries.merchant_id
       AND whatsapp_message_deliveries.idempotency_key=CONCAT('escalation_relay:',s.merchant_id,':',s.escalation_id) AND s.status<>'accepted')
     ORDER BY id LIMIT ${limit}`
  );
  // Keep identifiers for replay protection, but do not retain participants' text
  // in derived AI evidence after its terminal source reaches the retention age.
  const [groups] = await pool.execute<any>(
    `UPDATE ai_group_understanding a SET decision_json=JSON_OBJECT('redacted',true)
     WHERE decision_json<>JSON_OBJECT('redacted',true)
       AND EXISTS (SELECT 1 FROM whatsapp_inbound_jobs j WHERE j.id=a.inbound_id
         AND j.merchant_id=a.merchant_id AND j.instance_id=a.instance_id
         AND j.event_key=a.event_key AND j.status IN ('completed','dismissed')
         AND j.updated_at<TIMESTAMPADD(DAY,-30,UTC_TIMESTAMP()))
     ORDER BY a.id LIMIT ${limit}`
  );
  return (
    Number(minimized.affectedRows) +
    redacted +
    Number(deliveries.affectedRows) +
    Number(groups.affectedRows)
  );
}
