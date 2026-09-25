import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { loadSalesExperimentAssignment } from './sales-experiment-assignment';
import { loadSalesExperimentLaunchStatus } from './sales-experiment-launch';
import { loadSalesExperimentProtocol } from './sales-experiment-protocol';
import { requireCurrentLearningPolicyCandidate } from './learning-policy-candidates';
import { policyArtifactDigest, buildCandidateStyleInstruction } from './learning-policy-evaluation-bundle';
import { cohortPhone } from './sales-experiment-cohort-contract';
import { buildSalesTurnPolicy, decideSalesTurnGoal } from './sales-turn-policy';
import { detectIntent, type CustomerIntent } from './session-context';
import { prepareSalesExperimentTurnInput, readSalesExperimentTurnInput, resolveSalesExperimentTurnInput, salesExperimentTurnSnapshot,
  type PrepareSalesExperimentTurnInput } from './sales-experiment-turn-contract';

const id = z.number().int().positive().safe();
export class SalesExperimentTurnConflict extends Error { constructor() { super('Sales experiment turn changed or is unavailable'); } }
const conflict = (): never => { throw new SalesExperimentTurnConflict(); };
const flags = { generationAllowed: false as const, dispatchAllowed: false as const, exposureRecorded: false as const };
async function lockMerchant(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) return conflict();
}
async function clock(c: PoolConnection) {
  const [rows] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  return String(rows[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
}
function receipt(row: any) {
  try {
    const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot, snapshot = salesExperimentTurnSnapshot.parse(raw);
    if (policyArtifactDigest(raw) !== row.turn_digest || policyArtifactDigest(snapshot) !== row.turn_digest
      || policyArtifactDigest(snapshot.policyText) !== snapshot.policyDigest || snapshot.merchantId !== Number(row.merchant_id)
      || snapshot.assignmentId !== Number(row.assignment_id) || snapshot.protocolId !== Number(row.protocol_id)
      || snapshot.conversationId !== Number(row.conversation_reference) || snapshot.incomingMessageId !== Number(row.message_reference)) return conflict();
    return { turnId: id.parse(Number(row.id)), turnDigest: String(row.turn_digest), snapshot, eligibility: 'not_checked' as const, ...flags };
  } catch { return conflict(); }
}
async function load(c: PoolConnection, merchant: number, input: z.infer<typeof readSalesExperimentTurnInput>) {
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_turns WHERE merchant_id=? AND id=? FOR SHARE', [merchant, input.turnId]);
  if (rows.length !== 1) return conflict();
  const saved = receipt(rows[0]); if (saved.turnDigest !== input.turnDigest) return conflict(); return saved;
}
const blocked = (reason: string) => ({ kind: 'blocked' as const, reason, selectionCurrentAtRead: false as const, ...flags });

/** Checks continued use, not enrollment. Never runs the frozen recruitment predicates a second time. */
async function currentContext(c: PoolConnection, merchant: number, input: { assignmentId: number; assignmentDigest: string; conversationId: number; incomingMessageId: number; expectedMessageDigest?: string }) {
  const assignment = await loadSalesExperimentAssignment(c, merchant, input.assignmentId), a = assignment.snapshot;
  if (assignment.assignmentDigest !== input.assignmentDigest) return conflict();
  const authority = await loadSalesExperimentLaunchStatus(c, merchant, a.protocolId), launch = authority.authorization;
  if (!launch || launch.launchId !== a.launchId || launch.launchDigest !== a.launchDigest) return conflict();
  if (!authority.authorizationCurrent) return blocked(authority.stage);
  const p = (await loadSalesExperimentProtocol(c, merchant, a.protocolId)).protocol, basis = launch.snapshot.basis.review.basis;
  if (a.protocolDigest !== basis.protocolDigest || a.cohortId !== basis.cohortId || a.cohortDigest !== basis.cohortDigest
    || a.candidateId !== p.candidate.id || a.artifactDigest !== p.candidate.artifactDigest || a.baselineDigest !== p.candidate.baselineDigest || a.sectorDigest !== p.sector.digest
    || a.enrollmentStartsAt !== p.design.window.enrollmentStartsAt || a.enrollmentEndsAt !== p.design.window.enrollmentEndsAt
    || a.observationDays !== p.design.window.observationDays || a.decisionNotBefore !== p.design.window.decisionNotBefore) return conflict();
  const bundle = await requireCurrentLearningPolicyCandidate(c, merchant, a.candidateId, a.artifactDigest);
  if (bundle.candidateStyleInstruction !== buildCandidateStyleInstruction(bundle.proposal)) return conflict();
  const [conversations] = await c.execute<any[]>(`SELECT customerName,customerPhone,status,human_takeover,automation_after_message_id,handoff_version
    FROM conversations WHERE id=? AND merchantId=? FOR UPDATE`, [input.conversationId, merchant]);
  if (conversations.length !== 1) return conflict();
  const conversation = conversations[0], phone = cohortPhone.safeParse(conversation.customerPhone);
  if (!phone.success || policyArtifactDigest({ version: 'sales-experiment-customer.v1', merchantId: merchant, phone: phone.data }) !== a.customerKey) return conflict();
  const [bindings] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_assignment_conversations WHERE merchant_id=? AND protocol_id=? AND conversation_reference=? FOR SHARE',
    [merchant, a.protocolId, input.conversationId]);
  if (bindings.length > 1 || bindings.length && (bindings[0].customer_key !== a.customerKey || Number(bindings[0].assignment_id) !== assignment.assignmentId)) return conflict();
  const [messages] = await c.execute<any[]>(`SELECT id,messageType,content,isProcessed,DATE_FORMAT(createdAt,'%Y-%m-%dT%H:%i:%s.000Z') AS received_at
    FROM messages WHERE id=? AND conversationId=? AND direction='incoming' FOR SHARE`, [input.incomingMessageId, input.conversationId]);
  if (messages.length !== 1) return conflict();
  const message = messages[0];
  const [latest] = await c.execute<any[]>("SELECT id FROM messages WHERE conversationId=? AND direction='incoming' ORDER BY id DESC LIMIT 1 FOR SHARE", [input.conversationId]);
  const [answered] = await c.execute<any[]>("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing' AND id>? ORDER BY id LIMIT 1 FOR SHARE", [input.conversationId, input.incomingMessageId]);
  const [previous] = await c.execute<any[]>(`SELECT id,content,sender_type AS senderType,isProcessed,aiResponse FROM messages
    WHERE conversationId=? AND direction='outgoing' AND id<? ORDER BY id DESC LIMIT 1 FOR SHARE`, [input.conversationId, input.incomingMessageId]);
  const last = previous[0] ?? null, lastAssistantMessage = last?.senderType === 'assistant' && Number(last.isProcessed) === 1 && last.aiResponse !== null ? String(last.content ?? '') : '';
  const messageDigest = policyArtifactDigest({ version: 'cohort-message-selection.v1', merchant, conversationId: input.conversationId, incomingMessageId: input.incomingMessageId,
    customerName: conversation.customerName ?? null, customerPhone: String(conversation.customerPhone), messageType: String(message.messageType), content: String(message.content ?? ''), receivedAt: String(message.received_at) });
  if (input.expectedMessageDigest && input.expectedMessageDigest !== messageDigest
    || input.incomingMessageId === a.incomingMessageId && messageDigest !== a.messageDigest) return conflict();
  const checkedAt = await clock(c), now = Date.parse(checkedAt), received = Date.parse(message.received_at);
  if (now < Date.parse(a.assignedAt) || now >= Date.parse(a.observationEndsAt)) return blocked('outside_observation');
  if (input.incomingMessageId < a.incomingMessageId || !Number.isFinite(received) || received > now
    || received < Math.floor(Date.parse(a.messageReceivedAt) / 1000) * 1000 || received >= Date.parse(a.observationEndsAt)) return blocked('invalid_source_time');
  if (conversation.status !== 'active') return blocked('inactive_conversation');
  if (Number(conversation.human_takeover) !== 0) return blocked('human_takeover');
  const handoffVersion = Number(conversation.handoff_version), boundary = Number(conversation.automation_after_message_id);
  if (!Number.isSafeInteger(handoffVersion) || handoffVersion < 0 || !Number.isSafeInteger(boundary) || boundary < 0 || input.incomingMessageId <= boundary) return blocked('before_handoff_boundary');
  if (Number(latest[0]?.id) !== input.incomingMessageId) return blocked('superseded_inbound');
  if (Number(message.isProcessed) !== 0 || answered.length) return blocked('already_answered');
  if (message.messageType !== 'text' || !String(message.content ?? '').trim() || Array.from(String(message.content)).length > 4000) return blocked('unsupported_source');
  const sourceDigest = policyArtifactDigest({ version: 'sales-turn-source.v1', merchant, conversationId: input.conversationId, incomingMessageId: input.incomingMessageId,
    messageDigest, isProcessed: Number(message.isProcessed), status: conversation.status, humanTakeover: Number(conversation.human_takeover), boundary, handoffVersion, previous: last });
  return { kind: 'current' as const, assignment, protocol: p, bundle, launch, checkedAt, messageDigest, sourceDigest, handoffVersion,
    content: String(message.content), lastAssistantMessage, hasBinding: bindings.length === 1 };
}
type CurrentContext = Extract<Awaited<ReturnType<typeof currentContext>>, { kind: 'current' }>;
function selection(context: CurrentContext, requestedIntent: CustomerIntent, baseSystemPrompt: string) {
  const detected = detectIntent(context.content, undefined, undefined, context.lastAssistantMessage);
  // Refusal and an existing-order issue cannot be overruled by a caller's stale intent estimate.
  const effectiveIntent = detected === 'declined' || detected === 'post_purchase' ? detected : requestedIntent;
  const facts = { intent: effectiveIntent, customerMessage: context.content, lastAssistantMessage: context.lastAssistantMessage, sectorPlaybook: context.protocol.sector.playbook };
  const goal = decideSalesTurnGoal(facts), arm = context.assignment.snapshot.arm;
  const styleReason = goal === 'respect_decline' ? 'customer_declined' as const : goal === 'resolve_existing_order' ? 'existing_order' as const
    : arm === 'baseline' ? 'baseline_arm' as const : 'candidate_style' as const;
  const styleApplied = styleReason === 'candidate_style', policyText = buildSalesTurnPolicy(facts) + (styleApplied ? context.bundle.candidateStyleInstruction : '');
  return { requestedIntent, effectiveIntent, goal, styleApplied, styleReason, basePromptDigest: policyArtifactDigest(baseSystemPrompt),
    policyText, policyDigest: policyArtifactDigest(policyText), promptDigest: policyArtifactDigest(baseSystemPrompt + policyText) };
}

/** Idempotent preparation only. Existing receipts remain recoverable after revocation without returning a live prompt. */
export async function prepareSalesExperimentTurn(merchantId: number, value: PrepareSalesExperimentTurnInput) {
  const merchant = id.parse(merchantId), input = prepareSalesExperimentTurnInput.parse(value);
  const { baseSystemPrompt, ...metadata } = input, payload = policyArtifactDigest({ ...metadata, basePromptDigest: policyArtifactDigest(baseSystemPrompt) });
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [prior] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_turns WHERE merchant_id=? AND request_id=? FOR SHARE', [merchant, input.requestId]);
    if (prior.length) { if (prior[0].payload_digest !== payload) return conflict(); return { kind: 'recorded' as const, receipt: receipt(prior[0]), reused: true, ...flags }; }
    const current = await currentContext(c, merchant, input); if (current.kind === 'blocked') return current;
    const [existing] = await c.execute<any[]>('SELECT id FROM ai_sales_experiment_turns WHERE merchant_id=? AND message_reference=? FOR SHARE', [merchant, input.incomingMessageId]);
    if (existing.length) return conflict();
    const a = current.assignment.snapshot, preparedAt = await clock(c);
    if (Date.parse(preparedAt) < Date.parse(current.checkedAt) || Date.parse(preparedAt) >= Date.parse(a.observationEndsAt)) return blocked('observation_window_changed');
    const snapshot = salesExperimentTurnSnapshot.parse({ version: 'sales-experiment-turn.v1', merchantId: merchant, protocolId: a.protocolId,
      assignmentId: input.assignmentId, assignmentDigest: input.assignmentDigest, launchId: a.launchId, launchDigest: a.launchDigest, arm: a.arm,
      artifactDigest: a.artifactDigest, baselineDigest: a.baselineDigest, sectorDigest: a.sectorDigest, routeDigest: current.launch.snapshot.basis.review.basis.routeDigest,
      conversationId: input.conversationId, incomingMessageId: input.incomingMessageId, messageDigest: current.messageDigest, sourceDigest: current.sourceDigest,
      handoffVersion: current.handoffVersion, ...selection(current, input.intent, baseSystemPrompt), preparedAt, assignmentAt: a.assignedAt,
      observationEndsAt: a.observationEndsAt, scope: 'policy_preparation_only', ...flags });
    if (!current.hasBinding) await c.execute(`INSERT INTO ai_sales_experiment_assignment_conversations
      (merchant_id,protocol_id,conversation_reference,customer_key,assignment_id) VALUES (?,?,?,?,?)`, [merchant, a.protocolId, input.conversationId, a.customerKey, input.assignmentId]);
    const [inserted] = await c.execute<any>(`INSERT INTO ai_sales_experiment_turns
      (merchant_id,protocol_id,assignment_id,conversation_reference,message_reference,request_id,payload_digest,turn_digest,snapshot) VALUES (?,?,?,?,?,?,?,?,?)`,
      [merchant, a.protocolId, input.assignmentId, input.conversationId, input.incomingMessageId, input.requestId, payload, policyArtifactDigest(snapshot), JSON.stringify(snapshot)]);
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_turns WHERE merchant_id=? AND id=?', [merchant, inserted.insertId]);
    return { kind: 'recorded' as const, receipt: receipt(rows[0]), reused: false, ...flags };
  });
}
export async function getSalesExperimentTurn(merchantId: number, value: z.infer<typeof readSalesExperimentTurnInput>) {
  const merchant = id.parse(merchantId), input = readSalesExperimentTurnInput.parse(value);
  return checkoutTransaction(async c => { await lockMerchant(c, merchant); return load(c, merchant, input); });
}

/** Rebuilds the exact selected fragment against fresh evidence. Still not permission to call AI or send WhatsApp. */
export async function resolveSalesExperimentTurnPrompt(merchantId: number, value: z.infer<typeof resolveSalesExperimentTurnInput>) {
  const merchant = id.parse(merchantId), input = resolveSalesExperimentTurnInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const saved = await load(c, merchant, input), s = saved.snapshot;
    if (policyArtifactDigest(input.baseSystemPrompt) !== s.basePromptDigest) return conflict();
    const current = await currentContext(c, merchant, { assignmentId: s.assignmentId, assignmentDigest: s.assignmentDigest, conversationId: s.conversationId, incomingMessageId: s.incomingMessageId });
    if (current.kind === 'blocked') return current;
    if (!current.hasBinding || current.sourceDigest !== s.sourceDigest || current.messageDigest !== s.messageDigest || current.handoffVersion !== s.handoffVersion) return blocked('source_changed');
    const selected = selection(current, s.requestedIntent, input.baseSystemPrompt), a = current.assignment.snapshot;
    if (a.arm !== s.arm || a.artifactDigest !== s.artifactDigest || a.baselineDigest !== s.baselineDigest || a.sectorDigest !== s.sectorDigest
      || a.protocolId !== s.protocolId || a.launchId !== s.launchId || a.launchDigest !== s.launchDigest || a.assignedAt !== s.assignmentAt || a.observationEndsAt !== s.observationEndsAt
      || current.launch.snapshot.basis.review.basis.routeDigest !== s.routeDigest
      || Object.entries(selected).some(([key, value]) => s[key as keyof typeof selected] !== value)) return blocked('selection_changed');
    const checkedAt = await clock(c);
    if (Date.parse(checkedAt) < Date.parse(s.preparedAt) || Date.parse(checkedAt) >= Date.parse(s.observationEndsAt)) return blocked('outside_observation');
    return { kind: 'resolved' as const, turnId: saved.turnId, turnDigest: saved.turnDigest, systemPrompt: input.baseSystemPrompt + selected.policyText,
      selectionCurrentAtRead: true as const, checkedAt, observationEndsAt: s.observationEndsAt, ...flags };
  });
}
