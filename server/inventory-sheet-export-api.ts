import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorInvalid,
  ProductEditorMissing,
} from "./product-editor";
import { ProductSheetDisconnected } from "./product-sheet-source";
import {
  InventoryExportLimit,
  InventoryExportEmpty,
  InventoryExportInvalid,
} from "./inventory-sheet-export";
import { InventoryExportProviderError } from "./inventory-sheet-export-provider";
export async function guardInventoryExport<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const code =
      error instanceof ProductEditorForbidden
        ? "FORBIDDEN"
        : error instanceof ProductEditorMissing
          ? "NOT_FOUND"
          : error instanceof ProductEditorConflict
            ? "CONFLICT"
            : error instanceof ProductSheetDisconnected
              ? "PRECONDITION_FAILED"
              : error instanceof ProductEditorInvalid ||
                  error instanceof InventoryExportInvalid ||
                  error instanceof ZodError ||
                  error instanceof InventoryExportLimit ||
                  error instanceof InventoryExportEmpty
                ? "BAD_REQUEST"
                : error instanceof InventoryExportProviderError
                  ? "BAD_GATEWAY"
                  : "INTERNAL_SERVER_ERROR";
    const reason =
      error instanceof InventoryExportEmpty
        ? "empty"
        : error instanceof InventoryExportLimit
          ? "limit"
          : error instanceof InventoryExportProviderError
            ? error.reason
            : "unavailable";
    throw new TRPCError({ code, message: `inventory_export:${reason}` });
  }
}
