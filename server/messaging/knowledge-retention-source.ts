/** A queue body is evidence only while the same tenant still needs its source.
 * References retain data; they never grant approval or bypass source validation.
 * Static SQL: `j` is the single UPDATE target alias in retention.ts. */
export const activeKnowledgeReferenceSql = `(
  EXISTS (
    SELECT 1 FROM merchant_onboarding_answers a
    JOIN merchant_onboarding_events e ON e.merchant_id=a.merchant_id AND e.event_key=a.verified_event_key
    WHERE a.merchant_id=j.merchant_id AND e.event_key=j.event_key
      AND JSON_EXTRACT(e.source_json,'$.inboundId')=j.id
      AND JSON_EXTRACT(e.source_json,'$.instanceId')=j.instance_id
      AND JSON_EXTRACT(e.source_json,'$.merchantId')=j.merchant_id
      AND JSON_UNQUOTE(JSON_EXTRACT(e.source_json,'$.digest'))=e.source_digest
  ) OR EXISTS (
    SELECT 1 FROM knowledge_sections s
    WHERE s.merchant_id=j.merchant_id
      AND (s.valid_until IS NULL OR s.valid_until>UTC_TIMESTAMP(3))
      AND (s.status='pending_review' OR (s.status IN ('approved','auto_approved') AND s.use_in_bot=1 AND s.inject_as<>'none'))
      AND JSON_UNQUOTE(JSON_EXTRACT(s.provenance,'$.origin'))='contextual_whatsapp_teaching'
      AND JSON_EXTRACT(s.provenance,'$.manualReview') IS NULL
      AND JSON_EXTRACT(s.provenance,'$.version')=1
      AND JSON_EXTRACT(s.provenance,'$.inboundId')=j.id
      AND JSON_EXTRACT(s.provenance,'$.instanceId')=j.instance_id
      AND s.source_url=CONCAT('whatsapp-teaching://',j.event_key)
  ) OR EXISTS (
    SELECT 1 FROM knowledge_sections s
    JOIN merchant_teaching_turns t ON t.merchant_id=s.merchant_id
      AND t.event_key=JSON_UNQUOTE(JSON_EXTRACT(s.provenance,'$.eventKey'))
      AND JSON_EXTRACT(t.result_json,'$.sectionId')=s.id
      AND t.source_digest=JSON_UNQUOTE(JSON_EXTRACT(s.provenance,'$.sourceDigest'))
    WHERE s.merchant_id=j.merchant_id
      AND (s.valid_until IS NULL OR s.valid_until>UTC_TIMESTAMP(3))
      AND (s.status='pending_review' OR (s.status IN ('approved','auto_approved') AND s.use_in_bot=1 AND s.inject_as<>'none'))
      AND JSON_UNQUOTE(JSON_EXTRACT(s.provenance,'$.origin'))='contextual_whatsapp_dialogue'
      AND JSON_EXTRACT(s.provenance,'$.manualReview') IS NULL
      AND JSON_EXTRACT(s.provenance,'$.version')=2
      AND s.source_url=CONCAT('whatsapp-dialogue://',t.event_key)
      AND (
        (JSON_EXTRACT(t.source_json,'$.inboundId')=j.id
          AND JSON_EXTRACT(t.source_json,'$.instanceId')=j.instance_id
          AND JSON_EXTRACT(t.source_json,'$.merchantId')=j.merchant_id
          AND JSON_UNQUOTE(JSON_EXTRACT(t.source_json,'$.eventKey'))=j.event_key)
        OR EXISTS (SELECT 1 FROM JSON_TABLE(t.context_json,'$.fragments[*]' COLUMNS (
          inbound_id INT PATH '$.inboundId', merchant_id INT PATH '$.merchantId',
          instance_id INT PATH '$.instanceId', event_key VARCHAR(64) PATH '$.eventKey'
        )) f WHERE f.inbound_id=j.id AND f.merchant_id=j.merchant_id
          AND f.instance_id=j.instance_id AND f.event_key=j.event_key)
      )
  ) OR EXISTS (
    SELECT 1 FROM merchant_teaching_drafts d
    JOIN JSON_TABLE(d.fragments_json,'$[*]' COLUMNS (
      inbound_id INT PATH '$.inboundId', merchant_id INT PATH '$.merchantId',
      instance_id INT PATH '$.instanceId', event_key VARCHAR(64) PATH '$.eventKey'
    )) f ON f.inbound_id=j.id AND f.merchant_id=j.merchant_id
      AND f.instance_id=j.instance_id AND f.event_key=j.event_key
    WHERE d.merchant_id=j.merchant_id AND d.instance_id=j.instance_id
      AND d.status='draft' AND d.updated_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)
  )
)`;

/** Keep the original identity, complete new text and quote IDs used by proof
 * readers. Drop profile names, quoted bodies, media URLs and arbitrary metadata.
 * Do not reconstruct any missing/redacted text from a derived knowledge copy. */
export const minimalKnowledgePayloadSql = `JSON_OBJECT(
  'knowledgeEvidenceVersion',1,
  'typeWebhook',JSON_EXTRACT(j.payload_json,'$.typeWebhook'),
  'sourceProvider',JSON_EXTRACT(j.payload_json,'$.sourceProvider'),
  'idMessage',JSON_EXTRACT(j.payload_json,'$.idMessage'),
  'instanceData',JSON_OBJECT('idInstance',JSON_EXTRACT(j.payload_json,'$.instanceData.idInstance')),
  'senderData',JSON_OBJECT(
    'sender',JSON_EXTRACT(j.payload_json,'$.senderData.sender'),
    'chatId',JSON_EXTRACT(j.payload_json,'$.senderData.chatId')),
  'messageData',JSON_OBJECT(
    'typeMessage',JSON_EXTRACT(j.payload_json,'$.messageData.typeMessage'),
    'textMessageData',JSON_OBJECT('textMessage',JSON_EXTRACT(j.payload_json,'$.messageData.textMessageData.textMessage')),
    'quotedMessage',JSON_OBJECT('stanzaId',JSON_EXTRACT(j.payload_json,'$.messageData.quotedMessage.stanzaId')),
    'extendedTextMessageData',JSON_OBJECT(
      'text',JSON_EXTRACT(j.payload_json,'$.messageData.extendedTextMessageData.text'),
      'stanzaId',JSON_EXTRACT(j.payload_json,'$.messageData.extendedTextMessageData.stanzaId'),
      'quotedMessage',JSON_OBJECT('stanzaId',JSON_EXTRACT(j.payload_json,'$.messageData.extendedTextMessageData.quotedMessage.stanzaId'))
    )
  )
)`;
