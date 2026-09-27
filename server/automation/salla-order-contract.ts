import { z } from 'zod';
import { sallaShippingSchema } from '../../shared/salla-order';

const internalId = z.number().int().positive().max(2147483647);
const name = z.string().trim().min(1).max(255);
const quantity = z.number().int().min(1).max(10000);
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(v => v || undefined);
const details = {
  address: optionalText(300), city: optionalText(100),
  isGift: z.boolean().nullish().transform(v => v ?? false),
  giftRecipientName: optionalText(255), giftMessage: optionalText(1000),
};
// Model output cannot supply local/external IDs, prices, authority or an address
// directory ID. A JSON schema request never replaces runtime validation.
export const sallaExtractionSchema = z.object({
  products: z.array(z.object({ name, quantity }).strict()).min(1).max(100), ...details,
  unresolved: z.array(name).max(100),
}).strict();
export const sallaParsedOrderSchema = z.object({
  products: z.array(z.object({ name, quantity, productId: internalId }).strict()).min(1).max(100),
  ...details, shipTo: sallaShippingSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.products.map(p => p.productId)).size !== value.products.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate product selection' });
  if (value.isGift ? !value.giftRecipientName : !!(value.giftRecipientName || value.giftMessage))
    ctx.addIssue({ code: 'custom', message: 'Gift details require clarification' });
});
export type ParsedSallaOrder = z.infer<typeof sallaParsedOrderSchema>;
export type SallaOrderSelectionInput = z.input<typeof sallaParsedOrderSchema>;
export const sallaExtractionProductSchema = z.object({
  productId: internalId, name, price: z.number().int().nonnegative().max(2147483647),
  stock: z.number().int().nonnegative().max(2147483647),
  trackInventory: z.union([z.literal(0), z.literal(1)]), revision: internalId,
}).strict();
export type SallaExtractionProduct = z.infer<typeof sallaExtractionProductSchema>;
export const normalizeSallaSelectionName = (value: string) => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

/** No fuzzy substitution, partial carts or identifiers chosen by the model. */
export function matchSallaExtraction(content: unknown, catalog: SallaExtractionProduct[]): ParsedSallaOrder {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 64000) throw Error('Invalid extraction size');
  const parsed = sallaExtractionSchema.parse(JSON.parse(content, (key, value) => {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Unsafe extraction key');
    return value;
  }));
  if (parsed.unresolved.length) throw Error('Incomplete product selection');
  const { unresolved: _unresolved, ...selection } = parsed;
  const products = z.array(sallaExtractionProductSchema).min(1).max(500).parse(catalog);
  if (new Set(products.map(p => p.productId)).size !== products.length) throw Error('Duplicate catalogue identity');
  return sallaParsedOrderSchema.parse({ ...selection, products: parsed.products.map(item => {
    const matches = products.filter(p => normalizeSallaSelectionName(p.name) === normalizeSallaSelectionName(item.name));
    if (matches.length !== 1 || matches[0].trackInventory === 1 && item.quantity > matches[0].stock)
      throw Error('Product requires clarification');
    return { name: matches[0].name, quantity: item.quantity, productId: matches[0].productId };
  }) });
}
