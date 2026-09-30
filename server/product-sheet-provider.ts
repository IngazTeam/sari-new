import { google } from "googleapis";
import { z } from "zod";
import {
  productSpreadsheetId,
  productSheet,
} from "../shared/product-sheet-import";
import {
  productSheetRange,
  readProductSheetList,
  previewProductSheet,
  readProductSheetGrid,
} from "./product-sheet-preview";
import { previewSheetInventory } from "./product-sheet-inventory";
import { sheetInventoryOptions } from "../shared/product-sheet-inventory";
export class ProductSheetProviderError extends Error {
  constructor(
    public readonly reason:
      | "authentication"
      | "unavailable"
      | "response_size"
      | "response_invalid"
  ) {
    super(`product_sheet_provider:${reason}`);
  }
}
const secret = z
  .string()
  .min(1)
  .max(16384)
  .refine(s => !/[\r\n\u0000]/.test(s));
const authSchema = z
  .object({
    clientId: secret,
    clientSecret: secret,
    credentials: z.object({
      access_token: secret.nullable().optional(),
      refresh_token: secret.nullable().optional(),
      expiry_date: z.number().finite().nullable().optional(),
      token_type: z.literal("Bearer").nullable().optional(),
    }),
  })
  .strict();
export type ProductSheetAuth = z.input<typeof authSchema>;
const MAX_BYTES = 8 * 1024 * 1024;
const propertyFields =
  "sheetId,title,hidden,sheetType,gridProperties(rowCount,columnCount)";
const metadataFields = `spreadsheetId,sheets(properties(${propertyFields}))`;
const gridFields = `spreadsheetId,sheets(properties(${propertyFields}),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,effectiveFormat(numberFormat(type))))))`;
/** Internal adapter. Its caller must resolve credentials from the current tenant and recheck access/source in assertCurrent. */
export async function readProductSheetProvider(input: {
  spreadsheetId: string;
  auth: ProductSheetAuth;
  assertCurrent: () => Promise<void>;
  selection?: { sheet: unknown; options: unknown; kind?: "inventory" };
}) {
  const spreadsheetId = productSpreadsheetId.parse(input.spreadsheetId),
    sheet = input.selection ? productSheet.parse(input.selection.sheet) : null;
  if (input.selection?.kind === "inventory")
    sheetInventoryOptions.parse(input.selection.options);
  let auth: ReturnType<typeof authSchema.parse>;
  try {
    auth = authSchema.parse(input.auth);
  } catch {
    throw new ProductSheetProviderError("authentication");
  }
  await input.assertCurrent();
  let token: string;
  try {
    // Refresh only in memory: never overwrite a reconnected integration's credentials.
    const client = new google.auth.OAuth2({
      clientId: auth.clientId,
      clientSecret: auth.clientSecret,
      transporterOptions: { timeout: 20000, retry: false },
    });
    const deadline = AbortSignal.timeout(20000);
    // OAuth supplies per-request retry defaults, which override constructor defaults.
    client.transporter.interceptors.request.add({
      resolved: async config => ({
        ...config,
        retry: false,
        timeout: 20000,
        signal: deadline,
        maxRedirects: 0,
      }),
    });
    client.setCredentials(auth.credentials);
    token = secret.parse((await client.getAccessToken()).token);
  } catch {
    throw new ProductSheetProviderError("authentication");
  }
  await input.assertCurrent();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`
  );
  url.searchParams.set("fields", sheet ? gridFields : metadataFields);
  if (sheet) url.searchParams.set("ranges", productSheetRange(sheet));
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new ProductSheetProviderError("unavailable");
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new ProductSheetProviderError(
      response.status === 401 || response.status === 403
        ? "authentication"
        : "unavailable"
    );
  }
  const announced = Number(response.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > MAX_BYTES) {
    await response.body.cancel().catch(() => {});
    throw new ProductSheetProviderError("response_size");
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0,
    raw: unknown;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES)
        throw new ProductSheetProviderError("response_size");
      chunks.push(value);
    }
    raw = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
    );
  } catch (error) {
    if (error instanceof ProductSheetProviderError) throw error;
    throw new ProductSheetProviderError("response_invalid");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  await input.assertCurrent();
  if (input.selection?.kind === "inventory")
    return previewSheetInventory(
      readProductSheetGrid(raw, {
        spreadsheetId,
        sheet,
        readAt: new Date().toISOString(),
      }),
      input.selection.options
    );
  return input.selection
    ? previewProductSheet(raw, {
        spreadsheetId,
        sheet,
        options: input.selection.options,
        readAt: new Date().toISOString(),
      })
    : readProductSheetList(raw, spreadsheetId);
}
