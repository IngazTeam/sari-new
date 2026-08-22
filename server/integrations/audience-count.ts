import { getCustomerProfileCount } from '../db/customer-intelligence';
import { getActiveByaanTraineeCount } from './byaan';

/**
 * Return the audience represented by the active integration.
 * Byaan calls this audience "trainees" and owns it in byaan_trainees;
 * commerce and standalone stores use the canonical customer_profiles table.
 */
export async function getIntegrationAudienceCount(
  merchantId: number,
  integrationSource: string | null | undefined,
): Promise<number> {
  const source = String(integrationSource || '').trim().toLowerCase();
  if (source === 'byaan') {
    return getActiveByaanTraineeCount(merchantId);
  }
  return getCustomerProfileCount(merchantId);
}
