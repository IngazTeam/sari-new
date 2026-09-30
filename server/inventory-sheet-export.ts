import { projectInventoryExport } from "../shared/inventory-sheet-export-plan";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { products } from "../drizzle/schema";
import {
  inventoryExportReceipt,
  inventorySheetExportInput,
  INVENTORY_EXPORT_MAX_ROWS,
} from "../shared/inventory-sheet-export";
import { catalogVisibleSql } from "./integrations/catalog-scope";
import {
  productEditorStore as store,
  ProductEditorForbidden,
} from "./product-editor";
import {
  readProductSheetConnectionOn,
  resolveInventorySheetExportSource,
} from "./product-sheet-source";
import {
  writeInventorySheetProvider,
  InventoryExportProviderError,
} from "./inventory-sheet-export-provider";

export {
  InventoryExportLimit,
  InventoryExportEmpty,
  InventoryExportInvalid,
  projectInventoryExport,
} from "../shared/inventory-sheet-export-plan";
export async function readInventoryExportStatus(
  merchantId: number,
  actorId: number
) {
  return store.transaction(false, async c => {
    const view = await readProductSheetConnectionOn(c, merchantId, actorId);
    const [records] = await c.execute<any[]>(
      "SELECT last_sync FROM google_integrations WHERE merchant_id=? AND integration_type='sheets'",
      [merchantId]
    );
    const date = records[0]?.last_sync ? new Date(records[0].last_sync) : null;
    return {
      merchantId,
      actorId,
      isConnected: !!view.source,
      spreadsheetId: view.source?.spreadsheetId,
      sourceDigest: view.source?.digest,
      reason: view.reason,
      lastSync:
        date && Number.isFinite(date.getTime())
          ? date.toISOString()
          : undefined,
    };
  });
}

/** Bounded catalog snapshot. No caller-provided product, destination or credential is accepted. */
export async function exportInventoryToSheet(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const input = inventorySheetExportInput.parse(raw),
    source = await resolveInventorySheetExportSource(
      merchantId,
      actorId,
      input.expectedSourceDigest
    );
  const data = await store.transaction(false, async c => {
    const merchant = await store.authority(c, merchantId, actorId, false);
    if (!merchant.canManage) throw new ProductEditorForbidden();
    const selected = await drizzle({ client: c })
      .select({
        id: products.id,
        merchantId: products.merchantId,
        name: products.name,
        category: products.category,
        price: products.price,
        priceUnit: products.priceUnit,
        currency: products.currency,
        stock: products.stock,
      })
      .from(products)
      .where(
        and(eq(products.merchantId, merchantId), sql.raw(catalogVisibleSql()))
      )
      .orderBy(products.id)
      .limit(INVENTORY_EXPORT_MAX_ROWS + 1);
    return projectInventoryExport(
      selected,
      merchantId,
      new Date().toISOString()
    );
  });
  const receipt = await writeInventorySheetProvider({
    spreadsheetId: source.source.spreadsheetId,
    auth: source.auth,
    rows: data.rows,
    assertCurrent: async () => {
      await resolveInventorySheetExportSource(
        merchantId,
        actorId,
        input.expectedSourceDigest
      );
    },
  });
  const receiptResult = inventoryExportReceipt.safeParse({
    success: true,
    merchantId,
    actorId,
    sourceDigest: input.expectedSourceDigest,
    ...receipt,
    unknownStock: data.unknownStock,
    unverifiedPrice: data.unverifiedPrice,
  });
  if (!receiptResult.success)
    throw new InventoryExportProviderError("unconfirmed");
  return receiptResult.data;
}
