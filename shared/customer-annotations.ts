import { z } from "zod";
import { customerKeyInput } from "./customer-workspace";
const count = z.number().int().nonnegative().safe();
const tag = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine(v => !/[\u0000-\u001f\u007f]/.test(v));
export const customerTags = z
  .array(tag)
  .max(20)
  .refine(v => new Set(v).size === v.length);
export const customerAnnotationsInput = z
  .object({
    key: customerKeyInput,
    page: z.number().int().min(1).max(1000000).default(1),
  })
  .strict();
const base = { key: customerKeyInput, requestId: z.string().uuid() };
export const customerAnnotationWrite = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("note"),
      content: z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("tags"),
      tags: customerTags,
      expectedRevision: count,
    })
    .strict(),
]);
export const customerAnnotationReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const customerAnnotationReceipt = z
  .object({
    merchantId: z.number().int().positive().safe(),
    actorId: z.number().int().positive().safe(),
    requestId: z.string().uuid(),
    key: customerKeyInput,
    kind: z.enum(["note", "tags"]),
    noteId: z.number().int().positive().safe().nullable(),
    tags: customerTags.nullable(),
    revision: count.nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const customerAnnotationsSchema = z
  .object({
    merchantId: z.number().int().positive().safe(),
    key: customerKeyInput,
    selection: customerAnnotationsInput,
    canManage: z.boolean(),
    revision: count,
    tags: customerTags,
    pagination: z
      .object({
        page: count,
        pageSize: z.literal(25),
        total: count,
        pages: count,
      })
      .strict(),
    notes: z
      .array(
        z
          .object({
            id: z.number().int().positive().safe(),
            actorId: z.number().int().positive().safe(),
            content: z.string().min(1).max(2000),
            createdAt: z.string().datetime(),
          })
          .strict()
      )
      .max(25),
  })
  .strict();
export type CustomerAnnotationWrite = z.infer<typeof customerAnnotationWrite>;
export type CustomerAnnotationReceipt = z.infer<
  typeof customerAnnotationReceipt
>;
