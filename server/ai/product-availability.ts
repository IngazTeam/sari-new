export type ProductAvailabilityInput = {
  isActive?: unknown;
  status?: unknown;
  stock?: unknown;
  quantity?: unknown;
  trackInventory?: unknown;
  productType?: unknown;
  registrationOpen?: unknown;
  isInStock?: unknown;
  isPublished?: unknown;
};

function isFalseFlag(value: unknown): boolean {
  return value === false || value === 0 || value === '0';
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Customer-facing availability gate. It deliberately preserves catalogue order
 * and does not use cost, margin or scarcity as a ranking signal.
 */
export function isProductAvailableForSale(product: ProductAvailabilityInput | null | undefined): boolean {
  if (!product) return false;
  if (isFalseFlag(product.isActive) || isFalseFlag(product.isPublished)) return false;

  const status = normalized(product.status);
  if (status && status !== 'active' && status !== 'published') return false;
  if (isFalseFlag(product.registrationOpen) || isFalseFlag(product.isInStock)) return false;

  const productType = normalized(product.productType);
  const inventoryFree = productType === 'digital' || productType === 'service';
  const tracksInventory = !isFalseFlag(product.trackInventory);
  if (!inventoryFree && tracksInventory) {
    const stock = Number(product.stock ?? product.quantity);
    if (!Number.isFinite(stock) || stock <= 0) return false;
  }

  return true;
}

export function filterProductsAvailableForSale<T extends ProductAvailabilityInput>(products: readonly T[]): T[] {
  return products.filter(isProductAvailableForSale);
}
