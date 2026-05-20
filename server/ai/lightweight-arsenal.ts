/**
 * Lightweight Arsenal — Fast Path Sales Data
 * 
 * Provides essential sales data (discounts, loyalty, abandoned cart)
 * for messages 2-20 without the full loadArsenal() overhead.
 * 
 * Loaded from DB with a 5-minute TTL cache per merchant+customer.
 * This replaces the `emptyArsenal` that was stripping all sales
 * intelligence from the FAST PATH.
 */

import {
  getAbandonedCartsByMerchantId,
  getDiscountCodesByMerchantId,
} from '../db';
import type { SalesArsenal } from './sales-arsenal';

// ═══════════════════════════════════════════════════════════════
// Cache — 5 minute TTL per merchant:customer
// ═══════════════════════════════════════════════════════════════

interface CachedLightArsenal {
  arsenal: SalesArsenal;
  cachedAt: number;
}

const LIGHT_ARSENAL_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;
const lightArsenalCache = new Map<string, CachedLightArsenal>();

function cacheKey(merchantId: number, customerPhone: string): string {
  return `${merchantId}:${customerPhone}`;
}

// Periodic cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(lightArsenalCache.entries());
  for (const [key, entry] of entries) {
    if (now - entry.cachedAt > LIGHT_ARSENAL_TTL_MS * 2) {
      lightArsenalCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Load lightweight sales data for FAST PATH.
 * Only fetches: discounts, abandoned cart, loyalty.
 * Cached for 5 minutes to avoid DB calls every message.
 * 
 * Falls back to empty arsenal on any failure (never blocks the response).
 */
export async function loadLightweightArsenal(
  merchantId: number,
  customerPhone: string,
): Promise<SalesArsenal> {
  const key = cacheKey(merchantId, customerPhone);

  // Check cache first
  const cached = lightArsenalCache.get(key);
  if (cached && (Date.now() - cached.cachedAt) < LIGHT_ARSENAL_TTL_MS) {
    return cached.arsenal;
  }

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
    arsenal.activeDiscounts = discounts
      .filter((d: any) => d.isActive && (!d.maxUses || d.usedCount < d.maxUses))
      .slice(0, 5)
      .map((d: any) => ({
        code: d.code,
        type: d.discountType || 'percentage',
        value: d.discountValue || d.discountPercentage || 0,
        expiresAt: d.expiresAt?.toISOString?.() || d.expiresAt,
      }));
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
        if (tier) {
          arsenal.loyaltyTier = {
            name: tier.nameAr || tier.name,
            icon: tier.icon || '⭐',
            discount: tier.discountPercentage || 0,
          };
        }
      }
    }
  } catch { /* loyalty may not be set up */ }

  // Evict oldest if cache is full
  if (lightArsenalCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = lightArsenalCache.keys().next().value;
    if (oldestKey) lightArsenalCache.delete(oldestKey);
  }

  // Cache the result
  lightArsenalCache.set(key, { arsenal, cachedAt: Date.now() });

  return arsenal;
}

/**
 * Invalidate cache for a specific customer (e.g., after purchase).
 */
export function invalidateLightArsenal(merchantId: number, customerPhone: string): void {
  lightArsenalCache.delete(cacheKey(merchantId, customerPhone));
}
