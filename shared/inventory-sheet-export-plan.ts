import {
  inventoryExportRows,
  INVENTORY_EXPORT_MAX_ROWS,
} from "./inventory-sheet-export";
import { verifiedProductMoney } from "./product-money";
export class InventoryExportInvalid extends Error {}
export class InventoryExportLimit extends Error {}
export class InventoryExportEmpty extends Error {}
export function projectInventoryExport(
  products: readonly {
    id: number;
    merchantId: number;
    name: string;
    category: string | null;
    price: number;
    priceUnit: string;
    currency: string;
    stock: number | null;
  }[],
  merchantId: number,
  at: string
) {
  if (!products.length) throw new InventoryExportEmpty();
  if (products.length > INVENTORY_EXPORT_MAX_ROWS)
    throw new InventoryExportLimit();
  let unknownStock = 0,
    unverifiedPrice = 0;
  const ids = new Set<number>();
  const rows = products.map(p => {
    if (
      p.merchantId !== merchantId ||
      !Number.isInteger(p.id) ||
      p.id < 1 ||
      p.id > 2147483647 ||
      ids.has(p.id)
    )
      throw new InventoryExportInvalid();
    ids.add(p.id);
    let price = "";
    try {
      const v = verifiedProductMoney(p);
      price = `${Math.floor(v.minor / 100)}.${String(v.minor % 100).padStart(2, "0")} ${v.currency}`;
    } catch {
      unverifiedPrice++;
    }
    const validStock =
      typeof p.stock === "number" &&
      Number.isInteger(p.stock) &&
      p.stock >= 0 &&
      p.stock <= 2147483647;
    if (!validStock) unknownStock++;
    return [
      String(p.id),
      p.name,
      p.category ?? "",
      price,
      validStock ? String(p.stock) : "",
      at,
    ];
  });
  return {
    rows: inventoryExportRows.parse(rows),
    unknownStock,
    unverifiedPrice,
  };
}
