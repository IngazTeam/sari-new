import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { loadSalesExperimentLaunchStatus } from './sales-experiment-launch';
import { inspectSalesCohortWithinTransaction } from './sales-experiment-cohort';
import { loadSalesExperimentProtocol } from './sales-experiment-protocol';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { salesExperimentLaunchWindow } from './sales-experiment-launch-contract';
import { assignSalesExperimentInput, readSalesExperimentAssignmentInput, salesExperimentAssignmentSnapshot, type AssignSalesExperimentInput } from './sales-experiment-assignment-contract';

const id = z.number().int().positive().safe();
export class SalesExperimentAssignmentConflict extends Error {
  constructor() { super('Sales experiment assignment changed or is unavailable'); }
}
const conflict = (): never => { throw new SalesExperimentAssignmentConflict(); };
async function lockMerchant(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) conflict();
}
async function clock(c: PoolConnection) {
  const [rows] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  return String(rows[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
}
function receipt(row: any) {
  try {
    const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot, snapshot = salesExperimentAssignmentSnapshot.parse(raw);
    if (policyArtifactDigest(raw) !== row.assignment_digest || policyArtifactDigest(snapshot) !== row.assignment_digest
      || snapshot.merchantId !== Number(row.merchant_id) || snapshot.protocolId !== Number(row.protocol_id)
      || snapshot.launchId !== Number(row.launch_id) || snapshot.customerKey !== row.customer_key || snapshot.arm !== row.arm
      || snapshot.conversationId !== Number(row.conversation_reference) || snapshot.incomingMessageId !== Number(row.message_reference)
      || snapshot.observationEndsAt !== String(row.observation_ends_at)) conflict();
    return { assignmentId: id.parse(Number(row.id)), assignmentDigest: String(row.assignment_digest), snapshot,
      eligibility: 'not_checked' as const, activationAllowed: false as const, dispatchAllowed: false as const, exposureRecorded: false as const };
  } catch { return conflict(); }
}
const selection = "SELECT *,DATE_FORMAT(observation_ends_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS observation_utc FROM ai_sales_experiment_assignments";
function parseRow(row: any) { return receipt({ ...row, observation_ends_at: String(row.observation_utc).replace(/(\.\d{3})\d{3}Z$/, '$1Z') }); }

/** Internal historical read under the caller's merchant lock; never a current-use permit. */
export async function loadSalesExperimentAssignment(c: PoolConnection, merchant: number, assignmentId: number) {
  const [rows] = await c.execute<any[]>(`${selection} WHERE merchant_id=? AND id=? FOR SHARE`, [merchant, assignmentId]);
  if (rows.length !== 1) return conflict();
  return parseRow(rows[0]);
}

/** History remains readable after revocation/source deletion. A receipt never authorizes generation or sending. */
export async function getSalesExperimentAssignment(merchantId: number, value: { assignmentId: number }) {
  const merchant = id.parse(merchantId), input = readSalesExperimentAssignmentInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    return loadSalesExperimentAssignment(c, merchant, input.assignmentId);
  });
}

/** Durable enrollment layer only; deliberately not connected to inbound dispatch until exposure accounting exists. */
export async function assignSalesExperimentCustomer(merchantId: number, value: AssignSalesExperimentInput) {
  const merchant = id.parse(merchantId), input = assignSalesExperimentInput.parse(value);
  return checkoutTransaction(async c => {
    // Serializes enrollment, authorization withdrawal and revocation even across worker processes.
    await lockMerchant(c, merchant);
    const authority = await loadSalesExperimentLaunchStatus(c, merchant, input.protocolId), launch = authority.authorization;
    if (!launch || launch.launchId !== input.launchId || launch.launchDigest !== input.launchDigest) return conflict();
    const blocked = (reasons: string[]) => ({ kind: 'blocked' as const, reasons, assignmentCreated: false as const,
      activationAllowed: false as const, dispatchAllowed: false as const, exposureRecorded: false as const });
    if (!authority.authorizationCurrent || authority.stage !== 'enrollment_open') return blocked([authority.stage]);
    const review = launch.snapshot.basis.review.basis, protocol = (await loadSalesExperimentProtocol(c, merchant, input.protocolId)).protocol;
    const inspected = await inspectSalesCohortWithinTransaction(c, merchant, { protocolId: input.protocolId,
      cohortDigest: review.cohortDigest, conversationId: input.conversationId, incomingMessageId: input.incomingMessageId,
      expectedMessageDigest: input.expectedMessageDigest });
    const { inspection, canonicalPhone, frozen } = inspected;
    if (!inspection.qualifiesAtRead || !canonicalPhone) return blocked(inspection.reasons);
    // This scoped digest is a pseudonymous lookup key, not anonymization or a secret.
    const customerKey = policyArtifactDigest({ version: 'sales-experiment-customer.v1', merchantId: merchant, phone: canonicalPhone });
    const [bindings] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_assignment_conversations WHERE merchant_id=? AND protocol_id=? AND conversation_reference=? FOR SHARE',
      [merchant, input.protocolId, input.conversationId]);
    if (bindings.length > 1 || bindings.length && bindings[0].customer_key !== customerKey) conflict();
    const [rows] = await c.execute<any[]>(`${selection} WHERE merchant_id=? AND protocol_id=? AND customer_key=? FOR SHARE`, [merchant, input.protocolId, customerKey]);
    if (rows.length > 1) conflict();
    let saved = rows.length ? parseRow(rows[0]) : null;
    if (bindings.length && (!saved || Number(bindings[0].assignment_id) !== saved.assignmentId)) conflict();
    if (saved && (saved.snapshot.launchId !== launch.launchId || saved.snapshot.launchDigest !== launch.launchDigest
      || saved.snapshot.protocolDigest !== frozen.snapshot.protocolDigest || saved.snapshot.cohortDigest !== frozen.cohortDigest
      || saved.snapshot.cohortId !== frozen.cohortId || saved.snapshot.candidateId !== protocol.candidate.id
      || saved.snapshot.artifactDigest !== protocol.candidate.artifactDigest || saved.snapshot.baselineDigest !== protocol.candidate.baselineDigest
      || saved.snapshot.sectorDigest !== protocol.sector.digest
      || saved.snapshot.incomingMessageId === input.incomingMessageId && saved.snapshot.messageDigest !== inspection.messageDigest)) conflict();
    const assignedAt = await clock(c), window = launch.snapshot.basis.window;
    if (Date.parse(assignedAt) < Date.parse(inspection.inspectedAt) || salesExperimentLaunchWindow(assignedAt, window) !== 'enrollment_open') return blocked(['enrollment_window_changed']);
    if (saved && Date.parse(assignedAt) < Date.parse(saved.snapshot.assignedAt)) conflict();
    if (!saved) {
      // Keep customers out of overlapping policy experiments for their entire frozen observation period.
      const [overlap] = await c.execute<any[]>(`${selection} WHERE merchant_id=? AND customer_key=? AND protocol_id<>? AND observation_ends_at>? FOR SHARE`,
        [merchant, customerKey, input.protocolId, assignedAt.slice(0, 23).replace('T', ' ')]);
      for (const row of overlap) parseRow(row);
      if (overlap.length) return blocked(['overlapping_experiment']);
      const snapshot = salesExperimentAssignmentSnapshot.parse({ version: 'sales-experiment-assignment.v1', merchantId: merchant,
        protocolId: input.protocolId, protocolDigest: frozen.snapshot.protocolDigest, launchId: launch.launchId, launchDigest: launch.launchDigest,
        cohortId: frozen.cohortId, cohortDigest: frozen.cohortDigest, customerKey, candidateId: protocol.candidate.id,
        artifactDigest: protocol.candidate.artifactDigest, baselineDigest: protocol.candidate.baselineDigest, sectorDigest: protocol.sector.digest,
        arm: randomInt(2) === 0 ? 'baseline' : 'candidate', allocation: 'server_crypto_random_50_50.v1',
        conversationId: input.conversationId, incomingMessageId: input.incomingMessageId, messageDigest: inspection.messageDigest,
        sourceDigest: inspection.sourceDigest, population: inspection.population, messageReceivedAt: inspected.messageReceivedAt,
        qualifiedAt: inspection.inspectedAt, assignedAt, enrollmentStartsAt: window.enrollmentStartsAt, enrollmentEndsAt: window.enrollmentEndsAt,
        observationDays: window.observationDays, observationEndsAt: new Date(Date.parse(assignedAt) + window.observationDays * 86_400_000).toISOString(),
        decisionNotBefore: window.decisionNotBefore, scope: 'enrollment_only', dispatchAllowed: false, exposureRecorded: false });
      const [inserted] = await c.execute<any>(`INSERT INTO ai_sales_experiment_assignments
        (merchant_id,protocol_id,launch_id,customer_key,arm,conversation_reference,message_reference,observation_ends_at,assignment_digest,snapshot)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [merchant, input.protocolId, launch.launchId, customerKey, snapshot.arm, input.conversationId,
        input.incomingMessageId, snapshot.observationEndsAt.slice(0, 23).replace('T', ' '), policyArtifactDigest(snapshot), JSON.stringify(snapshot)]);
      const [created] = await c.execute<any[]>(`${selection} WHERE merchant_id=? AND id=?`, [merchant, inserted.insertId]);
      saved = parseRow(created[0]);
    }
    if (!bindings.length) await c.execute(`INSERT INTO ai_sales_experiment_assignment_conversations
      (merchant_id,protocol_id,conversation_reference,customer_key,assignment_id) VALUES (?,?,?,?,?)`,
      [merchant, input.protocolId, input.conversationId, customerKey, saved.assignmentId]);
    return { kind: 'assigned' as const, receipt: saved, reused: rows.length === 1, assignmentCreated: rows.length === 0,
      qualifiedAt: inspection.inspectedAt, checkedAt: assignedAt, activationAllowed: false as const, dispatchAllowed: false as const, exposureRecorded: false as const };
  });
}
