import { z } from "zod";
import type { ProductWorkspaceRow } from "@shared/product-catalog";
import { productEditorWrite } from "@shared/product-editor";
import { majorToMinor } from "@shared/product-money";

export const productFormSchema = z
  .object({
    name: z.string().max(255),
    description: z.string().max(65535),
    price: z.string().max(32),
    currency: z.string().max(3),
    imageUrl: z.string().max(500),
    stock: z.string().max(20),
    sku: z.string().max(100),
    barcode: z.string().max(100),
    compareAtPrice: z.string().max(32),
    costPrice: z.string().max(32),
    weight: z.string().max(20),
    category: z.string().max(100),
    // Default keeps drafts written before linked category selection readable.
    categoryId: z.string().max(12).default(""),
    tags: z.string().max(65535),
    productType: z.string().max(20),
    status: z.string().max(20),
    lowStockAlert: z.string().max(20),
    trackInventory: z.string().max(5),
  })
  .strict();
export type ProductForm = z.infer<typeof productFormSchema>;
export type ProductField = keyof ProductForm;
export const productFields = Object.keys(
  productFormSchema.shape
) as ProductField[];
export function newProductForm(currency: "SAR" | "USD"): ProductForm {
  return {
    name: "",
    description: "",
    price: "",
    currency,
    imageUrl: "",
    stock: "0",
    sku: "",
    barcode: "",
    compareAtPrice: "",
    costPrice: "",
    weight: "",
    category: "",
    categoryId: "",
    tags: "",
    productType: "physical",
    status: "active",
    lowStockAlert: "5",
    trackInventory: "1",
  };
}
export function productToForm(row: ProductWorkspaceRow): ProductForm {
  const money = (value: number | null) =>
    row.priceUnit === "minor" && value !== null && value >= 0
      ? (value / 100).toFixed(2)
      : "";
  return {
    name: row.name,
    description: row.description ?? "",
    price: money(row.price),
    currency: row.currency,
    imageUrl: row.imageUrl ?? "",
    stock: row.stock === null ? "" : String(row.stock),
    sku: row.sku ?? "",
    barcode: row.barcode ?? "",
    compareAtPrice: money(row.compareAtPrice),
    costPrice: money(row.costPrice),
    weight: row.weight ?? "",
    category: row.category ?? "",
    categoryId: row.categoryId?.toString() ?? "",
    tags: row.tags ?? "",
    productType: row.productType ?? "",
    status: row.status,
    lowStockAlert: row.lowStockAlert === null ? "" : String(row.lowStockAlert),
    trackInventory: String(row.trackInventory),
  };
}
export const productFormChanged = (form: ProductForm, base: ProductForm) =>
  productFields.filter(key => form[key] !== base[key]);
function fields(form: ProductForm) {
  const numeric = (value: string) =>
    value === "" ? null : /^\d+$/.test(value) ? Number(value) : NaN;
  return {
    ...form,
    description: form.description || null,
    imageUrl: form.imageUrl || null,
    stock: numeric(form.stock),
    sku: form.sku || null,
    barcode: form.barcode || null,
    compareAtPrice: form.compareAtPrice || null,
    costPrice: form.costPrice || null,
    weight: form.weight || null,
    category: form.category || null,
    categoryId: numeric(form.categoryId),
    tags: form.tags || null,
    lowStockAlert: numeric(form.lowStockAlert),
    trackInventory: numeric(form.trackInventory),
  };
}
export function productFormRequest(
  target: number | "new",
  form: ProductForm,
  base: ProductForm,
  digest: string | null,
  requestId: string
) {
  const all = fields(form);
  const raw =
    target === "new"
      ? { kind: "create", requestId, fields: all }
      : {
          kind: "update",
          requestId,
          id: target,
          expectedDigest: digest,
          fields: Object.fromEntries(
            productFormChanged(form, base).map(key => [key, all[key]])
          ),
        };
  return productEditorWrite.safeParse(raw);
}
export function productPricePreview(form: ProductForm) {
  try {
    const price = majorToMinor(form.price),
      cost = form.costPrice ? majorToMinor(form.costPrice) : null,
      comparison = form.compareAtPrice
        ? majorToMinor(form.compareAtPrice)
        : null;
    return {
      margin:
        cost !== null && price > 0 ? ((price - cost) / price) * 100 : null,
      discount:
        comparison !== null && comparison > 0 && comparison >= price
          ? ((comparison - price) / comparison) * 100
          : null,
    };
  } catch {
    return { margin: null, discount: null };
  }
}
