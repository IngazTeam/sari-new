import { describe, expect, it } from 'vitest';
import {
  filterProductsAvailableForSale,
  isProductAvailableForSale,
} from './product-availability';

describe('customer-facing product availability', () => {
  it('blocks inactive, unpublished, closed and depleted inventory', () => {
    expect(isProductAvailableForSale({ isActive: 0, status: 'active', stock: 10, trackInventory: 1 })).toBe(false);
    expect(isProductAvailableForSale({ isActive: 1, status: 'draft', stock: 10, trackInventory: 1 })).toBe(false);
    expect(isProductAvailableForSale({ isActive: 1, status: 'active', stock: 10, trackInventory: 1, registrationOpen: 0 })).toBe(false);
    expect(isProductAvailableForSale({ isActive: 1, status: 'active', stock: 0, trackInventory: 1, productType: 'physical' })).toBe(false);
  });

  it('allows inventory-free and deliberately untracked products', () => {
    expect(isProductAvailableForSale({ isActive: 1, status: 'active', stock: 0, trackInventory: 1, productType: 'digital' })).toBe(true);
    expect(isProductAvailableForSale({ isActive: 1, status: 'active', stock: 0, trackInventory: 0, productType: 'physical' })).toBe(true);
  });

  it('supports provider inventory stored as quantity', () => {
    expect(isProductAvailableForSale({
      isActive: 1,
      isPublished: 1,
      isInStock: 1,
      quantity: 2,
    })).toBe(true);
    expect(isProductAvailableForSale({
      isActive: 1,
      isPublished: 1,
      isInStock: 0,
      quantity: 2,
    })).toBe(false);
  });

  it('preserves catalogue order without margin or scarcity ranking', () => {
    const products = [
      { name: 'الأول', isActive: 1, status: 'active', stock: 20, trackInventory: 1, costPrice: 9000 },
      { name: 'الثاني', isActive: 1, status: 'active', stock: 2, trackInventory: 1, costPrice: 100 },
    ];
    expect(filterProductsAvailableForSale(products).map(product => product.name)).toEqual(['الأول', 'الثاني']);
  });
});
