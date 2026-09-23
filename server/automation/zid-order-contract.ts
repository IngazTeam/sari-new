import { z } from 'zod';
import { filterProductsAvailableForSale } from '../ai/product-availability';

export const zidSelectionSchema = z.object({
  products: z.array(z.object({ name: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1).max(10000), sku: z.string().trim().min(1).max(255).nullish().transform(v => v ?? undefined),
    zidProductId: z.string().trim().min(1).max(255).optional(),
  }).strict()).min(1).max(10),
  address: z.object({ line1: z.string().trim().min(3).max(500), line2: z.string().trim().max(500).nullish().transform(v => v ?? undefined),
    city: z.string().trim().min(2).max(100), countryCode: z.string().regex(/^[A-Z]{2}$/),
  }).strict().nullish().transform(v => v ?? undefined),
  customerName: z.string().trim().min(1).max(255).nullish().transform(v => v ?? undefined),
  shippingMethodName: z.string().trim().min(1).max(255).nullish().transform(v => v ?? undefined),
  isGift: z.boolean().nullish().transform(v => v ?? undefined),
  giftRecipientName: z.string().max(255).nullish().transform(v => v ?? undefined),
  giftMessage: z.string().max(1000).nullish().transform(v => v ?? undefined),
}).strict();
export type ParsedZidOrder = z.infer<typeof zidSelectionSchema>;
type CatalogProduct = { zidProductId: string; zidSku: string | null; nameAr: string | null; nameEn: string | null;
  quantity: number; isActive: number; isPublished: number; isInStock: number };
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

/** No substring/empty-name fallback or partial carts at this money boundary. */
export function matchZidSelection(raw: unknown, catalog: CatalogProduct[]): ParsedZidOrder {
  const parsed = zidSelectionSchema.parse(raw);
  const available = filterProductsAvailableForSale(catalog);
  const seen = new Set<string>();
  const products = parsed.products.map(item => {
    const matches = available.filter(p => item.sku ? (p.zidSku === item.sku || p.zidProductId === item.sku)
      : item.zidProductId ? p.zidProductId === item.zidProductId
        : [p.nameAr, p.nameEn].some(name => !!name?.trim() && normalize(name) === normalize(item.name)));
    if (matches.length !== 1 || !matches[0].zidSku || item.quantity > matches[0].quantity) throw new Error('Zid product requires clarification');
    const product = matches[0];
    if (item.zidProductId && product.zidProductId !== item.zidProductId) throw new Error('Zid product identity conflict');
    if (seen.has(product.zidProductId)) throw new Error('Duplicate Zid item');
    seen.add(product.zidProductId);
    return { name: product.nameAr || product.nameEn || item.name, quantity: item.quantity, sku: product.zidSku!, zidProductId: product.zidProductId };
  });
  return { ...parsed, products };
}
