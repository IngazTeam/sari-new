import { z } from "zod";
const id = z.number().int().positive().safe();
export const templateDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const templateFields = z
  .object({
    name: z.string().trim().min(1).max(255),
    headerImageUrl: z
      .string()
      .trim()
      .max(500)
      .url()
      .refine(value => {
        try {
          const url = new URL(value);
          return (
            ["https:", "http:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          );
        } catch {
          return false;
        }
      }, "Use an HTTP(S) address without credentials")
      .nullable(),
    footerText: z.string().max(5000).nullable(),
    termsText: z.string().max(5000).nullable(),
    isDefault: z.boolean(),
  })
  .strict();
export type TemplateFields = z.infer<typeof templateFields>;
export const templateWriteInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      requestId: z.string().uuid(),
      fields: templateFields,
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      requestId: z.string().uuid(),
      id,
      expectedDigest: templateDigest,
      fields: templateFields,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      requestId: z.string().uuid(),
      id,
      expectedDigest: templateDigest,
    })
    .strict(),
]);
export type TemplateWriteInput = z.infer<typeof templateWriteInput>;
export const templateListInput = z
  .object({
    page: z.number().int().min(1).max(100000).default(1),
    search: z.string().trim().max(100).default(""),
  })
  .strict();
export const templateReadInput = z.object({ id }).strict();
export const templateReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const templateReceipt = z
  .object({
    version: z.literal("quotation-template-receipt.v1"),
    merchantId: id,
    actorId: id,
    requestId: z.string().uuid(),
    action: z.enum(["create", "update", "delete"]),
    recordId: id,
    digest: templateDigest.nullable(),
    committedAt: z.string().datetime(),
  })
  .strict();
export type TemplateReceipt = z.infer<typeof templateReceipt>;
export type TemplateRecord = TemplateFields & {
  id: number;
  merchantId: number;
  digest: string;
  createdAt: string;
  truncated: boolean;
  editable: boolean;
};
export type TemplateWorkspace = {
  merchantId: number;
  selection: { page: number; search: string };
  page: number;
  pageSize: 20;
  total: number;
  filtered: number;
  pages: number;
  items: TemplateRecord[];
  limit: 20;
  canManage: boolean;
};
