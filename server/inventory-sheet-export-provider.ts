import { google } from "./_core/google-api-clients";
import { z } from "zod";
import { inventoryExportRows } from "../shared/inventory-sheet-export";
import { productSpreadsheetId } from "../shared/product-sheet-import";
import type { ProductSheetAuth } from "./product-sheet-provider";
import { readProductSheetList } from "./product-sheet-preview";
export class InventoryExportProviderError extends Error {
  constructor(
    public readonly reason:
      | "authentication"
      | "unavailable"
      | "destination"
      | "size"
      | "unconfirmed"
  ) {
    super(`inventory_export:${reason}`);
  }
}
const secret = z
  .string()
  .min(1)
  .max(16384)
  .refine(v => !/[\r\n\u0000]/.test(v));
async function json(response: Response, writing: boolean): Promise<any> {
  const fail = () =>
    new InventoryExportProviderError(writing ? "unconfirmed" : "unavailable");
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw fail();
  }
  const limit = 512 * 1024;
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body.cancel().catch(() => {});
    throw fail();
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw fail();
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
    );
  } catch {
    throw fail();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
/** One batch replaces only the six inventory columns, preserving the header, formatting and other columns. */
export async function writeInventorySheetProvider(input: {
  spreadsheetId: string;
  auth: ProductSheetAuth;
  rows: unknown;
  assertCurrent: () => Promise<void>;
}) {
  const spreadsheetId = productSpreadsheetId.parse(input.spreadsheetId),
    rows = inventoryExportRows.parse(input.rows);
  if (Buffer.byteLength(JSON.stringify(rows), "utf8") > 2 * 1024 * 1024)
    throw new InventoryExportProviderError("size");
  await input.assertCurrent();
  let token: string;
  try {
    const client = new google.auth.OAuth2({
      clientId: secret.parse(input.auth.clientId),
      clientSecret: secret.parse(input.auth.clientSecret),
      transporterOptions: { timeout: 20000, retry: false },
    });
    const credentials = z
      .object({
        access_token: secret.nullable().optional(),
        refresh_token: secret.nullable().optional(),
        expiry_date: z.number().finite().nullable().optional(),
        token_type: z.literal("Bearer").nullable().optional(),
      })
      .parse(input.auth.credentials);
    if (!credentials.access_token && !credentials.refresh_token)
      throw Error("credentials");
    const deadline = AbortSignal.timeout(20000);
    client.transporter.interceptors.request.add({
      resolved: async config => ({
        ...config,
        retry: false,
        timeout: 20000,
        signal: deadline,
        maxRedirects: 0,
      }),
    });
    client.setCredentials(credentials);
    token = secret.parse((await client.getAccessToken()).token);
  } catch {
    throw new InventoryExportProviderError("authentication");
  }
  await input.assertCurrent();
  const origin = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  let metadata: unknown;
  try {
    metadata = await json(
      await fetch(
        `${origin}?fields=spreadsheetId,sheets(properties(sheetId,title,hidden,sheetType,gridProperties(rowCount,columnCount)))`,
        {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      ),
      false
    );
  } catch {
    throw new InventoryExportProviderError("unavailable");
  }
  let sheet;
  try {
    const matches = readProductSheetList(metadata, spreadsheetId).filter(
      s => s.title === "المخزون" && !s.hidden
    );
    if (matches.length !== 1) throw Error("destination");
    sheet = matches[0];
  } catch {
    throw new InventoryExportProviderError("destination");
  }
  const requests: any[] = [];
  if (sheet.rows < rows.length + 1)
    requests.push({
      appendDimension: {
        sheetId: sheet.id,
        dimension: "ROWS",
        length: rows.length + 1 - sheet.rows,
      },
    });
  if (sheet.columns < 6)
    requests.push({
      appendDimension: {
        sheetId: sheet.id,
        dimension: "COLUMNS",
        length: 6 - sheet.columns,
      },
    });
  requests.push({
    updateCells: {
      range: {
        sheetId: sheet.id,
        startRowIndex: 1,
        endRowIndex: Math.max(sheet.rows, rows.length + 1),
        startColumnIndex: 0,
        endColumnIndex: 6,
      },
      rows: rows.map(row => ({
        values: row.map(value => ({
          userEnteredValue: { stringValue: value },
        })),
      })),
      fields: "userEnteredValue",
    },
  });
  await input.assertCurrent();
  // Literal stringValue prevents formula evaluation; no automatic write retries.
  let result: any;
  try {
    result = await json(
      await fetch(`${origin}:batchUpdate?fields=spreadsheetId,replies`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }),
      true
    );
  } catch {
    throw new InventoryExportProviderError("unconfirmed");
  }
  if (
    result?.spreadsheetId !== spreadsheetId ||
    !Array.isArray(result.replies) ||
    result.replies.length !== requests.length
  )
    throw new InventoryExportProviderError("unconfirmed");
  return {
    spreadsheetId,
    sheetId: sheet.id,
    rows: rows.length,
    confirmedAt: new Date().toISOString(),
  };
}
