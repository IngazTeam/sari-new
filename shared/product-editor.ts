import { z } from "zod";
import { majorToMinor } from "./product-money";

const id = z.number().int().positive().max(2147483647);
const money = z
  .string()
  .trim()
  .max(32)
  .refine(value => {
    try {
      majorToMinor(value);
      return true;
    } catch {
      return false;
    }
  }, "Invalid price");
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    );
const url = z
  .string()
  .max(500)
  .refine(value => {
    if (!value) return true;
    try {
      return ["https:", "http:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  });
export const productEditableFields = z
  .object({
    name: text(255).refine(value => value.trim().length > 0),
    description: text(16000).nullable(),
    price: money,
    currency: z.enum(["SAR", "USD"]),
    imageUrl: url.nullable(),
    stock: z.number().int().min(0).max(2147483647).nullable(),
    sku: text(100).nullable(),
    barcode: text(100).nullable(),
    compareAtPrice: money.nullable(),
    costPrice: money.nullable(),
    weight: text(20).nullable(),
    category: text(100).nullable(),
    categoryId: id.nullable(),
    tags: text(500).nullable(),
    productType: z.enum(["physical", "digital", "service"]),
    status: z.enum(["active", "draft", "archived"]),
    lowStockAlert: z.number().int().min(0).max(99999).nullable(),
    trackInventory: z.union([z.literal(0), z.literal(1)]),
  })
  .strict();
const patch = productEditableFields
  .partial()
  .refine(value =>
    Object.keys(value).some(
      key => value[key as keyof typeof value] !== undefined
    )
  );
const expectedDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const productEditorReadInput = z.object({ id }).strict();
export const productEditorReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const productEditorWrite = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("create"),
      requestId: z.string().uuid(),
      fields: productEditableFields,
    })
    .strict(),
  z
    .object({
      kind: z.literal("update"),
      requestId: z.string().uuid(),
      id,
      expectedDigest,
      fields: patch,
    })
    .strict(),
]);
export const productEditorReceipt = z
  .object({
    merchantId: id,
    actorId: id,
    requestId: z.string().uuid(),
    kind: z.enum(["create", "update"]),
    productId: id,
    digest: expectedDigest,
    createdAt: z.string().datetime(),
  })
  .strict();
export type ProductEditorWrite = z.infer<typeof productEditorWrite>;
export type ProductEditorReceipt = z.infer<typeof productEditorReceipt>;
