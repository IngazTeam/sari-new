import { setMerchantPaymentVerifiedIfCredentialsMatch } from '../db';
import { TapClientError, testTapCredentials } from './tap-client';

export type MerchantTapCredentialProbeOutcome = 'verified' | 'rejected' | 'changed' | 'unavailable';

export async function verifyMerchantTapCredentialsSnapshot(
  merchantId: number,
  settings: { tapPublicKey: string; tapSecretKey: string; tapTestMode: number | boolean },
): Promise<{ outcome: MerchantTapCredentialProbeOutcome; failure?: string }> {
  const expected = {
    tapPublicKey: settings.tapPublicKey,
    tapSecretKey: settings.tapSecretKey,
    tapTestMode: Boolean(settings.tapTestMode),
  };

  let response: Awaited<ReturnType<typeof testTapCredentials>>;
  try {
    response = await testTapCredentials(settings.tapSecretKey);
  } catch (error) {
    return {
      outcome: 'unavailable',
      failure: error instanceof TapClientError ? error.failure : 'unknown',
    };
  }

  if (response.ok) {
    const applied = await setMerchantPaymentVerifiedIfCredentialsMatch(merchantId, expected, true);
    return { outcome: applied ? 'verified' : 'changed' };
  }

  if (response.status === 401 || response.status === 403) {
    const applied = await setMerchantPaymentVerifiedIfCredentialsMatch(merchantId, expected, false);
    return { outcome: applied ? 'rejected' : 'changed' };
  }

  return { outcome: 'unavailable', failure: `provider_${response.status}` };
}
