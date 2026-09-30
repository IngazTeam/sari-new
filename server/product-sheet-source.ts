import {
  productEditorStore as store,
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
} from "./product-editor";
import {
  readProductSheetProvider,
  type ProductSheetAuth,
} from "./product-sheet-provider";
import {
  productSheet,
  productSheetConnection,
  productSheetListInput,
  productSheetSelection,
  productSheetSnapshot,
  productSheetSourceIdentity,
} from "../shared/product-sheet-import";
import { z } from "zod";
export class ProductSheetDisconnected extends Error {}
async function connection(merchantId: number, actorId: number) {
  store.validId(merchantId);
  store.validId(actorId);
  return store.transaction(false, async c => {
    const merchant = await store.authority(c, merchantId, actorId, false);
    if (!merchant.canManage) throw new ProductEditorForbidden();
    const [integrations] = await c.execute<any[]>(
      "SELECT id,sheet_id,credentials,is_active FROM google_integrations WHERE merchant_id=? AND integration_type='sheets' ORDER BY id LIMIT 2",
      [merchantId]
    );
    if (integrations.length > 1) throw new ProductEditorConflict();
    const integration = integrations[0];
    const base = {
      merchantId,
      actorId,
      integrationSource: merchant.integration_source as string | null,
    };
    if (
      !integration ||
      Number(integration.is_active) !== 1 ||
      !integration.sheet_id
    )
      return {
        view: productSheetConnection.parse({
          ...base,
          source: null,
          reason: "unlinked",
        }),
        auth: null,
      };
    if (!integration.credentials)
      return {
        view: productSheetConnection.parse({
          ...base,
          source: null,
          reason: "credentials_missing",
        }),
        auth: null,
      };
    const [settings] = await c.execute<any[]>(
      "SELECT id,clientId,clientSecret,is_enabled FROM google_oauth_settings ORDER BY id LIMIT 2"
    );
    if (settings.length > 1) throw new ProductEditorConflict();
    const config = settings[0];
    if (
      !config ||
      Number(config.is_enabled) !== 1 ||
      !config.clientId ||
      !config.clientSecret
    )
      return {
        view: productSheetConnection.parse({
          ...base,
          source: null,
          reason: "oauth_disabled",
        }),
        auth: null,
      };
    if (
      typeof integration.credentials !== "string" ||
      integration.credentials.length > 65536
    )
      throw new ProductSheetDisconnected();
    let credentials: ProductSheetAuth["credentials"];
    try {
      credentials = JSON.parse(integration.credentials);
    } catch {
      throw new ProductSheetDisconnected();
    }
    if (
      !credentials ||
      typeof credentials !== "object" ||
      (!credentials.access_token && !credentials.refresh_token)
    )
      throw new ProductSheetDisconnected();
    const source = productSheetSourceIdentity.parse({
      integrationId: Number(integration.id),
      spreadsheetId: integration.sheet_id,
      digest: store.hash({
        merchantId,
        integrationId: integration.id,
        spreadsheetId: integration.sheet_id,
        credentials: integration.credentials,
        oauth: config,
      }),
    });
    return {
      view: productSheetConnection.parse({ ...base, source, reason: null }),
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        credentials,
      } satisfies ProductSheetAuth,
    };
  });
}
export async function readProductSheetConnection(
  merchantId: number,
  actorId: number
) {
  return (await connection(merchantId, actorId)).view;
}
async function selected(merchantId: number, actorId: number, expected: string) {
  const current = await connection(merchantId, actorId);
  if (!current.view.source || !current.auth)
    throw new ProductSheetDisconnected();
  if (current.view.source.digest !== expected)
    throw new ProductEditorConflict();
  if (current.view.integrationSource !== "none")
    throw new ProductEditorLocked();
  return {
    auth: current.auth,
    view: { ...current.view, source: current.view.source },
  };
}
export async function listProductSheetSource(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const input = productSheetListInput.parse(raw),
    current = await selected(merchantId, actorId, input.expectedSourceDigest);
  const sheets = await readProductSheetProvider({
    spreadsheetId: current.view.source.spreadsheetId,
    auth: current.auth,
    assertCurrent: async () => {
      await selected(merchantId, actorId, input.expectedSourceDigest);
    },
  });
  await selected(merchantId, actorId, input.expectedSourceDigest);
  return {
    merchantId,
    actorId,
    source: current.view.source,
    sheets: z.array(productSheet).max(100).parse(sheets),
  };
}
/** Internal preparation input; never lets the browser supply product rows or credentials. */
export async function snapshotProductSheetSource(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const input = productSheetSelection.parse(raw),
    current = await selected(merchantId, actorId, input.expectedSourceDigest);
  const snapshot = await readProductSheetProvider({
    spreadsheetId: current.view.source.spreadsheetId,
    auth: current.auth,
    assertCurrent: async () => {
      await selected(merchantId, actorId, input.expectedSourceDigest);
    },
    selection: { sheet: input.sheet, options: input.options },
  });
  await selected(merchantId, actorId, input.expectedSourceDigest);
  return {
    merchantId,
    actorId,
    source: current.view.source,
    snapshot: productSheetSnapshot.parse(snapshot),
  };
}
