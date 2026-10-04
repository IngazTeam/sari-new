import { z } from "zod";

export const workspaceCurrency = z.enum(["SAR", "USD"]);
export const currencyWorkspace = z
  .object({
    actorId: z.number().int().positive().max(2147483647),
    merchantId: z.number().int().positive().max(2147483647),
    canManage: z.boolean(),
    currency: workspaceCurrency.nullable(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    convertsAmounts: z.literal(false),
  })
  .strict();
export const currencySave = z
  .object({
    currency: workspaceCurrency,
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const currencySaveResult = z
  .object({
    changed: z.boolean(),
    workspace: currencyWorkspace,
  })
  .strict();
export type CurrencyWorkspace = z.infer<typeof currencyWorkspace>;
