import crypto from 'node:crypto';

function privacyKey(): string {
  const key = process.env.PRIVACY_HASH_KEY?.trim() || process.env.JWT_SECRET?.trim();
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PRIVACY_HASH_KEY or JWT_SECRET with at least 32 characters is required');
    }
    return 'sari-development-privacy-hash-key-not-for-production';
  }
  return key;
}

export function privacyHash(value: string): string {
  return crypto
    .createHmac('sha256', privacyKey())
    .update(value.trim().toLowerCase(), 'utf8')
    .digest('hex');
}
