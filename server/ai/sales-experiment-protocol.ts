import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { requireCurrentLearningPolicyCandidate } from './learning-policy-candidates';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { getSalesSectorPlaybook } from '../../shared/sales-sector-playbooks';
import { calculateSalesExperimentSample } from '../../shared/sales-experiment-sample';
import { salesExperimentProtocolSnapshot, salesExperimentWithdrawalSnapshot, registerSalesExperimentProtocolInput, salesExperimentProtocolInput,
  salesExperimentProtocolHistoryInput, withdrawSalesExperimentProtocolInput,
  type RegisterSalesExperimentProtocolInput, type WithdrawSalesExperimentProtocolInput } from './sales-experiment-protocol-contract';

const identity = z.number().int().positive().safe();
export class SalesExperimentProtocolConflict extends Error {
  constructor() { super('Sales experiment protocol changed or is unavailable'); }
}
const conflict = (): never => { throw new SalesExperimentProtocolConflict(); };
async function lockMerchant(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) conflict();
}
async function sectorSnapshot(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT playbook_id,revision FROM ai_sales_sector_settings WHERE merchant_id=? FOR SHARE', [merchant]);
  const revision = Number(rows[0]?.revision ?? 0), requested = rows[0]?.playbook_id ?? 'general';
  const playbook = getSalesSectorPlaybook(requested);
  if (playbook.id !== requested || !Number.isSafeInteger(revision) || revision < 0) conflict();
  return { revision, playbook, digest: policyArtifactDigest(playbook) };
}
function readProtocol(row: any) {
  try {
    const protocol = salesExperimentProtocolSnapshot.parse(typeof row.protocol === 'string' ? JSON.parse(row.protocol) : row.protocol);
    if (protocol.version !== 'sales-experiment-protocol.v1' || protocol.merchantId !== Number(row.merchant_id)
      || protocol.candidate.id !== Number(row.candidate_id) || protocol.candidate.artifactDigest !== row.artifact_digest
      || policyArtifactDigest(protocol) !== row.protocol_digest
      || protocol.sector.digest !== policyArtifactDigest(protocol.sector.playbook) || protocol.activationAllowed !== false
      || protocol.sampleAdequacy !== 'not_independently_verified' || protocol.cohortExecution !== 'not_implemented'
      || !['registered', 'withdrawn'].includes(row.state)) conflict();
    return protocol;
  } catch { return conflict(); }
}
function readWithdrawal(row: any, protocolDigest: string) {
  try {
    const withdrawal = salesExperimentWithdrawalSnapshot.parse(typeof row.withdrawal === 'string' ? JSON.parse(row.withdrawal) : row.withdrawal);
    if (policyArtifactDigest(withdrawal) !== row.withdrawal_digest || withdrawal.protocolId !== Number(row.protocol_id)
      || withdrawal.merchantId !== Number(row.merchant_id) || withdrawal.protocolDigest !== protocolDigest
      || withdrawal.version !== 'sales-experiment-withdrawal.v1' || withdrawal.winner !== null) conflict();
    return withdrawal;
  } catch { return conflict(); }
}
async function receipt(c: PoolConnection, row: any) {
  const protocol = readProtocol(row);
  const [withdrawals] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_withdrawals WHERE merchant_id=? AND protocol_id=? FOR SHARE', [row.merchant_id, row.id]);
  if ((row.state === 'withdrawn') !== (withdrawals.length === 1) || withdrawals.length > 1) conflict();
  const withdrawal = withdrawals.length ? readWithdrawal(withdrawals[0], row.protocol_digest) : null;
  return { protocolId: Number(row.id), protocolDigest: String(row.protocol_digest), state: row.state as 'registered' | 'withdrawn',
    protocol, withdrawal: withdrawal ? { ...withdrawal, actorUserId: withdrawals[0].actor_user_id === null ? null : Number(withdrawals[0].actor_user_id), createdAt: withdrawals[0].created_at } : null,
    actorUserId: row.actor_user_id === null ? null : Number(row.actor_user_id), createdAt: row.created_at,
    activationAllowed: false as const, eligibility: 'not_checked' as const, experimentStarted: false as const };
}

/** Freezes a design only. No customer assignment, provider call, message, approval, or winner is created. */
export async function registerSalesExperimentProtocol(merchantId: number, actorUserId: number, value: RegisterSalesExperimentProtocolInput) {
  const merchant = identity.parse(merchantId), actor = identity.parse(actorUserId), input = registerSalesExperimentProtocolInput.parse(value);
  const payloadDigest = policyArtifactDigest({ actor, input });
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [existing] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_protocols WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchant, input.requestId]);
    if (existing.length) {
      if (existing[0].payload_digest !== payloadDigest) conflict();
      return { ...await receipt(c, existing[0]), reused: true };
    }
    // Historical retries precede the new planning gate: recover an old receipt without rewriting it.
    const sampleCalculation = calculateSalesExperimentSample(input.design.sample);
    if (sampleCalculation.status !== 'meets_calculated_floor') conflict();
    const candidate = await requireCurrentLearningPolicyCandidate(c, merchant, input.candidateId, input.artifactDigest);
    const sector = await sectorSnapshot(c, merchant);
    if (sector.revision !== input.expectedSectorRevision) conflict();
    const [clock] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
    const registeredAt = String(clock[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
    // Database time, not caller time. Replays are handled first and remain recoverable after the window passes.
    if (!Number.isFinite(Date.parse(registeredAt)) || Date.parse(input.design.window.enrollmentStartsAt) <= Date.parse(registeredAt)) conflict();
    const [active] = await c.execute<any[]>("SELECT id FROM ai_sales_experiment_protocols WHERE merchant_id=? AND state='registered' FOR UPDATE", [merchant]);
    if (active.length) conflict();
    const protocol = salesExperimentProtocolSnapshot.parse({ version: 'sales-experiment-protocol.v1', merchantId: merchant, registeredAt,
      candidate: { id: input.candidateId, artifactDigest: input.artifactDigest, baselineDigest: candidate.baselineDigest,
        sourceDigest: candidate.sourceDigest, preparationReviewId: candidate.reviewId },
      sector, design: input.design, sampleAdequacy: 'not_independently_verified', sampleCalculation, cohortExecution: 'not_implemented',
      activationAllowed: false });
    const protocolDigest = policyArtifactDigest(protocol);
    const [saved] = await c.execute<any>(`INSERT INTO ai_sales_experiment_protocols
      (merchant_id,candidate_id,request_id,payload_digest,artifact_digest,protocol_digest,protocol,actor_user_id)
      VALUES (?,?,?,?,?,?,?,?)`, [merchant, input.candidateId, input.requestId, payloadDigest, input.artifactDigest, protocolDigest, JSON.stringify(protocol), actor]);
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_protocols WHERE id=? AND merchant_id=?', [saved.insertId, merchant]);
    return { ...await receipt(c, rows[0]), reused: false };
  });
}

export async function getSalesExperimentProtocol(merchantId: number, value: { protocolId: number }) {
  const merchant = identity.parse(merchantId), input = salesExperimentProtocolInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    return loadSalesExperimentProtocol(c, merchant, input.protocolId);
  });
}

/** Historical read inside the caller's transaction. Caller holds the merchant lock; this is not a freshness gate. */
export async function loadSalesExperimentProtocol(c: PoolConnection, merchant: number, protocolId: number) {
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_protocols WHERE id=? AND merchant_id=? FOR SHARE', [identity.parse(protocolId), identity.parse(merchant)]);
  if (rows.length !== 1) conflict();
  return receipt(c, rows[0]);
}

export async function getSalesExperimentProtocolHistory(merchantId: number, value: { beforeId?: number; limit?: number }) {
  const merchant = identity.parse(merchantId), input = salesExperimentProtocolHistoryInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [rows] = await c.execute<any[]>(`SELECT * FROM ai_sales_experiment_protocols WHERE merchant_id=?
      ${input.beforeId ? 'AND id<?' : ''} ORDER BY id DESC LIMIT ${input.limit + 1} FOR SHARE`, input.beforeId ? [merchant, input.beforeId] : [merchant]);
    const items = [];
    for (const row of rows.slice(0, input.limit)) {
      const record = await receipt(c, row);
      items.push({ protocolId: record.protocolId, protocolDigest: record.protocolDigest, state: record.state,
        title: String(record.protocol.design.title), candidateId: Number(record.protocol.candidate.id),
        createdAt: record.createdAt, activationAllowed: false as const, experimentStarted: false as const });
    }
    return { items, nextBeforeId: rows.length > input.limit ? items.at(-1)!.protocolId : null };
  });
}

/** Withdrawal is an append-only reason, never an early success declaration or a protocol amendment. */
export async function withdrawSalesExperimentProtocol(merchantId: number, actorUserId: number, value: WithdrawSalesExperimentProtocolInput) {
  const merchant = identity.parse(merchantId), actor = identity.parse(actorUserId), input = withdrawSalesExperimentProtocolInput.parse(value);
  const payloadDigest = policyArtifactDigest({ actor, input });
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [existing] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_withdrawals WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchant, input.requestId]);
    if (existing.length && (Number(existing[0].protocol_id) !== input.protocolId || existing[0].payload_digest !== payloadDigest)) conflict();
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_protocols WHERE id=? AND merchant_id=? FOR UPDATE', [input.protocolId, merchant]);
    if (rows.length !== 1 || rows[0].protocol_digest !== input.protocolDigest) conflict();
    const before = await receipt(c, rows[0]);
    if (existing.length) return { ...before, reused: true };
    if (before.state !== 'registered') conflict();
    const withdrawal = { version: 'sales-experiment-withdrawal.v1', merchantId: merchant, protocolId: input.protocolId,
      protocolDigest: input.protocolDigest, reason: input.reason, winner: null };
    await c.execute(`INSERT INTO ai_sales_experiment_withdrawals
      (merchant_id,protocol_id,request_id,payload_digest,withdrawal_digest,withdrawal,actor_user_id) VALUES (?,?,?,?,?,?,?)`,
      [merchant, input.protocolId, input.requestId, payloadDigest, policyArtifactDigest(withdrawal), JSON.stringify(withdrawal), actor]);
    await c.execute("UPDATE ai_sales_experiment_protocols SET state='withdrawn',active_slot=NULL WHERE id=? AND merchant_id=? AND state='registered'", [input.protocolId, merchant]);
    return { ...await receipt(c, { ...rows[0], state: 'withdrawn' }), reused: false };
  });
}
