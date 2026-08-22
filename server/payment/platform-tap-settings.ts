import { setTapSettingsTestResultIfCredentialsMatch } from '../db';
import { TapClientError, testTapCredentials } from './tap-client';
import { tapKeyMatchesMode, tapPublicKeyMatchesMode } from './payment-link-policy';

export interface PlatformTapCredentialSnapshot {
  id: number;
  publicKey: string;
  secretKey: string;
  isLive: boolean;
}

export type PlatformTapProbeResult =
  | { outcome: 'verified' }
  | { outcome: 'rejected' }
  | { outcome: 'changed' }
  | { outcome: 'unavailable'; failure: string };

export function toPlatformTapSettingsView<T extends {
  secretKey: string;
  webhookSecret?: string | null;
  publicKey: string;
  isLive: number | boolean;
  lastTestStatus?: 'success' | 'failed' | null;
  lastTestMessage?: string | null;
}>(settings: T) {
  const { secretKey, webhookSecret, lastTestMessage: _lastTestMessage, ...safe } = settings;
  const testMode = !Boolean(settings.isLive);
  const keyModeMatches = tapKeyMatchesMode(secretKey, testMode)
    && tapPublicKeyMatchesMode(settings.publicKey, testMode);
  const credentialsVerified = settings.lastTestStatus === 'success'
    && settings.lastTestMessage === 'verified'
    && keyModeMatches;
  return {
    ...safe,
    lastTestStatus: credentialsVerified ? 'success' as const : settings.lastTestStatus === 'failed' ? 'failed' as const : null,
    lastTestMessage: credentialsVerified ? 'verified' : settings.lastTestStatus === 'failed' ? 'rejected' : null,
    hasSecretKey: Boolean(secretKey.trim()),
    hasWebhookSecret: Boolean(webhookSecret?.trim()),
    credentialsVerified,
  };
}

export async function verifyPlatformTapCredentialsSnapshot(
  snapshot: PlatformTapCredentialSnapshot,
): Promise<PlatformTapProbeResult> {
  try {
    const response = await testTapCredentials(snapshot.secretKey);
    if (response.ok) {
      const applied = await setTapSettingsTestResultIfCredentialsMatch(snapshot.id, snapshot, 'success');
      return { outcome: applied ? 'verified' : 'changed' };
    }
    if (response.status === 401 || response.status === 403) {
      const applied = await setTapSettingsTestResultIfCredentialsMatch(snapshot.id, snapshot, 'failed');
      return { outcome: applied ? 'rejected' : 'changed' };
    }
    return { outcome: 'unavailable', failure: `provider_${response.status}` };
  } catch (error) {
    return {
      outcome: 'unavailable',
      failure: error instanceof TapClientError ? error.failure : 'unknown',
    };
  }
}
