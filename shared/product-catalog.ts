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
