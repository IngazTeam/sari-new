import type { PoolConnection } from "mysql2/promise";
import { currentInboundExecution } from "./inbound-context";
import { groupHash, type GroupInput } from "../ai/group-understanding";
import { teachingHistoryPhone } from "../knowledge/teaching-source-history";
import { readVerifiedGroupReplies } from "./group-replies";
export const groupJson = (v: any): any =>
  typeof v === "string" ? JSON.parse(v) : v;
type Reader = Pick<PoolConnection, "execute">;
export function groupEnvelope(
  row: any,
  merchantId: number,
  instanceId: number,
  account: string,
  provider: string,
  chat?: string
) {
  const p = groupJson(row.payload_json),
    jid = p?.senderData?.chatId;
  const sender = p?.senderData?.sender;
  if (
    p?.typeWebhook !== "incomingMessageReceived" ||
    !/^\d[\d-]{4,35}@g\.us$/.test(jid || "") ||
    (chat && jid !== chat) ||
    !/^[1-9]\d{7,14}@(?:c\.us|s\.whatsapp\.net)$/.test(sender || "") ||
    Number(row.instance_id) !== instanceId ||
    p.sourceProvider !== provider ||
    String(p.instanceData?.idInstance) !== account ||
    row.event_key !==
      groupHash([merchantId, provider, account, String(p.idMessage || "")]) ||
    row.partition_key !== groupHash([merchantId, jid])
  )
    throw Error("Group source changed");
  const md = p.messageData;
  const text =
    md?.extendedTextMessageData?.text ?? md?.textMessageData?.textMessage;
  if (
    !["textMessage", "extendedTextMessage", "quotedMessage"].includes(
      md?.typeMessage
    ) ||
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 16000 ||
    text.includes("\0")
  )
    throw Error("Group text unavailable");
  const quoteIds = [
    md?.quotedMessage?.stanzaId,
    md?.extendedTextMessageData?.stanzaId,
    md?.extendedTextMessageData?.quotedMessage?.stanzaId,
  ].filter(v => v != null);
  if (
    quoteIds.some(v => typeof v !== "string" || !v || v.length > 255) ||
    new Set(quoteIds).size > 1
  )
    throw Error("Group quote ambiguous");
  return {
    id: Number(row.id),
    jid,
    sender,
    text,
    providerId: String(p.idMessage),
    quote: quoteIds[0] || null,
    mentions: [
      ...(Array.isArray(md?.extendedTextMessageData?.mentionedJidList)
        ? md.extendedTextMessageData.mentionedJidList
        : []),
      ...(Array.isArray(md?.contextInfo?.mentionedJidList)
        ? md.contextInfo.mentionedJidList
        : []),
    ],
  };
}
export async function readGroupContext(c: Reader, lock = false) {
  const e = currentInboundExecution();
  if (!e) throw Error("Owned group source required");
  const end = lock ? " FOR SHARE" : "";
  const [source] = await c.execute<any[]>(
    `SELECT j.*,i.instance_id AS account,i.provider,i.phone_number,m.businessName,m.autoReplyEnabled,m.status AS merchant_status,u.account_status
    FROM whatsapp_inbound_jobs j JOIN whatsapp_instances i ON i.id=j.instance_id AND i.merchant_id=j.merchant_id
    JOIN merchants m ON m.id=j.merchant_id JOIN users u ON u.id=m.userId
    WHERE j.id=? AND j.merchant_id=? AND j.instance_id=? AND j.event_key=? AND j.partition_key=?
      AND j.status='running' AND j.lease_token=? AND j.lease_until>UTC_TIMESTAMP(3) AND i.status='active'
      AND m.status<>'suspended' AND u.account_status='active'${end}`,
    [e.id, e.merchantId, e.instanceId, e.eventKey, e.partitionKey, e.token]
  );
  if (source.length !== 1) throw Error("Group lease or account unavailable");
  const owner = source[0],
    current = groupEnvelope(
      owner,
      e.merchantId,
      e.instanceId,
      owner.account,
      owner.provider
    );
  if (!owner.autoReplyEnabled) throw Error("Group automation disabled");
  const [settings] = await c.execute<any[]>(
    `SELECT * FROM bot_settings WHERE merchant_id=?${end}`,
    [e.merchantId]
  );
  const b = settings[0];
  if (
    settings.length !== 1 ||
    !b.auto_reply_enabled ||
    !["mention_only", "keyword_only", "private_redirect"].includes(b.group_mode)
  )
    throw Error("Group settings unavailable");
  const [conversations] = await c.execute<any[]>(
    `SELECT id,handoff_version,human_takeover,automation_after_message_id,human_expires_at,agent_history,
      (human_expires_at IS NOT NULL AND human_expires_at<=UTC_TIMESTAMP()) AS timed_expired FROM conversations
     WHERE merchantId=? AND customerPhone=? ORDER BY id LIMIT 2${end}`,
    [e.merchantId, `group_${current.jid.slice(0, -5)}`]
  );
  if (conversations.length > 1) throw Error("Ambiguous group conversation");
  // A newly created group has the same initial authority as an absent one.
  // Taking over and resuming during AI must still invalidate that old answer.
  const authority = {
    version: Number(conversations[0]?.handoff_version || 0),
    humanOwned: !!conversations[0]?.human_takeover,
    afterMessageId: Number(conversations[0]?.automation_after_message_id || 0),
  };
  const [history] = await c.execute<any[]>(
    `SELECT id,instance_id,event_key,partition_key,payload_json FROM whatsapp_inbound_jobs
    WHERE merchant_id=? AND instance_id=? AND partition_key=? AND id<=? AND created_at>=TIMESTAMPADD(HOUR,-24,?)
      AND (status='completed' OR id=?) ORDER BY id DESC LIMIT 21${end}`,
    [e.merchantId, e.instanceId, e.partitionKey, e.id, owner.created_at, e.id]
  );
  // Media cannot supply text evidence. A missing quoted message remains explicitly unresolved.
  const envelopes = history
    .slice(0, 20)
    .reverse()
    .flatMap(r => {
      const type = groupJson(r.payload_json)?.messageData?.typeMessage;
      if (
        !["textMessage", "extendedTextMessage", "quotedMessage"].includes(type)
      )
        return [];
      return [
        groupEnvelope(
          r,
          e.merchantId,
          e.instanceId,
          owner.account,
          owner.provider,
          current.jid
        ),
      ];
    });
  if (!envelopes.some(r => r.id === e.id))
    throw Error("Current group text missing");
  const [products] = await c.execute<any[]>(
    `SELECT id,name,nameAr,description,descriptionAr,price,price_unit,currency,has_variants FROM products
    WHERE merchantId=? AND isActive=1 AND status='active' ORDER BY id LIMIT 41${end}`,
    [e.merchantId]
  );
  const [faqs] = await c.execute<any[]>(
    `SELECT id,question,answer FROM extracted_faqs WHERE merchant_id=? AND is_active=1 AND use_in_bot=1 AND source_status='active' ORDER BY id LIMIT 31${end}`,
    [e.merchantId]
  );
  const facts = [
    ...products.slice(0, 40).map(r => ({
      key: `product:${r.id}`,
      title: r.nameAr || r.name,
      content: JSON.stringify({
        description: r.descriptionAr || r.description || "",
        priceMinor:
          r.price_unit === "minor" && !r.has_variants ? r.price : null,
        currency: r.currency,
        availability: "not_confirmed",
      }),
    })),
    ...faqs
      .slice(0, 30)
      .map(r => ({ key: `faq:${r.id}`, title: r.question, content: r.answer })),
  ];
  let topics: any = groupJson(b.group_keywords || "[]");
  if (
    !Array.isArray(topics) ||
    topics.length > 50 ||
    topics.some((s: any) => typeof s !== "string" || s.length > 200)
  )
    throw Error("Group topics unavailable");
  const botPhone = teachingHistoryPhone(owner.phone_number);
  const mentioned =
    !!botPhone &&
    current.mentions.some(
      j =>
        typeof j === "string" &&
        /^[1-9]\d{7,14}@(?:c\.us|s\.whatsapp\.net)$/.test(j) &&
        teachingHistoryPhone(j) === botPhone
    );
  const replies = await readVerifiedGroupReplies(
    c,
    {
      merchantId: e.merchantId,
      instanceId: e.instanceId,
      account: owner.account,
      provider: owner.provider,
      groupJid: current.jid,
      currentId: e.id,
      messages: envelopes,
    },
    lock
  );
  const assistantReplies = replies.map(({ afterMessageId, text }) => ({
    afterMessageId,
    text,
  }));
  const quoted = (m: typeof current) => {
    const participant = m.quote
      ? envelopes.filter(
          other => other.id < m.id && other.providerId === m.quote
        )
      : [];
    const assistant = m.quote
      ? replies.filter(
          r => r.afterMessageId < m.id && r.providerMessageId === m.quote
        )
      : [];
    const resolved = participant.length + assistant.length === 1;
    return {
      quoteId: resolved ? participant[0]?.id || null : null,
      quoteReplyAfterMessageId: resolved
        ? assistant[0]?.afterMessageId || null
        : null,
      unresolvedQuote: !!m.quote && !resolved,
    };
  };
  const data = {
    currentMessageId: e.id,
    mode: b.group_mode as GroupInput["mode"],
    language: b.language,
    topics: topics as string[],
    businessName: owner.businessName,
    mentioned,
    messages: envelopes.map(m => ({
      id: m.id,
      actor: groupHash([
        e.merchantId,
        e.instanceId,
        current.jid,
        m.sender,
      ]).slice(0, 16),
      text: m.text,
      ...quoted(m),
    })),
    assistantReplies,
    facts,
    historyLimited: history.length > 20,
    catalogLimited: products.length > 40 || faqs.length > 30,
  };
  if (JSON.stringify(data).length > 90000)
    throw Error("Complete group context exceeds bounds");
  const basisHash = groupHash({
    data,
    merchantId: e.merchantId,
    instanceId: e.instanceId,
    eventKey: e.eventKey,
    group: current.jid,
    settings: b,
    authority,
    ownershipSource: {
      expiresAt: conversations[0]?.human_expires_at || null,
      history: conversations[0]?.agent_history || null,
    },
    replyProofs: replies.map(r => r.proof),
  });
  return {
    input: { ...data, basisHash } as GroupInput,
    groupJid: current.jid,
    merchantId: e.merchantId,
    instanceId: e.instanceId,
    account: owner.account,
    eventKey: e.eventKey,
    authority,
    conversationId: conversations[0]?.id ? Number(conversations[0].id) : null,
    timedExpired: !!conversations[0]?.timed_expired,
  };
}
