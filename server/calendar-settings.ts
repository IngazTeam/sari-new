import type { PoolConnection } from "mysql2/promise";
import { calendarOAuthStore, CalendarOAuthError } from "./calendar-oauth";
import { privacyHashExact } from "./accounts/privacy-hash";
import {
  calendarDisconnectInput,
  calendarSettingsView,
} from "../shared/calendar-settings";
type Scope = { merchantId: number; userId: number; sessionId: string };
export const calendarSettingsStore = {
  transaction: calendarOAuthStore.transaction,
  authority: calendarOAuthStore.authority,
};
async function snapshot(c: PoolConnection, scope: Scope) {
  await calendarSettingsStore.authority(c, scope);
  const [integrations] = await c.execute<any[]>(
    "SELECT id,credentials,calendar_id,is_active,last_sync FROM google_integrations WHERE merchant_id=? AND integration_type='calendar' ORDER BY id LIMIT 2 FOR UPDATE",
    [scope.merchantId]
  );
  const [configs] = await c.execute<any[]>(
    "SELECT id,clientId,clientSecret,is_enabled FROM google_oauth_settings ORDER BY id LIMIT 2 FOR SHARE"
  );
  if (integrations.length > 1 || configs.length > 1)
    throw new CalendarOAuthError("changed");
  const row = integrations[0],
    config = configs[0],
    oauthReady =
      !!config &&
      Number(config.is_enabled) === 1 &&
      !!config.clientId &&
      !!config.clientSecret;
  let credentialsValid = false;
  if (typeof row?.credentials === "string" && row.credentials.length <= 65536)
    try {
      const v = JSON.parse(row.credentials),
        token = (value: unknown) =>
          typeof value === "string" &&
          value.length > 0 &&
          value.length <= 16384 &&
          !/[\s\x00-\x1f\x7f]/.test(value);
      credentialsValid =
        !!v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        (token(v.refresh_token) ||
          (token(v.access_token) &&
            typeof v.expiry_date === "number" &&
            v.expiry_date > Date.now()));
    } catch {
      /* Display a damaged credential state without returning the secret. */
    }
  if (row && ![0, 1].includes(Number(row.is_active)))
    throw new CalendarOAuthError("changed");
  const active = !!row && Number(row.is_active) === 1,
    state = !active
      ? "unlinked"
      : !credentialsValid
        ? "credentials_invalid"
        : !oauthReady
          ? "oauth_disabled"
          : !row.calendar_id
            ? "needs_destination"
            : "configured";
  const [count] = await c.execute<any[]>(
    "SELECT COUNT(*) AS total FROM appointments WHERE merchant_id=?",
    [scope.merchantId]
  );
  return {
    row,
    view: calendarSettingsView.parse({
      actorId: scope.userId,
      merchantId: scope.merchantId,
      digest: privacyHashExact(
        "calendar-settings:" +
          JSON.stringify({
            merchantId: scope.merchantId,
            row: row ?? null,
            config: config ?? null,
          })
      ),
      hasIntegration: !!row,
      active,
      oauthReady,
      state,
      calendarId: row?.calendar_id ?? null,
      lastSync: row?.last_sync ? new Date(row.last_sync).toISOString() : null,
      retainedAppointments: Number(count[0].total),
    }),
  };
}
export async function readCalendarSettings(scope: Scope) {
  return calendarSettingsStore.transaction(
    async c => (await snapshot(c, scope)).view
  );
}
export async function disconnectCalendar(scope: Scope, raw: unknown) {
  const input = calendarDisconnectInput.parse(raw);
  return calendarSettingsStore.transaction(async c => {
    const current = await snapshot(c, scope);
    if (!current.row || current.view.digest !== input.expectedDigest)
      throw new CalendarOAuthError("changed");
    await c.execute(
      "UPDATE google_integrations SET credentials=NULL,is_active=0,last_sync=NULL WHERE id=? AND merchant_id=? AND integration_type='calendar'",
      [current.row.id, scope.merchantId]
    );
    // Invalidate even an exchanged grant: disconnect must not be undone by a late callback.
    await c.execute("DELETE FROM calendar_oauth_states WHERE merchant_id=?", [
      scope.merchantId,
    ]);
    return { success: true as const, ...(await snapshot(c, scope)).view };
  });
}
