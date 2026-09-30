import { z } from "zod";
const id = z.number().int().positive().max(2147483647);
const count = z.number().int().nonnegative().safe();
export const productStockInput = z
  .object({
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
    search: z
      .string()
      .max(200)
      .transform(value => value.trim())
      .default(""),
    kind: z.enum(["all", "product", "variant"]).default("all"),
    state: z.enum(["all", "out", "low", "unknown"]).default("all"),
  })
  .strict()
  .prefault({});
export type ProductStockSelection = z.infer<typeof productStockInput>;
export const productStockRow = z
  .object({
    merchantId: id,
    productId: id,
    variantId: id.nullable(),
    kind: z.enum(["product", "variant"]),
    productName: z.string().max(65535),
    name: z.string().max(65535),
    sku: z.string().max(65535).nullable(),
    stock: z.number().int().safe().nullable(),
    threshold: z.number().int().safe().nullable(),
    state: z.enum(["out", "low", "unknown"]),
    issue: z
      .enum(["stock_unknown", "no_available_variants", "invalid_variant_setup"])
      .nullable(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if ((row.kind === "variant") !== (row.variantId !== null))
      ctx.addIssue({ code: "custom", message: "Stock target mismatch" });
    const expected = row.issue
      ? "unknown"
      : row.stock === 0
        ? "out"
        : row.stock !== null &&
            row.stock > 0 &&
            row.threshold !== null &&
            row.threshold >= row.stock
          ? "low"
          : null;
    if (
      expected !== row.state ||
      (row.issue === "stock_unknown" && row.stock !== null && row.stock >= 0)
    )
      ctx.addIssue({ code: "custom", message: "Stock state mismatch" });
    if (
      row.issue &&
      row.issue !== "stock_unknown" &&
      (row.kind !== "product" || row.stock !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Variant setup target mismatch",
      });
  });
export const productStockSnapshot = z
  .object({
    merchantId: id,
    readAt: z.string().datetime(),
    selection: productStockInput,
    items: z.array(productStockRow).max(100),
    total: count,
    totalPages: count,
    summary: z
      .object({ out: count, low: count, unknown: count, total: count })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.items.some(row => row.merchantId !== value.merchantId) ||
      value.items.some(
        row =>
          (value.selection.kind !== "all" &&
            row.kind !== value.selection.kind) ||
          (value.selection.state !== "all" &&
            row.state !== value.selection.state)
      ) ||
      new Set(value.items.map(row => `${row.productId}:${row.variantId ?? 0}`))
        .size !== value.items.length ||
      value.total > value.summary.total ||
      value.items.length !==
        Math.min(
          value.selection.pageSize,
          Math.max(
            0,
            value.total - (value.selection.page - 1) * value.selection.pageSize
          )
        ) ||
      value.items.length > value.selection.pageSize ||
      value.totalPages !== Math.ceil(value.total / value.selection.pageSize) ||
      value.summary.total !==
        value.summary.out + value.summary.low + value.summary.unknown
    )
      ctx.addIssue({ code: "custom", message: "Stock snapshot mismatch" });
  });
export type ProductStockSnapshot = z.infer<typeof productStockSnapshot>;
