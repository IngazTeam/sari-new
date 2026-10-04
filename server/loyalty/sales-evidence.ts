import {calculateCustomerTier, getCustomerPoints, getLoyaltyRewards, getLoyaltySettings} from '../db_loyalty';
import { withLoyaltyTransaction } from './transaction';
import { rewardAvailable } from '../../shared/loyalty-input';
export { rewardAvailable } from '../../shared/loyalty-input';
export async function loadLoyaltySalesEvidence(
  merchantId: number,
  customerPhone: string
) {
  return withLoyaltyTransaction(merchantId, async () => {
    const empty = {
      loyaltyPoints: 0,
      loyaltyTier: null as {
        name: string;
        icon: string;
        discount: number;
      } | null,
      availableRewards: [] as { name: string; pointsCost: number }[],
    };
    const settings = await getLoyaltySettings(merchantId);
    if (settings?.isEnabled !== 1) return empty;
    const customer = await getCustomerPoints(merchantId, customerPhone);
    if (
      !customer ||
      !Number.isSafeInteger(customer.totalPoints) ||
      customer.totalPoints < 0
    )
      return empty;
    // Re-evaluate thresholds against earned points; stored tier IDs can predate a tier edit.
    const tier = await calculateCustomerTier(
      merchantId,
      customer.lifetimePoints
    );
    return {
      loyaltyPoints: customer.totalPoints,
      loyaltyTier:
        tier && tier.discountPercentage >= 0 && tier.discountPercentage <= 100
          ? {
              name: tier.nameAr || tier.name,
              icon: tier.icon,
              discount: tier.discountPercentage,
            }
          : null,
      availableRewards: (await getLoyaltyRewards(merchantId, true))
        .filter(r => rewardAvailable(r))
        .slice(0, 5)
        .map(r => ({ name: r.titleAr || r.title, pointsCost: r.pointsCost })),
    };
  });
}
