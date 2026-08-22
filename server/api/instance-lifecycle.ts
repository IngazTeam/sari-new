import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  acquireWhatsAppInstanceLock,
  activeWhatsAppPhoneIdentityHash,
  assertWhatsAppPhoneAvailable,
  finalizeWhatsAppInstanceLockConnection,
  isWhatsAppActivePhoneUniqueConflict,
  WhatsAppPhoneOwnershipConflictError,
  whatsAppMerchantLockNamespace,
  whatsAppPhoneLockNamespace,
} from '../channels/whatsapp/instance-ownership';

export { WhatsAppInstanceLockBusyError as RestInstanceMutationBusyError } from '../channels/whatsapp/instance-ownership';

const INSTANCE_ID_MAX = 2_147_483_647;
const INSTANCE_STATUSES = new Set(['active', 'inactive', 'pending', 'expired']);

export class RestInstanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestInstanceValidationError';
  }
}

export interface RestInstanceMutationInput {
  isActive?: boolean;
  isPrimary?: boolean;
}

export interface PublicWhatsAppInstance {
  id: number;
  instanceId: string;
  phoneNumber: string | null;
  displayName: null;
  status: 'active' | 'inactive' | 'pending' | 'expired';
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string | Date;
}

interface PublicInstanceRow extends RowDataPacket {
  id: number | string;
  instanceId: string;
  phoneNumber: string | null;
  status: string;
  isPrimary: number | string;
  createdAt: string | Date;
}

interface InstanceCountRow extends RowDataPacket {
  totalInstances: number | string;
  activeInstances: number | string;
}

interface LockedInstanceRow extends RowDataPacket {
  id: number | string;
  merchantId: number | string;
  phoneNumber: string | null;
  status: string;
  isPrimary: number | string;
}

export type RestInstanceMutationResult =
  | { kind: 'updated'; instance: PublicWhatsAppInstance }
  | { kind: 'not_found' }
  | { kind: 'phone_conflict' }
  | { kind: 'primary_requires_active' };

function assertPositiveId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > INSTANCE_ID_MAX) {
    throw new RestInstanceValidationError(`Invalid ${label}`);
  }
}

export function normalizeRestInstanceId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) {
    throw new RestInstanceValidationError('Invalid instance ID');
  }
  const id = Number(value);
  assertPositiveId(id, 'instance ID');
  return id;
}

export function normalizeRestInstanceMutationBody(value: unknown): RestInstanceMutationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RestInstanceValidationError('Invalid instance update');
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length < 1 || keys.length > 2 || keys.some(key => key !== 'isActive' && key !== 'isPrimary')) {
    throw new RestInstanceValidationError('Invalid instance update fields');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isActive') && typeof body.isActive !== 'boolean') {
    throw new RestInstanceValidationError('isActive must be boolean');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isPrimary') && typeof body.isPrimary !== 'boolean') {
    throw new RestInstanceValidationError('isPrimary must be boolean');
  }
  if (body.isActive === false && body.isPrimary === true) {
    throw new RestInstanceValidationError('An inactive instance cannot be primary');
  }
  return {
    ...(body.isActive !== undefined ? { isActive: body.isActive as boolean } : {}),
    ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary as boolean } : {}),
  };
}

async function assertInstanceSchema(): Promise<void> {
  await assertRuntimeSchema('REST WhatsApp instance lifecycle', [{
    table: 'whatsapp_instances',
    columns: ['id', 'merchant_id', 'instance_id', 'phone_number', 'active_phone_identity_hash', 'status', 'is_primary', 'created_at'],
  }]);
}

function mapPublicInstance(row: PublicInstanceRow | LockedInstanceRow & { instanceId: string; createdAt: string | Date }): PublicWhatsAppInstance {
  if (!INSTANCE_STATUSES.has(row.status)) throw new Error('Invalid WhatsApp instance status');
  return {
    id: Number(row.id),
    instanceId: row.instanceId,
    phoneNumber: row.phoneNumber,
    displayName: null,
    status: row.status as PublicWhatsAppInstance['status'],
    isPrimary: Number(row.isPrimary) === 1,
    isActive: row.status === 'active',
    createdAt: row.createdAt,
  };
}

async function rollbackRestInstanceTransaction(connection: PoolConnection): Promise<boolean> {
  try {
    await connection.rollback();
    return true;
  } catch {
    return false;
  }
}

export async function listPublicWhatsAppInstances(merchantId: number): Promise<PublicWhatsAppInstance[]> {
  assertPositiveId(merchantId, 'merchant ID');
  await assertInstanceSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute<PublicInstanceRow[]>(
    `SELECT id,
            instance_id AS instanceId,
            phone_number AS phoneNumber,
            status,
            is_primary AS isPrimary,
            created_at AS createdAt
       FROM whatsapp_instances
      WHERE merchant_id = ?
      ORDER BY is_primary DESC, created_at DESC, id DESC`,
    [merchantId],
  );
  return rows.map(mapPublicInstance);
}

export async function getPublicWhatsAppInstanceCounts(merchantId: number): Promise<{
  totalInstances: number;
  activeInstances: number;
}> {
  assertPositiveId(merchantId, 'merchant ID');
  await assertInstanceSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute<InstanceCountRow[]>(
    `SELECT COUNT(*) AS totalInstances,
            COALESCE(SUM(status = 'active'), 0) AS activeInstances
       FROM whatsapp_instances
      WHERE merchant_id = ?`,
    [merchantId],
  );
  const totalInstances = Number(rows[0]?.totalInstances ?? 0);
  const activeInstances = Number(rows[0]?.activeInstances ?? 0);
  if (!Number.isSafeInteger(totalInstances) || !Number.isSafeInteger(activeInstances)) {
    throw new Error('Invalid WhatsApp instance counts');
  }
  return { totalInstances, activeInstances };
}

/**
 * Applies the REST instance transition as one tenant-scoped transaction.
 * A per-merchant named lock serializes competing primary changes, while an
 * opaque per-phone lock prevents two tenants activating the same number at once.
 * Cross-tenant transfer is deliberately rejected; it belongs to a separately
 * verified ownership workflow and must never be triggered by this toggle route.
 */
export async function mutateRestWhatsAppInstance(
  merchantId: number,
  instanceId: number,
  input: RestInstanceMutationInput,
): Promise<RestInstanceMutationResult> {
  assertPositiveId(merchantId, 'merchant ID');
  assertPositiveId(instanceId, 'instance ID');
  const normalized = normalizeRestInstanceMutationBody(input);
  await assertInstanceSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const connection = await pool.getConnection();
  const heldLocks: string[] = [];
  let transactionOpen = false;
  let connectionReusable = true;

  const rollbackOrFail = async (): Promise<void> => {
    const rolledBack = await rollbackRestInstanceTransaction(connection);
    transactionOpen = false;
    if (!rolledBack) {
      connectionReusable = false;
      throw new Error('WhatsApp instance transaction recovery failed');
    }
  };

  try {
    heldLocks.push(await acquireWhatsAppInstanceLock(connection, whatsAppMerchantLockNamespace(merchantId)));
    await connection.beginTransaction();
    transactionOpen = true;

    const [targetRows] = await connection.execute<LockedInstanceRow[]>(
      `SELECT id,
              merchant_id AS merchantId,
              phone_number AS phoneNumber,
              status,
              is_primary AS isPrimary
         FROM whatsapp_instances
        WHERE id = ? AND merchant_id = ?
        LIMIT 1
        FOR UPDATE`,
      [instanceId, merchantId],
    );
    const target = targetRows[0];
    if (!target) {
      await rollbackOrFail();
      return { kind: 'not_found' };
    }

    const finalStatus = normalized.isActive === undefined
      ? target.status
      : normalized.isActive ? 'active' : 'inactive';
    const finalActive = finalStatus === 'active';
    const activePhoneIdentityHash = finalActive && target.phoneNumber
      ? activeWhatsAppPhoneIdentityHash(target.phoneNumber)
      : null;
    if (normalized.isPrimary === true && !finalActive) {
      await rollbackOrFail();
      return { kind: 'primary_requires_active' };
    }

    if (finalActive && target.phoneNumber) {
      heldLocks.push(await acquireWhatsAppInstanceLock(connection, whatsAppPhoneLockNamespace(target.phoneNumber)));
      try {
        await assertWhatsAppPhoneAvailable(connection, target.phoneNumber, instanceId);
      } catch (error) {
        if (!(error instanceof WhatsAppPhoneOwnershipConflictError)) throw error;
        await rollbackOrFail();
        return { kind: 'phone_conflict' };
      }
    }

    const wantsPrimary = normalized.isPrimary ?? Number(target.isPrimary) === 1;
    if (wantsPrimary && finalActive) {
      await connection.execute(
        `UPDATE whatsapp_instances
            SET is_primary = 0, updated_at = NOW()
          WHERE merchant_id = ? AND is_primary <> 0`,
        [merchantId],
      );
    }
    await connection.execute(
      `UPDATE whatsapp_instances
          SET status = ?, is_primary = ?, active_phone_identity_hash = ?, updated_at = NOW()
        WHERE id = ? AND merchant_id = ?`,
      [finalStatus, wantsPrimary && finalActive ? 1 : 0, activePhoneIdentityHash, instanceId, merchantId],
    );

    const targetLostPrimary = Number(target.isPrimary) === 1 && (!finalActive || normalized.isPrimary === false);
    if (targetLostPrimary) {
      const [candidateRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id
           FROM whatsapp_instances
          WHERE merchant_id = ? AND status = 'active' AND id <> ?
          ORDER BY created_at ASC, id ASC
          LIMIT 1
          FOR UPDATE`,
        [merchantId, instanceId],
      );
      const candidateId = Number(candidateRows[0]?.id);
      if (Number.isSafeInteger(candidateId) && candidateId > 0) {
        await connection.execute(
          `UPDATE whatsapp_instances SET is_primary = 1, updated_at = NOW()
            WHERE id = ? AND merchant_id = ? AND status = 'active'`,
          [candidateId, merchantId],
        );
      }
    } else if (finalActive && normalized.isPrimary !== false) {
      const [primaryRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM whatsapp_instances
          WHERE merchant_id = ? AND status = 'active' AND is_primary = 1
          LIMIT 1 FOR UPDATE`,
        [merchantId],
      );
      if (!primaryRows[0]) {
        await connection.execute(
          `UPDATE whatsapp_instances SET is_primary = 1, updated_at = NOW()
            WHERE id = ? AND merchant_id = ? AND status = 'active'`,
          [instanceId, merchantId],
        );
      }
    }

    const [updatedRows] = await connection.execute<PublicInstanceRow[]>(
      `SELECT id,
              instance_id AS instanceId,
              phone_number AS phoneNumber,
              status,
              is_primary AS isPrimary,
              created_at AS createdAt
         FROM whatsapp_instances
        WHERE id = ? AND merchant_id = ?
        LIMIT 1`,
      [instanceId, merchantId],
    );
    if (!updatedRows[0]) throw new Error('Updated WhatsApp instance disappeared');

    await connection.commit();
    transactionOpen = false;
    return { kind: 'updated', instance: mapPublicInstance(updatedRows[0]) };
  } catch (error) {
    if (transactionOpen) await rollbackOrFail();
    if (isWhatsAppActivePhoneUniqueConflict(error)) {
      return { kind: 'phone_conflict' };
    }
    throw error;
  } finally {
    await finalizeWhatsAppInstanceLockConnection(connection, heldLocks, connectionReusable);
  }
}
