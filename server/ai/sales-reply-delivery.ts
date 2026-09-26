import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import type { SendMerchantWhatsAppInput, WhatsAppProviderConfig } from '../channels/whatsapp/types';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { databaseTimeEpoch } from '../db/time';
import { checkoutTransaction } from './checkout-agreements';
import { loadCurrentSalesReplyReviewBasis } from './sales-reply-review-workspace';
import { readSalesReplyReview } from './sales-generation-output-review-store';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { lockReplySource, reserveReviewedReply, ownsReviewedReply } from './reply-reservation';
import { assertSalesReplyUsageSchema, reserveSalesReplyUsage, settleSalesReplyUsage } from './sales-reply-usage';
import { lockReplyUsageCapacity } from './reply-usage-quota';
import { replySendReadInput, replySendReceipt, replySendWorkspace, type ReplySendSubmission } from '../../shared/sales-reply-send';
import { authorizeSalesReplyDeliveryInput, prepareSalesReplyDeliveryInput, salesReplyDeliveryAuthorization,
  salesReplyDeliveryBasis, salesReplyDeliveryId as id, salesReplyDeliveryIdentity, salesReplyDeliveryKey,
  type SalesReplyDeliveryIdentity } from './sales-reply-delivery-contract';

export type SalesReplyTransportGuard = SalesReplyDeliveryIdentity;
export class SalesReplyDeliveryConflict extends Error { constructor() { super('Sales reply delivery changed or is unavailable'); } }
const conflict = (): never => { throw new SalesReplyDeliveryConflict(); };
const flags = { dispatchAllowed: false as const, exposureRecorded: false as const };
async function lock(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) return conflict(); return rows[0];
}
async function clock(c: PoolConnection) {
  const [rows] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  return z.string().datetime().parse(String(rows[0]?.now).replace(/(\.\d{3})\d{3}Z$/, '$1Z'));
}
async function requireOwner(c: PoolConnection, merchant: number, actor: number) {
  const owner = await lock(c, merchant);
  if (Number(owner.userId) !== actor || owner.status !== 'active') return conflict();
  const [users] = await c.execute<any[]>('SELECT account_status FROM users WHERE id=? FOR SHARE', [actor]);
  if (users.length !== 1 || users[0].account_status !== 'active') return conflict();
}
function accountDigest(config: WhatsAppProviderConfig) {
  return policyArtifactDigest({ version: 'sales-reply-account.v1', provider: config.provider, instanceId: config.instanceId,
    token: config.token, apiUrl: config.apiUrl ?? null, phoneNumberId: config.phoneNumberId ?? null, providerAccountId: config.providerAccountId ?? null });
}
async function currentBasis(c: PoolConnection, merchant: number, actor: number, generationId: number, instanceRecordId: number,
  reserved?: { deliveryId: number; authorizationDigest: string }) {
  await requireOwner(c, merchant, actor);
  const current = await loadCurrentSalesReplyReviewBasis(c, merchant, generationId), turn = current.source.current.snapshot;
  const [reviews] = await c.execute<any[]>('SELECT * FROM ai_sales_generation_output_reviews WHERE merchant_id=? AND generation_id=? ORDER BY revision DESC LIMIT 1 FOR SHARE', [merchant, generationId]);
  if (reviews.length !== 1) return conflict();
  const review = readSalesReplyReview(reviews[0]), s = review.snapshot;
  if (Number(reviews[0].actor_user_id) !== actor || s.actorUserId !== actor || s.outcome !== 'approved'
    || s.basis.version !== 'sales-reply-review-basis.v2' || s.basisDigest !== current.digest) return conflict();
  const [conversations] = await c.execute<any[]>('SELECT customerPhone FROM conversations WHERE id=? AND merchantId=? FOR UPDATE', [turn.conversationId, merchant]);
  const rawPhone = String(conversations[0]?.customerPhone ?? '');
  // Only canonical international numbers; no guessing a country or accepting group JIDs.
  const recipient = rawPhone.replace(/^\+/, '');
  const [incoming] = await c.execute<any[]>("SELECT DATE_FORMAT(createdAt,'%Y-%m-%dT%H:%i:%s.000Z') AS received FROM messages WHERE id=? AND conversationId=? AND direction='incoming' FOR SHARE", [turn.incomingMessageId, turn.conversationId]);
  const [jobs] = await c.execute<any[]>('SELECT id FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=? LIMIT 1 FOR SHARE', [merchant, turn.incomingMessageId]);
  if (reserved ? !await ownsReviewedReply(c, { ...reserved, merchantId: merchant, conversationId: turn.conversationId,
    incomingMessageId: turn.incomingMessageId, responseText: current.evidence.responseText }) : jobs.length) return conflict();
  const [accounts] = await c.execute<any[]>('SELECT * FROM whatsapp_instances WHERE id=? AND merchant_id=? FOR UPDATE', [instanceRecordId, merchant]);
  const a = accounts[0];
  if (accounts.length !== 1 || a.status !== 'active' || !a.token || !a.instance_id
    || a.provider === 'mock' && process.env.NODE_ENV !== 'test' || a.provider === 'meta_cloud' && !a.phone_number_id) return conflict();
  const config: WhatsAppProviderConfig = { provider: a.provider || 'green_api', instanceId: String(a.instance_id), token: String(a.token),
    apiUrl: a.api_url, phoneNumberId: a.phone_number_id, providerAccountId: a.provider_account_id };
  const basis = salesReplyDeliveryBasis.parse({ version: 'sales-reply-delivery-basis.v1', merchantId: merchant, generationId, actorUserId: actor,
    reviewId: review.reviewId, reviewDigest: review.reviewDigest, reviewBasisDigest: current.digest, reviewRevision: s.revision,
    conversationId: turn.conversationId, incomingMessageId: turn.incomingMessageId, responseText: current.evidence.responseText,
    recipient, instanceRecordId, provider: config.provider, accountDigest: accountDigest(config),
    observationEndsAt: current.evidence.observationEndsAt, inboundReceivedAt: String(incoming[0]?.received) });
  const checkedAt = await clock(c), now = Date.parse(checkedAt), received = Date.parse(basis.inboundReceivedAt);
  if (now < Date.parse(current.checkedAt) || now < Date.parse(s.reviewedAt) || received > now
    || now >= Math.min(Date.parse(basis.observationEndsAt), received + 86_400_000)) return conflict();
  return { basis, basisDigest: policyArtifactDigest(basis), checkedAt };
}
export function readSalesReplyDeliveryRecord(row: any) {
  try {
    const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot, snapshot = salesReplyDeliveryAuthorization.parse(raw), b = snapshot.basis;
    if (policyArtifactDigest(raw) !== row.authorization_digest || policyArtifactDigest(snapshot) !== row.authorization_digest
      || b.merchantId !== Number(row.merchant_id) || b.generationId !== Number(row.generation_id)
      || b.incomingMessageId !== Number(row.message_reference) || row.actor_user_id !== null && b.actorUserId !== Number(row.actor_user_id)
      || snapshot.requestId !== row.request_id || snapshot.basisDigest !== row.basis_digest
      || !['authorized', 'dispatching'].includes(row.state)) return conflict();
    const started = databaseTimeEpoch(row.dispatch_started_at);
    if (row.state === 'authorized' ? row.dispatch_started_at !== null
      : !Number.isFinite(started) || started < Date.parse(snapshot.authorizedAt) || started >= Date.parse(snapshot.expiresAt)) return conflict();
    return { deliveryId: id.parse(Number(row.id)), authorizationDigest: String(row.authorization_digest),
      state: row.state as 'authorized' | 'dispatching', authorization: snapshot, ...flags };
  } catch { return conflict(); }
}
async function load(c: PoolConnection, merchant: number, deliveryId: number) {
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_reply_deliveries WHERE merchant_id=? AND id=? FOR UPDATE', [merchant, deliveryId]);
  if (rows.length !== 1) return conflict(); return { row: rows[0], receipt: readSalesReplyDeliveryRecord(rows[0]) };
}
function sendInput(receipt: ReturnType<typeof readSalesReplyDeliveryRecord>): SendMerchantWhatsAppInput {
  const b = receipt.authorization.basis;
  return { merchantId: b.merchantId, instanceRecordId: b.instanceRecordId, to: b.recipient, text: b.responseText, kind: 'text',
    idempotencyKey: salesReplyDeliveryKey(b.merchantId, receipt.deliveryId),
    salesReplyGuard: { deliveryId: receipt.deliveryId, authorizationDigest: receipt.authorizationDigest } };
}
async function outbox(c: PoolConnection, receipt: ReturnType<typeof readSalesReplyDeliveryRecord>) {
  const input = sendInput(receipt), b = receipt.authorization.basis;
  // The authorization row serializes consumers. Do not also lock the channel outbox:
  // concurrent INSERTs can lock that row before requesting their merchant FK lock.
  const [rows] = await c.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?', [b.merchantId, input.idempotencyKey]);
  if (!rows.length) return null;
  const row = rows[0];
  try {
    const request = typeof row.request_json === 'string' ? JSON.parse(row.request_json) : row.request_json;
    // No other side effect, media, execution or message may borrow this receipt.
    const expected = { to: input.to, kind: input.kind, text: input.text, salesReplyGuard: input.salesReplyGuard };
    if (rows.length !== 1 || row.instance_id !== null && Number(row.instance_id) !== b.instanceRecordId || row.provider !== b.provider || row.direction !== 'outgoing'
      || row.message_id !== null || policyArtifactDigest(request) !== policyArtifactDigest(expected)) return conflict();
  } catch { return conflict(); }
  return row;
}
async function history(c: PoolConnection, receipt: ReturnType<typeof readSalesReplyDeliveryRecord>) {
  const row = await outbox(c, receipt);
  let transport: 'not_attempted' | 'unknown' | 'suppressed' | 'rejected' | 'accepted' | 'delivered' | 'read' | 'failed' = receipt.state === 'authorized' ? 'not_attempted' : 'unknown';
  if (row) {
    transport = 'unknown';
    if (row.status === 'failed' && row.error_code !== 'provider_unreachable' && !/^http_(?:[235]\d\d|408)$/.test(row.error_code ?? ''))
      transport = row.error_code === 'sales_reply_suppressed' ? 'suppressed' : 'rejected';
    if (receipt.state === 'dispatching' && row.status === 'failed' && row.provider_message_id) transport = 'failed';
    if (receipt.state === 'dispatching' && row.provider_message_id && ['sent', 'delivered', 'read'].includes(row.status))
      transport = row.status === 'sent' ? 'accepted' : row.status;
  }
  return { ...receipt, transport, providerMessageId: receipt.state === 'dispatching' && row?.provider_message_id ? String(row.provider_message_id) : null };
}
/** Internal evidence; the public workspace returns only the customer-facing projection. */
export async function prepareSalesReplyDelivery(merchantId: number, actorUserId: number, value: z.infer<typeof prepareSalesReplyDeliveryInput>) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = prepareSalesReplyDeliveryInput.parse(value);
  return checkoutTransaction(async c => ({ ...await currentBasis(c, merchant, actor, input.generationId, input.instanceRecordId), ...flags }));
}
export async function authorizeSalesReplyDelivery(merchantId: number, actorUserId: number, value: z.infer<typeof authorizeSalesReplyDeliveryInput>) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = authorizeSalesReplyDeliveryInput.parse(value);
  await assertSalesReplyUsageSchema();
  const payload = policyArtifactDigest({ version: 'sales-reply-delivery-request.v1', actor, input });
  return checkoutTransaction(async c => {
    await requireOwner(c, merchant, actor);
    const [prior] = await c.execute<any[]>('SELECT * FROM ai_sales_reply_deliveries WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchant, input.requestId]);
    if (prior.length) { if (prior[0].payload_digest !== payload) return conflict(); return history(c, readSalesReplyDeliveryRecord(prior[0])); }
    const current = await currentBasis(c, merchant, actor, input.generationId, input.instanceRecordId);
    if (input.basisDigest !== current.basisDigest) return conflict();
    const [existing] = await c.execute<any[]>('SELECT id FROM ai_sales_reply_deliveries WHERE merchant_id=? AND (generation_id=? OR message_reference=?) FOR UPDATE', [merchant, input.generationId, current.basis.incomingMessageId]);
    if (existing.length) return conflict();
    const authorizedAt = await clock(c), start = Date.parse(authorizedAt), b = current.basis;
    if (start < Date.parse(current.checkedAt)) return conflict();
    const snapshot = salesReplyDeliveryAuthorization.parse({ version: 'sales-reply-delivery-authorization.v1', basis: b, basisDigest: current.basisDigest,
      requestId: input.requestId, reason: input.reason, authorizedAt, expiresAt: new Date(Math.min(start + 120_000, Date.parse(b.observationEndsAt), Date.parse(b.inboundReceivedAt) + 86_400_000)).toISOString(),
      allowSendCustomerMessage: true, reviewedExactRecipientAndResponse: true, scope: 'one_reviewed_text_reply' });
    const [inserted] = await c.execute<any>(`INSERT INTO ai_sales_reply_deliveries
      (merchant_id,generation_id,message_reference,actor_user_id,request_id,payload_digest,basis_digest,authorization_digest,snapshot,state,usage_state)
      VALUES (?,?,?,?,?,?,?,?,?,'authorized','pending')`, [merchant, input.generationId, b.incomingMessageId, actor, input.requestId, payload,
      current.basisDigest, policyArtifactDigest(snapshot), JSON.stringify(snapshot)]);
    const receipt = (await load(c, merchant, Number(inserted.insertId))).receipt;
    await reserveReviewedReply(c, { merchantId: merchant, conversationId: b.conversationId, incomingMessageId: b.incomingMessageId,
      deliveryId: receipt.deliveryId, authorizationDigest: receipt.authorizationDigest, responseText: b.responseText });
    return history(c, receipt);
  });
}
export async function getSalesReplyDelivery(merchantId: number, value: SalesReplyDeliveryIdentity) {
  const merchant = id.parse(merchantId), input = salesReplyDeliveryIdentity.parse(value);
  return checkoutTransaction(async c => {
    await lock(c, merchant); const { receipt } = await load(c, merchant, input.deliveryId);
    if (receipt.authorizationDigest !== input.authorizationDigest) return conflict(); return history(c, receipt);
  });
}
/** Consumes the single authorization after all channel lookups, immediately before provider I/O. */
export async function canDispatchSalesReply(input: SendMerchantWhatsAppInput, config: WhatsAppProviderConfig) {
  const parsed = salesReplyDeliveryIdentity.safeParse(input.salesReplyGuard);
  if (!parsed.success || input.retryFailed || input.idempotencyKey !== salesReplyDeliveryKey(input.merchantId, parsed.data.deliveryId)) return false;
  try {
    await assertSalesReplyUsageSchema();
    return await checkoutTransaction(async c => {
      await lock(c, id.parse(input.merchantId)); const { row, receipt } = await load(c, input.merchantId, parsed.data.deliveryId);
      const s = receipt.authorization, b = s.basis;
      if (receipt.state !== 'authorized' || row.actor_user_id === null || receipt.authorizationDigest !== parsed.data.authorizationDigest
        || policyArtifactDigest(input) !== policyArtifactDigest(sendInput(receipt)) || accountDigest(config) !== b.accountDigest) return false;
      const current = await currentBasis(c, b.merchantId, b.actorUserId, b.generationId, b.instanceRecordId, parsed.data);
      if (current.basisDigest !== s.basisDigest) return false;
      const delivery = await outbox(c, receipt);
      if (!delivery || delivery.status !== 'queued' || delivery.provider_message_id || Number(delivery.instance_id) !== b.instanceRecordId) return false;
      // Recheck time after the account lock and outbox read, then in the atomic write.
      const checkedAt = await clock(c), now = Date.parse(checkedAt);
      if (now < Date.parse(current.checkedAt) || now < Date.parse(s.authorizedAt) || now >= Date.parse(s.expiresAt)) return false;
      const [updated] = await c.execute<any>(`UPDATE ai_sales_reply_deliveries SET state='dispatching',dispatch_started_at=UTC_TIMESTAMP(3)
        WHERE merchant_id=? AND id=? AND state='authorized' AND UTC_TIMESTAMP(3)>=? AND UTC_TIMESTAMP(3)<?`,
        [b.merchantId, receipt.deliveryId, checkedAt.slice(0, 23).replace('T', ' '), s.expiresAt.slice(0, 23).replace('T', ' ')]);
      if (Number(updated.affectedRows) !== 1) return false;
      const reserved = await load(c, input.merchantId, receipt.deliveryId);
      await reserveSalesReplyUsage(c, reserved.row, reserved.receipt.authorization.expiresAt);
      return true;
    });
  } catch { return false; }
}
/** Repairs local history from a proven receipt only; never sends or starts learning. */
export async function reconcileSalesReplyConversation(merchantId: number, value: SalesReplyDeliveryIdentity, recoveryToken?: string) {
  const merchant = id.parse(merchantId), input = salesReplyDeliveryIdentity.parse(value);
  if (recoveryToken !== undefined) z.string().uuid().parse(recoveryToken);
  await assertSalesReplyUsageSchema();
  return checkoutTransaction(async c => {
    await lock(c, merchant); const { row: authorizationRow, receipt } = await load(c, merchant, input.deliveryId);
    if (receipt.authorizationDigest !== input.authorizationDigest) return conflict();
    if (recoveryToken !== undefined) {
      const [owned] = await c.execute<any[]>(`SELECT id FROM ai_sales_reply_deliveries WHERE id=? AND merchant_id=?
        AND projection_state='pending' AND projection_token=? AND projection_lease_until>UTC_TIMESTAMP(3)`, [input.deliveryId,merchant,recoveryToken]);
      if (owned.length !== 1) return conflict();
    }
    const complete = async () => {
      const [saved] = await c.execute<any>(`UPDATE ai_sales_reply_deliveries SET projection_state='projected',projection_token=NULL,
        projection_lease_until=NULL,projection_next_at=NULL,projection_last_error=NULL,
        projection_completed_at=COALESCE(projection_completed_at,UTC_TIMESTAMP(3)) WHERE merchant_id=? AND id=?
        AND (? IS NULL OR (projection_state='pending' AND projection_token=? AND projection_lease_until>UTC_TIMESTAMP(3)))`,
        [merchant,input.deliveryId,recoveryToken ?? null,recoveryToken ?? null]);
      if (Number(saved.affectedRows) !== 1) return conflict();
    };
    const result = await history(c, receipt), b = receipt.authorization.basis;
    await settleSalesReplyUsage(c, authorizationRow, result.transport, result.providerMessageId, recoveryToken);
    if (!['accepted', 'delivered', 'read'].includes(result.transport)) return { ...result, outgoingMessageId: null };
    await lockReplySource(c, merchant, b.conversationId, b.incomingMessageId);
    if (!await ownsReviewedReply(c, { ...input, merchantId: merchant, conversationId: b.conversationId,
      incomingMessageId: b.incomingMessageId, responseText: b.responseText })) return conflict();
    const [jobs] = await c.execute<any[]>('SELECT outgoing_message_reference FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=? FOR UPDATE', [merchant, b.incomingMessageId]);
    const externalId = `sales-reply:${merchant}:${receipt.deliveryId}`, reference = jobs[0].outgoing_message_reference;
    const [messages] = await c.execute<any[]>('SELECT * FROM messages WHERE externalId=? FOR UPDATE', [externalId]);
    if (reference !== null || messages.length) {
      const message = messages[0];
      if (messages.length !== 1 || reference === null || Number(reference) !== Number(message.id)
        || Number(message.conversationId) !== b.conversationId || message.direction !== 'outgoing' || message.sender_type !== 'assistant'
        || message.messageType !== 'text' || message.content !== b.responseText || message.aiResponse !== b.responseText
        || Number(message.isProcessed) !== 1 || message.voiceUrl || message.imageUrl || message.mediaUrl) return conflict();
      await complete(); return { ...result, outgoingMessageId: Number(reference) };
    }
    const [inserted] = await c.execute<any>(`INSERT INTO messages
      (conversationId,direction,sender_type,messageType,content,isProcessed,aiResponse,externalId,createdAt)
      VALUES (?,'outgoing','assistant','text',?,1,?,?,?)`,
    [b.conversationId, b.responseText, b.responseText, externalId, authorizationRow.dispatch_started_at]);
    await c.execute(`UPDATE ai_interaction_jobs SET outgoing_message_reference=? WHERE merchant_id=? AND incoming_message_id=?`,
      [inserted.insertId, merchant, b.incomingMessageId]);
    await c.execute('UPDATE messages SET isProcessed=1 WHERE id=? AND conversationId=?', [b.incomingMessageId, b.conversationId]);
    // Late recovery must not move a newer conversation backwards or pretend it happened now.
    await c.execute('UPDATE conversations SET lastMessageAt=GREATEST(COALESCE(lastMessageAt,?),?) WHERE id=? AND merchantId=?',
      [authorizationRow.dispatch_started_at, authorizationRow.dispatch_started_at, b.conversationId, merchant]);
    await complete(); return { ...result, outgoingMessageId: Number(inserted.insertId) };
  });
}
/** Uses only the saved exact reply. Unknown/failed attempts never acquire another transport key. */
export async function dispatchReviewedSalesReply(merchantId: number, value: SalesReplyDeliveryIdentity) {
  const receipt = await getSalesReplyDelivery(merchantId, value);
  if (receipt.state !== 'authorized' || receipt.transport !== 'not_attempted') return reconcileSalesReplyConversation(merchantId, value);
  try { await sendMerchantWhatsApp(sendInput(receipt)); }
  catch { /* Read the durable outbox; a transport exception does not permit another send. */ }
  return reconcileSalesReplyConversation(merchantId, value);
}

function publicMessage(b: z.infer<typeof salesReplyDeliveryBasis>, basisDigest: string) {
  return { generationId: b.generationId, actorUserId: b.actorUserId, instanceRecordId: b.instanceRecordId,
    basisDigest, recipient: b.recipient, responseText: b.responseText };
}
function publicReceipt(r: Awaited<ReturnType<typeof history>>) {
  return replySendReceipt.parse({ ...publicMessage(r.authorization.basis, r.authorization.basisDigest),
    deliveryId: r.deliveryId, requestId: r.authorization.requestId, authorizedAt: r.authorization.authorizedAt,
    transport: r.transport, exposureRecorded: false });
}
/** Read-only status recovery, including after a lost browser acknowledgement. Never dispatches. */
export async function getSalesReplySendWorkspace(merchantId: number, actorUserId: number, value: z.infer<typeof replySendReadInput>) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = replySendReadInput.parse(value);
  return checkoutTransaction(async c => {
    await requireOwner(c, merchant, actor);
    const [generations] = await c.execute<any[]>('SELECT id FROM ai_sales_experiment_generations WHERE merchant_id=? AND id=?', [merchant, input.generationId]);
    if (generations.length !== 1) return conflict();
    const base = { generationId: input.generationId, actorUserId: actor, accounts: [] as Array<{ id: number; phoneNumber: string | null; primary: boolean }>,
      accountsTruncated: false, preview: null, receipt: null };
    const [prior] = await c.execute<any[]>('SELECT * FROM ai_sales_reply_deliveries WHERE merchant_id=? AND generation_id=? FOR UPDATE', [merchant, input.generationId]);
    if (prior.length) return replySendWorkspace.parse({ ...base, stage: 'recorded', receipt: publicReceipt(await history(c, readSalesReplyDeliveryRecord(prior[0]))) });
    const [accounts] = await c.execute<any[]>(`SELECT id,phone_number,is_primary FROM whatsapp_instances
      WHERE merchant_id=? AND status='active' AND token<>'' AND instance_id<>''
        AND (provider<>'mock' OR ?=1) AND (provider<>'meta_cloud' OR COALESCE(phone_number_id,'')<>'')
      ORDER BY is_primary DESC,id LIMIT 101`, [merchant, process.env.NODE_ENV === 'test' ? 1 : 0]);
    base.accounts = accounts.slice(0,100).map(a => ({ id: Number(a.id), phoneNumber: a.phone_number, primary: Number(a.is_primary) === 1 }));
    base.accountsTruncated = accounts.length > 100;
    if (!input.instanceRecordId) return replySendWorkspace.parse({ ...base, stage: base.accounts.length ? 'choose_account' : 'unavailable' });
    if (!base.accounts.some(a => a.id === input.instanceRecordId)) return replySendWorkspace.parse({ ...base, stage: 'unavailable' });
    // An unavailable source is readable, but never becomes an editable or sendable preview.
    let current: Awaited<ReturnType<typeof currentBasis>>;
    try { current = await currentBasis(c, merchant, actor, input.generationId, input.instanceRecordId); }
    catch { return replySendWorkspace.parse({ ...base, stage: 'unavailable' }); }
    try { await assertSalesReplyUsageSchema(); await lockReplyUsageCapacity(c, merchant); }
    catch { return replySendWorkspace.parse({ ...base, stage: 'capacity_unavailable' }); }
    const b = current.basis;
    return replySendWorkspace.parse({ ...base, stage: 'ready', preview: { ...publicMessage(b, current.basisDigest),
      checkedAt: current.checkedAt, expiresAt: new Date(Math.min(Date.parse(b.observationEndsAt), Date.parse(b.inboundReceivedAt) + 86_400_000)).toISOString() } });
  });
}
/** Explicit owner action only. Replays retain one authorization and one channel key. */
export async function submitSalesReplySend(merchantId: number, actorUserId: number, value: ReplySendSubmission) {
  const saved = await authorizeSalesReplyDelivery(merchantId, actorUserId, value);
  const result = await dispatchReviewedSalesReply(merchantId, { deliveryId: saved.deliveryId, authorizationDigest: saved.authorizationDigest });
  return publicReceipt(result);
}
