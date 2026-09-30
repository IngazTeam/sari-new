import { z } from "zod";

export const productCatalogInput = z
  .object({
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
    search: z
      .string()
      .max(200)
      .transform(value => value.trim())
      .default(""),
    status: z.enum(["all", "active", "draft", "archived"]).default("all"),
    inventory: z
      .enum(["all", "out", "low", "untracked", "unknown"])
      .default("all"),
    price: z.enum(["all", "verified", "review"]).default("all"),
  })
  .strict()
  .prefault({});

export type ProductCatalogSelection = z.infer<typeof productCatalogInput>;

const integer = z.number().int().safe();
export const productWorkspaceRow = z
  .object({
    id: integer.positive(),
    merchantId: integer.positive(),
    name: z.string(),
    description: z.string().nullable(),
    price: integer,
    priceUnit: z.enum(["minor", "unverified"]),
    currency: z.enum(["SAR", "USD"]),
    imageUrl: z.string().nullable(),
    stock: integer.nullable(),
    sku: z.string().nullable(),
    barcode: z.string().nullable(),
    compareAtPrice: integer.nullable(),
    costPrice: integer.nullable(),
    weight: z.string().nullable(),
    category: z.string().nullable(),
    categoryId: integer.nullable(),
    tags: z.string().nullable(),
    productType: z.enum(["physical", "digital", "service"]).nullable(),
    status: z.enum(["active", "draft", "archived"]),
    lowStockAlert: integer.nullable(),
    trackInventory: integer,
    isActive: integer,
    hasVariants: integer,
    sallaProductId: z.string().nullable(),
  })
  .passthrough();
export const productCatalogSchema = z.object({
  merchantId: integer.positive(),
  readAt: z.string().datetime(),
  selection: productCatalogInput,
  currency: z.enum(["SAR", "USD"]),
  integrationSource: z.string().nullable(),
  canManage: z.boolean(),
  items: z.array(productWorkspaceRow).max(100),
  total: integer.nonnegative(),
  page: integer.positive(),
  pageSize: integer.positive().max(100),
  totalPages: integer.nonnegative(),
  summary: z.object({
    all: integer.nonnegative(),
    out: integer.nonnegative(),
    low: integer.nonnegative(),
    untracked: integer.nonnegative(),
    unknown: integer.nonnegative(),
    priceReview: integer.nonnegative(),
  }),
});
export const productEditorReadSchema = z.object({
  merchantId: integer.positive(),
  selection: z.object({ id: integer.positive() }),
  product: productWorkspaceRow,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  external: z.boolean(),
  canManage: z.boolean(),
  integrationSource: z.string().nullable(),
  locked: z.boolean(),
});
export type ProductWorkspaceRow = z.infer<typeof productWorkspaceRow>;

/** Missing or malformed inventory is never presented as unlimited stock. */
export function productInventoryState(product: {
  trackInventory: number;
  stock: number | null;
  lowStockAlert: number | null;
}): "untracked" | "unknown" | "out" | "low" | "available" {
  if (product.trackInventory === 0) return "untracked";
  if (
    product.trackInventory !== 1 ||
    product.stock === null ||
    !Number.isSafeInteger(product.stock) ||
    product.stock < 0
  )
    return "unknown";
  if (product.stock === 0) return "out";
  if (
    product.lowStockAlert !== null &&
    Number.isSafeInteger(product.lowStockAlert) &&
    product.lowStockAlert >= 0 &&
    product.stock <= product.lowStockAlert
  )
    return "low";
  return "available";
}
