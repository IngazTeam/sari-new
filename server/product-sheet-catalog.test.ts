import { describe, expect, it } from "vitest";
import { productSheetCurrentFields } from "./product-sheet-catalog";
const product = {
  name: "Tea",
  description: "Keep",
  price: 1234,
  priceUnit: "minor",
  currency: "SAR",
  imageUrl: null,
  stock: null,
  sku: "T1",
  barcode: null,
  compareAtPrice: 0,
  costPrice: 500,
  weight: null,
  category: null,
  categoryId: null,
  tags: null,
  productType: "physical",
  status: "active",
  lowStockAlert: 0,
  trackInventory: 1,
};
describe("Sheets existing catalog fields", () => {
  it("converts verified minor money exactly while preserving null and zero", () => {
    expect(productSheetCurrentFields(product)).toMatchObject({
      price: "12.34",
      compareAtPrice: "0.00",
      costPrice: "5.00",
      stock: null,
      lowStockAlert: 0,
    });
  });
  it.each([
    { priceUnit: "unverified" },
    { price: 12.34 },
    { price: -1 },
    { price: null },
    { currency: "EUR" },
    { costPrice: -10 },
    { compareAtPrice: 2.5 },
    { status: null },
    { productType: null },
    { imageUrl: "javascript:alert(1)" },
  ])("blocks malformed or unknown current values %j", patch => {
    expect(productSheetCurrentFields({ ...product, ...patch })).toBeNull();
  });
  it("formats the maximum supported price without precision loss", () => {
    expect(
      productSheetCurrentFields({ ...product, price: 2147483647 })?.price
    ).toBe("21474836.47");
  });
  it("does not leak non-editable fields or mutate input", () => {
    const input = {
      ...product,
      merchantId: 15,
      id: 12,
      nameAr: "اسم",
      hasVariants: 1,
    };
    const saved = JSON.stringify(input);
    const fields = productSheetCurrentFields(input);
    expect(fields).not.toHaveProperty("merchantId");
    expect(fields).not.toHaveProperty("hasVariants");
    expect(JSON.stringify(input)).toBe(saved);
  });
});
