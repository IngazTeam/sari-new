import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { privacyHashExact } from '../../accounts/privacy-hash';

interface NamedLockRow extends RowDataPacket {
  acquired?: number | string | null;
  released?: number | string | null;
}

interface PhoneOwnerRow extends RowDataPacket {
  id: number | string;
}

export class WhatsAppInstanceLockBusyError extends Error {
  constructor() {
    super('WhatsApp instance mutation is busy');
    this.name = 'WhatsAppInstanceLockBusyError';
  }
}

export class WhatsAppPhoneOwnershipConflictError extends Error {
  constructor() {
    super('Verified WhatsApp phone transfer required');
    this.name = 'WhatsAppPhoneOwnershipConflictError';
  }
}

export function canonicalWhatsAppPhoneDigits(value: string): string {
  if (typeof value !== 'string' || value.length > 64) {
    throw new Error('Invalid WhatsApp phone number');
  }
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d{7,15}$/.test(digits)) throw new Error('Invalid WhatsApp phone number');
  return digits;
}

function instanceLockName(namespace: string): string {
  return privacyHashExact(`whatsapp-instance-ownership\u0000${namespace}`);
}

export async function acquireWhatsAppInstanceLock(
  connection: PoolConnection,
  namespace: string,
): Promise<string> {
  const name = instanceLockName(namespace);
  const [rows] = await connection.execute<NamedLockRow[]>(
    'SELECT GET_LOCK(?, 5) AS acquired',
    [name],
  );
  if (Number(rows[0]?.acquired) !== 1) throw new WhatsAppInstanceLockBusyError();
  return name;
}

export async function releaseWhatsAppInstanceLocks(
  connection: PoolConnection,
  names: string[],
): Promise<boolean> {
  let releasedAll = true;
  for (const name of [...names].reverse()) {
    try {
      const [rows] = await connection.execute<NamedLockRow[]>(
        'SELECT RELEASE_LOCK(?) AS released',
        [name],
      );
      if (Number(rows[0]?.released) !== 1) releasedAll = false;
    } catch {
      releasedAll = false;
    }
  }
  return releasedAll;
}

/**
 * Must run while the caller holds the shared phone lock. Formatting differences
 * such as +966, 00966, spaces, and dashes resolve to one ownership identity.
 */
export async function assertWhatsAppPhoneAvailable(
  connection: PoolConnection,
  phoneNumber: string,
  excludeInstanceId?: number,
): Promise<void> {
  const digits = canonicalWhatsAppPhoneDigits(phoneNumber);
  const params: Array<string | number> = [digits, `00${digits}`];
  let excludeSql = '';
  if (excludeInstanceId !== undefined) {
    if (!Number.isSafeInteger(excludeInstanceId) || excludeInstanceId < 1) {
      throw new Error('Invalid WhatsApp instance exclusion');
    }
    excludeSql = ' AND id <> ?';
    params.push(excludeInstanceId);
  }
  const [rows] = await connection.execute<PhoneOwnerRow[]>(
    `SELECT id
       FROM whatsapp_instances
      WHERE status = 'active'
        AND phone_number IS NOT NULL
        AND REGEXP_REPLACE(phone_number, '[^0-9]', '') IN (?, ?)${excludeSql}
      LIMIT 1
      FOR UPDATE`,
    params,
  );
  if (rows[0]) throw new WhatsAppPhoneOwnershipConflictError();
}

export function whatsAppMerchantLockNamespace(merchantId: number): string {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1) throw new Error('Invalid merchant ID');
  return `merchant:${merchantId}`;
}

export function whatsAppPhoneLockNamespace(phoneNumber: string): string {
  return `phone:${canonicalWhatsAppPhoneDigits(phoneNumber)}`;
}
