import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  readSheetsSettings,
  writeSheetsReportSettings,
  disconnectSheets,
  sheetsSettingsStore,
} from "./sheets-settings";
const scope = { merchantId: 7, userId: 9, sessionId: "a".repeat(64) };
let rows: any[], configs: any[], queries: string[];
beforeEach(() => {
  queries = [];
  rows = [
    {
      id: 8,
      credentials: JSON.stringify({ refresh_token: "private-refresh" }),
      is_active: 1,
      sheet_id: "local-sheet",
      settings: JSON.stringify({ custom: "retained" }),
      last_sync: "2026-09-29 12:00:00",
    },
  ];
  configs = [
    {
      id: 3,
      clientId: "private-client",
      clientSecret: "private-secret",
      is_enabled: 1,
    },
  ];
  vi.spyOn(sheetsSettingsStore, "authority").mockResolvedValue(undefined);
  vi.spyOn(sheetsSettingsStore, "transaction").mockImplementation(run =>
    run({
      execute: async (sql: string, args: any[]) => {
        queries.push(sql);
        if (sql.includes("FROM google_integrations"))
          return [structuredClone(rows), []];
        if (sql.includes("FROM google_oauth_settings"))
          return [structuredClone(configs), []];
        if (sql.startsWith("UPDATE google_integrations SET settings="))
          rows[0].settings = args[0];
        if (sql.startsWith("UPDATE google_integrations SET credentials="))
          Object.assign(rows[0], {
            credentials: null,
            is_active: 0,
            sheet_id: null,
            last_sync: null,
            settings: args[0],
          });
        return [{ affectedRows: 1 }, []];
      },
    } as any)
  );
});
afterEach(() => vi.restoreAllMocks());
describe("Sheets settings snapshot and guarded writes", () => {
  it("returns honest connection state, one snapshot of flags, and no credentials", async () => {
    const v = await readSheetsSettings(scope);
    expect(v).toMatchObject({
      merchantId: 7,
      actorId: 9,
      state: "ready",
      isConnected: true,
      oauthReady: true,
      reports: {
        sendDailyReports: false,
        sendWeeklyReports: false,
        sendMonthlyReports: false,
      },
    });
    expect(v.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(v)).not.toContain("private-");
    expect(v.lastSync).toMatch(/^2026-09-29/);
  });
  it.each([
    "missing",
    "inactive",
    "badCredentials",
    "disabledOAuth",
    "missingDestination",
  ])("distinguishes %s from read failure", async mode => {
    if (mode === "missing") rows = [];
    if (mode === "inactive") rows[0].is_active = 0;
    if (mode === "badCredentials") rows[0].credentials = "broken";
    if (mode === "disabledOAuth") configs[0].is_enabled = 0;
    if (mode === "missingDestination") rows[0].sheet_id = null;
    const v = await readSheetsSettings(scope);
    expect(v.state).toBe(
      mode === "missing" || mode === "inactive"
        ? "unlinked"
        : mode === "badCredentials"
          ? "credentials_invalid"
          : mode === "disabledOAuth"
            ? "oauth_disabled"
            : "needs_destination"
    );
  });
  it.each([
    "duplicateIntegration",
    "duplicateConfig",
    "malformedSettings",
    "nullFlag",
    "stringFlag",
    "unsafeSheet",
    "unknownActive",
  ])("fails closed on %s", async mode => {
    if (mode === "duplicateIntegration") rows.push({ ...rows[0], id: 12 });
    if (mode === "duplicateConfig") configs.push({ ...configs[0], id: 9 });
    if (mode === "malformedSettings") rows[0].settings = "oops";
    if (mode === "nullFlag") rows[0].settings = '{"sendDailyReports":null}';
    if (mode === "stringFlag")
      rows[0].settings = '{"sendDailyReports":"false"}';
    if (mode === "unsafeSheet") rows[0].sheet_id = "../../other";
    if (mode === "unknownActive") rows[0].is_active = 3;
    await expect(readSheetsSettings(scope)).rejects.toBeTruthy();
  });
  it("propagates database failure instead of returning unlinked", async () => {
    vi.mocked(sheetsSettingsStore.transaction).mockRejectedValueOnce(
      Error("db unavailable")
    );
    await expect(readSheetsSettings(scope)).rejects.toThrow("db unavailable");
  });
  it("persists only selected booleans and retains unrelated settings", async () => {
    const v = await readSheetsSettings(scope);
    const result = await writeSheetsReportSettings(scope, {
      expectedDigest: v.digest,
      reviewed: true,
      changes: { sendDailyReports: true },
    });
    expect(result.success).toBe(true);
    expect(result.digest).not.toBe(v.digest);
    expect(result.reports.sendDailyReports).toBe(true);
    expect(JSON.parse(rows[0].settings).custom).toBe("retained");
  });
  it("rejects stale snapshots before any update", async () => {
    const v = await readSheetsSettings(scope);
    rows[0].sheet_id = "new";
    await expect(
      writeSheetsReportSettings(scope, {
        expectedDigest: v.digest,
        reviewed: true,
        changes: { sendDailyReports: true },
      })
    ).rejects.toMatchObject({ reason: "changed" });
    expect(queries.some(s => s.startsWith("UPDATE"))).toBe(false);
  });
  it("permits disabling reports when OAuth is disabled but forbids enabling", async () => {
    configs[0].is_enabled = 0;
    rows[0].settings = '{"sendDailyReports":true}';
    let v = await readSheetsSettings(scope);
    await expect(
      writeSheetsReportSettings(scope, {
        expectedDigest: v.digest,
        reviewed: true,
        changes: { sendWeeklyReports: true },
      })
    ).rejects.toMatchObject({ reason: "configuration" });
    expect(
      (
        await writeSheetsReportSettings(scope, {
          expectedDigest: v.digest,
          reviewed: true,
          changes: { sendDailyReports: false },
        })
      ).reports.sendDailyReports
    ).toBe(false);
  });
  it("disconnects and cancels pending grants atomically without deleting Google data", async () => {
    const v = await readSheetsSettings(scope),
      result = await disconnectSheets(scope, {
        expectedDigest: v.digest,
        reviewed: true,
      });
    expect(result).toMatchObject({
      success: true,
      state: "unlinked",
      isConnected: false,
    });
    expect(rows[0].credentials).toBeNull();
    expect(rows[0].sheet_id).toBeNull();
    expect(JSON.parse(rows[0].settings)).toEqual({
      custom: "retained",
      sendDailyReports: false,
      sendWeeklyReports: false,
      sendMonthlyReports: false,
    });
    expect(
      queries.some(s =>
        s.startsWith("UPDATE sheets_oauth_states SET consumed_at")
      )
    ).toBe(true);
  });
  it.each([
    { changes: {} },
    { changes: { sendDailyReports: "yes" } },
    { reviewed: false, changes: { sendDailyReports: true } },
    { changes: { admin: true } },
  ])("rejects malformed settings before storage %j", async value => {
    vi.mocked(sheetsSettingsStore.transaction).mockClear();
    await expect(
      writeSheetsReportSettings(scope, {
        expectedDigest: "a".repeat(64),
        reviewed: true,
        ...value,
      })
    ).rejects.toBeTruthy();
    expect(sheetsSettingsStore.transaction).not.toHaveBeenCalled();
  });
});
