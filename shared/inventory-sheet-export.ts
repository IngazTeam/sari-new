import { z } from "zod";
export const INVENTORY_EXPORT_MAX_ROWS = 5000;
export const inventorySheetExportInput = z
  .object({
    expectedSourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
export const inventoryExportRow = z.tuple([
  z.string().regex(/^[1-9]\d{0,9}$/),
  z.string().min(1).max(255),
  z.string().max(255),
  z.string().max(40),
  z.string().regex(/^\d*$|^$/),
  z.string().datetime(),
]);
export const inventoryExportRows = z
  .array(inventoryExportRow)
  .min(1)
  .max(INVENTORY_EXPORT_MAX_ROWS);
export const inventoryExportReceipt = z
  .object({
    success: z.literal(true),
    merchantId: z.number().int().positive(),
    actorId: z.number().int().positive(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    spreadsheetId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
    sheetId: z.number().int().min(0),
    rows: z.number().int().min(1).max(INVENTORY_EXPORT_MAX_ROWS),
    unknownStock: z.number().int().min(0),
    unverifiedPrice: z.number().int().min(0),
    confirmedAt: z.string().datetime(),
  })
  .strict()
  .refine(v => v.unknownStock <= v.rows && v.unverifiedPrice <= v.rows);
