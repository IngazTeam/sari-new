import { readPlatformInventory } from './platform-workspace';
export interface ExistingPlatform {
  platform: 'salla' | 'zid' | 'woocommerce' | 'shopify' | 'byaan';
  name: string;
  storeUrl?: string;
  connectedAt?: Date | null;
}
const names = {salla:'سلة',zid:'زد',woocommerce:'ووكومرس',shopify:'شوبيفاي',byaan:'بيان'};
/** Configured, paused, failed and pending links reserve their slot. Read errors must block admission. */
export async function checkExistingIntegrations(merchantId: number): Promise<ExistingPlatform[]> {
  const inventory = await readPlatformInventory(merchantId);
  return inventory.platforms.filter(p => p.occupiesSlot).map(p => ({platform:p.platform,name:names[p.platform],storeUrl:p.storeUrl ?? undefined,connectedAt:p.createdAt ? new Date(p.createdAt) : null}));
}
export async function validateNewPlatformConnection(merchantId: number, platformName: string): Promise<void> {
  const existing = await checkExistingIntegrations(merchantId);
  if (existing.length) throw new Error('لديك منصة ' + existing[0].name + ' مربوطة بالفعل. يرجى فصلها أولاً قبل ربط منصة ' + platformName + '.');
}
export async function getCurrentPlatform(merchantId: number): Promise<ExistingPlatform | null> {
  return (await checkExistingIntegrations(merchantId))[0] ?? null;
}
export const getAllConnectedPlatforms = checkExistingIntegrations;
