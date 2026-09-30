import type { PoolConnection } from "mysql2/promise";
import { privacyHashExact } from "./accounts/privacy-hash";
import { sheetsOAuthStore, SheetsOAuthError } from "./sheets-oauth";
import {
  sheetReportFlags,
  sheetsSettingsChange,
  sheetsSettingsView,
  sheetsDisconnect,
} from "../shared/sheets-settings";
type Scope = { merchantId: number; userId: number; sessionId: string };
export const sheetsSettingsStore = {
  transaction: sheetsOAuthStore.transaction,
  authority: sheetsOAuthStore.authority,
};
async function snapshot(c: PoolConnection, scope: Scope) {
  await sheetsSettingsStore.authority(c, scope);
  const [integrations] = await c.execute<any[]>(
    "SELECT id,credentials,is_active,sheet_id,settings,last_sync FROM google_integrations WHERE merchant_id=? AND integration_type='sheets' ORDER BY id LIMIT 2 FOR UPDATE",
    [scope.merchantId]
  );
  const [configs] = await c.execute<any[]>(
    "SELECT id,clientId,clientSecret,is_enabled FROM google_oauth_settings ORDER BY id LIMIT 2 FOR SHARE"
  );
  if (integrations.length > 1 || configs.length > 1)
    throw new SheetsOAuthError("changed");
  const row = integrations[0],
    config = configs[0];
  const oauthReady =
    !!config &&
    Number(config.is_enabled) === 1 &&
    !!config.clientId &&
    !!config.clientSecret;
  let credentialsValid = false,
    settings: Record<string, unknown> = {};
  if (typeof row?.credentials === "string" && row.credentials.length <= 65536)
    try {
      const v = JSON.parse(row.credentials);
      credentialsValid =
        !!v &&
        typeof v === "object" &&
        ((typeof v.refresh_token === "string" && !!v.refresh_token) ||
          (typeof v.access_token === "string" && !!v.access_token));
    } catch {
      /* Report invalid credentials, not an absent connection. */
    }
  if (row?.settings) {
    if (typeof row.settings !== "string" || row.settings.length > 65536)
      throw Error("Invalid Sheets settings");
    const parsed = JSON.parse(row.settings);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw Error("Invalid Sheets settings");
    settings = parsed;
  }
  const reports = sheetReportFlags.parse({
    sendDailyReports:
      settings.sendDailyReports === undefined
        ? false
        : settings.sendDailyReports,
    sendWeeklyReports:
      settings.sendWeeklyReports === undefined
        ? false
        : settings.sendWeeklyReports,
    sendMonthlyReports:
      settings.sendMonthlyReports === undefined
        ? false
        : settings.sendMonthlyReports,
  });
  if (row && ![0, 1].includes(Number(row.is_active)))
    throw Error("Invalid Sheets status");
  const active = !!row && Number(row.is_active) === 1;
  const state = !active
    ? "unlinked"
    : !credentialsValid
      ? "credentials_invalid"
      : !oauthReady
        ? "oauth_disabled"
        : !row.sheet_id
          ? "needs_destination"
          : "ready";
  const view = sheetsSettingsView.parse({
    merchantId: scope.merchantId,
    actorId: scope.userId,
    digest: privacyHashExact(
      `sheets-settings:${JSON.stringify({ merchantId: scope.merchantId, row: row ?? null, config: config ?? null })}`
    ),
    isConnected: active && credentialsValid && oauthReady,
    oauthReady,
    hasIntegration: !!row,
    state,
    spreadsheetId:
      active && credentialsValid && row.sheet_id ? row.sheet_id : undefined,
    lastSync: row?.last_sync
      ? new Date(row.last_sync).toISOString()
      : undefined,
    reports,
  });
  return { row, settings, view };
}
export async function readSheetsSettings(scope: Scope) {
  return sheetsSettingsStore.transaction(
    async c => (await snapshot(c, scope)).view
  );
}
export async function writeSheetsReportSettings(scope: Scope, raw: unknown) {
  const input = sheetsSettingsChange.parse(raw);
  return sheetsSettingsStore.transaction(async c => {
    const current = await snapshot(c, scope);
    if (current.view.digest !== input.expectedDigest)
      throw new SheetsOAuthError("changed");
    if (
      !current.row ||
      (Object.values(input.changes).some(Boolean) &&
        current.view.state !== "ready")
    )
      throw new SheetsOAuthError("configuration");
    await c.execute(
      "UPDATE google_integrations SET settings=? WHERE id=? AND merchant_id=? AND integration_type='sheets'",
      [
        JSON.stringify({ ...current.settings, ...input.changes }),
        current.row.id,
        scope.merchantId,
      ]
    );
    return { success: true as const, ...(await snapshot(c, scope)).view };
  });
}
export async function disconnectSheets(scope: Scope, raw: unknown) {
  const input = sheetsDisconnect.parse(raw);
  return sheetsSettingsStore.transaction(async c => {
    const current = await snapshot(c, scope);
    if (current.view.digest !== input.expectedDigest)
      throw new SheetsOAuthError("changed");
    if (!current.row) throw new SheetsOAuthError("changed");
    await c.execute(
      "UPDATE google_integrations SET credentials=NULL,is_active=0,sheet_id=NULL,last_sync=NULL,settings=? WHERE id=? AND merchant_id=? AND integration_type='sheets'",
      [
        JSON.stringify({
          ...current.settings,
          sendDailyReports: false,
          sendWeeklyReports: false,
          sendMonthlyReports: false,
        }),
        current.row.id,
        scope.merchantId,
      ]
    );
    // A pending grant must not re-enable a deliberately disconnected account.
    await c.execute(
      "UPDATE sheets_oauth_states SET consumed_at=NOW() WHERE merchant_id=? AND consumed_at IS NULL",
      [scope.merchantId]
    );
    return { success: true as const, ...(await snapshot(c, scope)).view };
  });
}
