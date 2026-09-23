/** Fast-path sales context: fresh offers, cart and loyalty scoped to the current customer. */

import {
  getAbandonedCartsByMerchantId,
  getDiscountCodesByMerchantId,
} from '../db';
import type { SalesArsenal } from './sales-arsenal';
import { selectSalesDiscounts } from './sales-offer-evidence';

/** Fresh customer-specific facts on every turn. Mutable offers and loyalty are never session authority. */
export async function loadLightweightArsenal(
  merchantId: number,
  customerPhone: string,
): Promise<SalesArsenal> {
  // Build lightweight arsenal from DB
  const arsenal: SalesArsenal = {
    activeDiscounts: [],
    loyaltyPoints: 0,
    loyaltyTier: null,
    availableRewards: [],
    abandonedCart: null,
    bestSellers: [],       // Not loaded in light mode — comes from session
    totalProducts: 0,      // Not loaded in light mode
    crossSellSuggestions: [],
    upcomingBookings: [],
    availableServices: [],
  };

  try {
    // 1. Active discount codes (most critical for sales)
    const discounts = await getDiscountCodesByMerchantId(merchantId);
    arsenal.activeDiscounts = selectSalesDiscounts(discounts, { merchantId, customerPhone });
  } catch { /* discounts table may not exist */ }

  try {
    // 2. Abandoned cart for this customer
    const carts = await getAbandonedCartsByMerchantId(merchantId);
    const customerCart = carts.find((c: any) =>
      c.customerPhone === customerPhone && !c.recovered && !c.reminderSent
    );
    if (customerCart) {
      let items: string[] = [];
      try { items = JSON.parse(customerCart.items || '[]').map((i: any) => i.name || i); } catch { items = []; }
      arsenal.abandonedCart = {
        items,
        total: Number(customerCart.totalAmount || 0),
      };
    }
  } catch { /* silent */ }

  try {
    // 3. Loyalty points (lightweight — points and tier only)
    const loyaltyDb = await import('../db_loyalty');
    const customerPoints = await loyaltyDb.getCustomerPoints(merchantId, customerPhone);
    if (customerPoints) {
      arsenal.loyaltyPoints = customerPoints.totalPoints || 0;
      if (customerPoints.currentTierId) {
        const tier = await loyaltyDb.getLoyaltyTierById(customerPoints.currentTierId);
        if (tier && tier.merchantId === merchantId) {
          arsenal.loyaltyTier = {
            name: tier.nameAr || tier.name,
            icon: tier.icon || '⭐',
            discount: tier.discountPercentage || 0,
          };
        }
      }
    }
  } catch { /* loyalty may not be set up */ }

  return arsenal;
}

/**
 * Invalidate cache for a specific customer (e.g., after purchase).
 */
export function invalidateLightArsenal(merchantId: number, customerPhone: string): void {
  // Compatibility hook: reads are already fresh; no customer facts are cached.
}
