import { google } from "./_core/google-api-clients";
import { z } from "zod";
import type { ProductSheetAuth } from "./product-sheet-provider";
import {
  sheetsSetupBody,
  sheetsSetupTabs,
  sheetsSetupTitle,
  sheetsSetupReceipt,
} from "../shared/sheets-setup";
export class SheetsSetupProviderError extends Error {
  constructor(
    public readonly reason: "authentication" | "unconfirmed",
    public readonly spreadsheetId?: string
  ) {
    super(`sheets_setup:${reason}`);
  }
}
const secret = z
  .string()
  .min(1)
  .max(16384)
  .refine(v => !/[\r\n\u0000]/.test(v));
const fileId = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/);
async function responseJson(response: Response) {
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length")) > 131072
  ) {
    await response.body?.cancel().catch(() => {});
    throw Error();
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) throw Error();
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
    );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
/** One creation request contains every tab and header. No credentials are persisted by this adapter. */
export async function createSheetsWorkspace(input: {
  requestId: string;
  auth: ProductSheetAuth;
  assertCurrent: () => Promise<void>;
  beforeDispatch: () => Promise<void>;
}) {
  const body = sheetsSetupBody(input.requestId);
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
    if (!credentials.access_token && !credentials.refresh_token) throw Error();
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
    throw new SheetsSetupProviderError("authentication");
  }
  await input.assertCurrent();
  // The caller must durably claim dispatch before any create request can leave.
  await input.beforeDispatch();
  let raw: any;
  try {
    raw = await responseJson(
      await fetch(
        "https://sheets.googleapis.com/v4/spreadsheets?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title,sheetType),data(startRow,startColumn,rowData(values(userEnteredValue))))",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      )
    );
  } catch {
    throw new SheetsSetupProviderError("unconfirmed");
  }
  const destination = fileId.safeParse(raw?.spreadsheetId);
  try {
    if (
      !destination.success ||
      raw.properties?.title !== sheetsSetupTitle(input.requestId) ||
      !Array.isArray(raw.sheets) ||
      raw.sheets.length !== 4
    )
      throw Error();
    for (const tab of sheetsSetupTabs) {
      const found = raw.sheets.filter(
        (s: any) => s?.properties?.sheetId === tab.id
      );
      if (
        found.length !== 1 ||
        found[0].properties.title !== tab.title ||
        found[0].properties.sheetType !== "GRID"
      )
        throw Error();
      const data = found[0].data;
      if (
        !Array.isArray(data) ||
        data.length !== 1 ||
        (data[0].startRow ?? 0) !== 0 ||
        (data[0].startColumn ?? 0) !== 0
      )
        throw Error();
      const cells = data[0].rowData?.[0]?.values;
      if (
        !Array.isArray(cells) ||
        cells.length !== tab.headers.length ||
        cells.some(
          (cell: any, i: number) =>
            cell?.userEnteredValue?.stringValue !== tab.headers[i] ||
            Object.keys(cell.userEnteredValue).length !== 1
        )
      )
        throw Error();
    }
    return sheetsSetupReceipt.parse({
      requestId: input.requestId,
      spreadsheetId: destination.data,
      templateVersion: 1,
      confirmedAt: new Date().toISOString(),
    });
  } catch {
    throw new SheetsSetupProviderError(
      "unconfirmed",
      destination.success ? destination.data : undefined
    );
  }
}
