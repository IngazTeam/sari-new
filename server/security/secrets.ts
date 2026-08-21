import crypto from 'node:crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getEncryptionKey(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FIELD_ENCRYPTION_KEY is required in production');
    }
    return null;
  }

  if (raw.length < 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must contain at least 32 characters');
  }

  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(ENCRYPTED_PREFIX));
}

/**
 * Encrypt an integration credential using AES-256-GCM.
 * Existing encrypted values are returned unchanged, making updates idempotent.
 * Development without a key keeps plaintext compatibility; production fails closed.
 */
export function encryptSecret<T extends string | null | undefined>(value: T): T {
  if (!value || isEncryptedSecret(value)) return value;

  const key = getEncryptionKey();
  if (!key) return value;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, ciphertext]).toString('base64url');
  return `${ENCRYPTED_PREFIX}${payload}` as T;
}

/**
 * Decrypt a credential. Legacy plaintext is accepted to support a controlled,
 * rolling data migration; all new production writes are encrypted.
 */
export function decryptSecret<T extends string | null | undefined>(value: T): T {
  if (!value || !isEncryptedSecret(value)) return value;

  const key = getEncryptionKey();
  if (!key) {
    throw new Error('FIELD_ENCRYPTION_KEY is required to decrypt stored credentials');
  }

  try {
    const encodedPayload = value.slice(ENCRYPTED_PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/.test(encodedPayload)) {
      throw new Error('invalid payload encoding');
    }

    const payload = Buffer.from(encodedPayload, 'base64url');
    // Node's decoder accepts non-canonical trailing pad bits. Reject alternate
    // textual representations so any mutation of a stored credential fails.
    if (payload.toString('base64url') !== encodedPayload) {
      throw new Error('non-canonical payload encoding');
    }
    if (payload.length <= IV_BYTES + TAG_BYTES) throw new Error('invalid payload length');

    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8') as T;
  } catch {
    throw new Error('Unable to decrypt stored credential');
  }
}

export function maskCredential(value: string | null | undefined): string | null {
  if (!value) return null;
  const plaintext = decryptSecret(value);
  if (!plaintext) return null;
  if (plaintext.length <= 8) return '********';
  return `${plaintext.slice(0, 4)}****${plaintext.slice(-4)}`;
}

type PublicPaymentGateway<T> = T extends Record<string, any>
  ? Omit<T, 'secretKey' | 'webhookSecret'> & {
      hasSecretKey: boolean;
      hasWebhookSecret: boolean;
    }
  : T;

export function toPublicPaymentGateway<T extends Record<string, any> | null | undefined>(gateway: T): PublicPaymentGateway<T> {
  if (!gateway) return gateway as PublicPaymentGateway<T>;
  const { secretKey: _secretKey, webhookSecret: _webhookSecret, ...safe } = gateway;
  return {
    ...safe,
    hasSecretKey: Boolean(_secretKey),
    hasWebhookSecret: Boolean(_webhookSecret),
  } as PublicPaymentGateway<T>;
}
