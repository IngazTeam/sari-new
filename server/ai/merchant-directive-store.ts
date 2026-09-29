import type { Pool, PoolConnection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { getPool } from "../db/connection";
import {
  readTeachingSource,
  type TeachingSource,
} from "../knowledge/whatsapp-teaching-source";
import { normalizeCampaignPhone } from "../automation/campaign-guard";
import { assertRuntimeSchema } from "../db/schema-readiness";
import { checkoutTransaction } from "./checkout-agreements";
import { transitionOwnershipInTransaction } from "./conversation-handoff";
import { destroySession } from "./session-context";
import {
  directiveHash,
  validateDirectiveDecision,
  type DirectiveDecision,
  type DirectiveTarget,
  type DirectiveInput,
} from "./merchant-directive-understanding";

type Executor = Pick<Pool | PoolConnection, "execute">;
const decode = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
export type MerchantDirectiveContext = {
  source: TeachingSource;
  targets: DirectiveTarget[];
  basisHash: string;
};
export type MerchantDirectiveProof = {
  context: MerchantDirectiveContext;
  decision: DirectiveDecision;
};
export function directiveInput(
  context: MerchantDirectiveContext
): DirectiveInput {
  return {
    text: context.source.text,
    basisHash: context.basisHash,
    targets: context.targets,
  };
}
async function database() {
  const pool = await getPool();
  if (!pool) throw Error("Merchant directive storage unavailable");
  return pool;
}
export async function assertMerchantDirectiveSchema() {
  await assertRuntimeSchema("merchant directives", [
    {
      table: "merchant_directive_actions",
      columns: [
        "source_digest",
        "basis_hash",
        "context_json",
        "decision_json",
        "result_json",
      ],
      uniqueIndexes: [
        {
          name: "uq_merchant_directive_event",
          columns: ["merchant_id", "event_key"],
        },
      ],
    },
  ]);
}
async function sourceInTransaction(c: PoolConnection, source: TeachingSource) {
  const fresh = await readTeachingSource(
    source.merchantId,
    source.text,
    drizzle(c),
    true,
    source.quotedMessageId
  );
  if (fresh.digest !== source.digest)
    throw Error("Merchant directive source changed");
  return fresh;
}
async function targets(
  db: Executor,
  source: TeachingSource,
  lock = false
): Promise<DirectiveTarget[]> {
  const ids = new Map<number, boolean>();
  const quoteDigests = new Map<number, string>();
  if (source.quotedMessageId) {
    const [receipts] = await db.execute<any[]>(
      `SELECT d.id,d.provider,d.idempotency_key,d.request_json FROM whatsapp_message_deliveries d
      JOIN whatsapp_inbound_jobs j ON j.id=? AND j.merchant_id=d.merchant_id
      JOIN whatsapp_instances i ON i.id=d.instance_id AND i.merchant_id=d.merchant_id AND i.provider=d.provider
      WHERE d.merchant_id=? AND d.instance_id=? AND d.provider_message_id=? AND d.direction='outgoing'
        AND d.status IN ('sent','delivered','read') AND d.created_at<=j.created_at ${lock ? "FOR UPDATE" : ""}`,
      [
        source.inboundId,
        source.merchantId,
        source.instanceId,
        source.quotedMessageId,
      ]
    );
    if (receipts.length === 1) {
      const r = receipts[0],
        request = decode(r.request_json),
        g = request?.escalationGuard;
      if (
        g?.mode === "alert" &&
        Number.isSafeInteger(g.id) &&
        g.id > 0 &&
        Number.isSafeInteger(g.sourceMessageId) &&
        g.sourceMessageId > 0 &&
        Number.isSafeInteger(g.version) &&
        g.version >= 0 &&
        new RegExp(
          `^escalation_alert:${source.merchantId}:${g.id}:[0-4]$`
        ).test(r.idempotency_key) &&
        normalizeCampaignPhone(request?.to) === source.authorPhone
      ) {
        const [rows] = await db.execute<any[]>(
          `SELECT e.conversation_id FROM sari_escalation_queue e
          JOIN conversations c ON c.id=e.conversation_id AND c.merchantId=e.merchant_id
          JOIN messages m ON m.id=e.source_message_id AND m.conversationId=c.id AND m.direction='incoming'
          WHERE e.id=? AND e.merchant_id=? AND e.source_message_id=? AND e.handoff_version=? AND c.customerPhone=e.customer_phone
            AND e.status IN ('pending','notified') AND e.expires_at>UTC_TIMESTAMP() ${lock ? "FOR UPDATE" : ""}`,
          [g.id, source.merchantId, g.sourceMessageId, g.version]
        );
        if (rows.length === 1) {
          const id = Number(rows[0].conversation_id);
          ids.set(id, true);
          quoteDigests.set(
            id,
            directiveHash({
              id: Number(r.id),
              provider: r.provider,
              key: r.idempotency_key,
              request,
            })
          );
        }
      }
    }
  }
  // Parse identifiers only. Phone syntax never decides whether an action was requested.
  const phones = Array.from(
    new Set(
      Array.from(
        source.text.matchAll(/(?<![\dA-Za-z])\+?\d{9,15}(?![\dA-Za-z])/g)
      )
        .map(m => normalizeCampaignPhone(m[0]))
        .filter((v): v is string => !!v)
    )
  );
  if (phones.length > 5) throw Error("Too many directive targets");
  for (const phone of phones) {
    const [rows] = await db.execute<any[]>(
      `SELECT id FROM conversations WHERE merchantId=? AND customerPhone=? ORDER BY id LIMIT 6 ${lock ? "FOR UPDATE" : ""}`,
      [source.merchantId, phone]
    );
    if (rows.length > 5) throw Error("Ambiguous directive conversations");
    for (const row of rows)
      if (!ids.has(Number(row.id))) ids.set(Number(row.id), false);
  }
  if (ids.size > 5) throw Error("Too many directive conversations");
  const result: DirectiveTarget[] = [];
  for (const [id, quoted] of Array.from(ids.entries()).sort(
    (a, b) => a[0] - b[0]
  )) {
    const [convs] = await db.execute<any[]>(
      `SELECT c.id,c.customerPhone,c.customerName,c.handoff_version,c.human_takeover,
      COALESCE(p.memory_forget_before_message_id,0) AS cutoff FROM conversations c
      LEFT JOIN customer_profiles p ON p.merchant_id=c.merchantId AND p.customer_phone=c.customerPhone
      WHERE c.id=? AND c.merchantId=? AND c.status='active' ${lock ? "FOR UPDATE" : ""}`,
      [id, source.merchantId]
    );
    const c = convs[0];
    if (!c || !/^[1-9]\d{7,14}$/.test(c.customerPhone))
      throw Error("Directive customer unavailable");
    const [messages] = await db.execute<any[]>(
      `SELECT id,direction,sender_type,content,createdAt FROM messages
      WHERE conversationId=? AND id>? ORDER BY id DESC LIMIT 21 ${lock ? "FOR UPDATE" : ""}`,
      [id, Number(c.cutoff)]
    );
    if (
      !messages.length ||
      messages.some(m => String(m.content || "").length > 16000)
    )
      throw Error("Directive conversation unavailable");
    result.push({
      id,
      phone: c.customerPhone,
      name: c.customerName,
      version: Number(c.handoff_version),
      takeover: !!c.human_takeover,
      lastMessageId: Number(messages[0].id),
      cutoff: Number(c.cutoff),
      quoted,
      ...(quoted ? { quoteDigest: quoteDigests.get(id)! } : {}),
      messages: messages.reverse().map(m => ({
        id: Number(m.id),
        direction: m.direction,
        senderType: m.sender_type ?? null,
        content: String(m.content ?? ""),
        createdAt: new Date(m.createdAt).toISOString(),
      })),
    });
  }
  return result;
}
export async function readMerchantDirectiveContext(
  merchantId: number,
  text: string,
  quote?: string
): Promise<MerchantDirectiveContext> {
  await assertMerchantDirectiveSchema();
  const source = await readTeachingSource(
      merchantId,
      text,
      undefined,
      false,
      quote
    ),
    list = await targets(await database(), source);
  return {
    source,
    targets: list,
    basisHash: directiveHash({ sourceDigest: source.digest, targets: list }),
  };
}
export async function recheckMerchantDirective(
  proof: MerchantDirectiveProof,
  c?: PoolConnection
) {
  const { context, decision } = proof;
  validateDirectiveDecision(JSON.stringify(decision), directiveInput(context));
  const source = c
    ? await sourceInTransaction(c, context.source)
    : await readTeachingSource(
        context.source.merchantId,
        context.source.text,
        undefined,
        false,
        context.source.quotedMessageId
      );
  if (source.digest !== context.source.digest)
    throw Error("Merchant source changed");
  const list = await targets(c || (await database()), source, !!c);
  if (
    directiveHash({ sourceDigest: source.digest, targets: list }) !==
      context.basisHash ||
    directiveHash(list) !== directiveHash(context.targets)
  )
    throw Error("Merchant directive context changed");
}
export async function findMerchantDirectiveReceipt(source: TeachingSource) {
  await assertMerchantDirectiveSchema();
  const fresh = await readTeachingSource(
    source.merchantId,
    source.text,
    undefined,
    false,
    source.quotedMessageId
  );
  if (fresh.digest !== source.digest)
    throw Error("Recorded merchant source changed");
  const [rows] = await (
    await database()
  ).execute<any[]>(
    "SELECT source_digest,intent,result_json FROM merchant_directive_actions WHERE merchant_id=? AND event_key=?",
    [source.merchantId, source.eventKey]
  );
  if (!rows.length) return null;
  if (rows[0].source_digest !== source.digest)
    throw Error("Recorded merchant source changed");
  return { intent: rows[0].intent, result: decode(rows[0].result_json) };
}
async function record(
  c: PoolConnection,
  proof: MerchantDirectiveProof,
  result: unknown
) {
  const { context, decision } = proof;
  await c.execute(
    `INSERT INTO merchant_directive_actions (merchant_id,event_key,source_digest,basis_hash,conversation_id,intent,context_json,decision_json,result_json)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      context.source.merchantId,
      context.source.eventKey,
      context.source.digest,
      context.basisHash,
      decision.targetId,
      decision.intent,
      JSON.stringify(context),
      JSON.stringify(decision),
      JSON.stringify(result),
    ]
  );
}
export async function commitMerchantOwnership(proof: MerchantDirectiveProof) {
  const { context, decision } = proof,
    source = context.source;
  if (!["pause", "resume"].includes(decision.intent))
    throw Error("Not an ownership directive");
  const result = await checkoutTransaction(async c => {
    await c.execute("SELECT id FROM merchants WHERE id=? FOR UPDATE", [
      source.merchantId,
    ]);
    await sourceInTransaction(c, source);
    const [prior] = await c.execute<any[]>(
      "SELECT source_digest,result_json FROM merchant_directive_actions WHERE merchant_id=? AND event_key=? FOR UPDATE",
      [source.merchantId, source.eventKey]
    );
    if (prior.length) {
      if (prior[0].source_digest !== source.digest)
        throw Error("Recorded source changed");
      return { ...decode(prior[0].result_json), replayed: true };
    }
    await recheckMerchantDirective(proof, c);
    const target = context.targets.find(t => t.id === decision.targetId)!;
    const changed = await transitionOwnershipInTransaction(
      c,
      target.id,
      decision.intent === "pause"
        ? {
            humanTakeover: 1,
            humanExpiresAt: null,
            agentHistory: JSON.stringify({ permanentSilence: true }),
          }
        : { humanTakeover: 0 },
      {
        merchantId: source.merchantId,
        expectedVersion: target.version,
        expectedLastMessageId: target.lastMessageId,
        reason: "manual",
      }
    );
    const outcome = {
      conversationId: target.id,
      intent: decision.intent,
      changed: changed.changed,
      version: changed.version,
      replayed: false,
    };
    await record(c, proof, outcome);
    return outcome;
  });
  if (!result.replayed && result.changed)
    destroySession(source.merchantId, result.conversationId);
  return result as {
    conversationId: number;
    intent: "pause" | "resume";
    changed: boolean;
    version: number;
    replayed: boolean;
  };
}
/** Runs inside the existing relay transaction before ownership changes or a send reservation. */
export async function recordMerchantRelayDirective(
  c: PoolConnection,
  proof: MerchantDirectiveProof,
  conversationId: number,
  replyText: string
) {
  if (
    proof.decision.intent !== "relay" ||
    proof.decision.targetId !== conversationId ||
    proof.decision.replyText !== replyText
  )
    throw Error("Relay directive mismatch");
  await recheckMerchantDirective(proof, c);
  await record(c, proof, {
    conversationId,
    intent: "relay",
    status: "reserved",
  });
}
