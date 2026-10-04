import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  oauth: vi.fn(),
  token: vi.fn(),
  set: vi.fn(),
  interceptor: vi.fn(),
}));
vi.mock("./_core/google-api-clients", () => ({
  google: {
    auth: {
      OAuth2: class {
        transporter = { interceptors: { request: { add: m.interceptor } } };
        constructor(options: any) {
          m.oauth(options);
        }
        setCredentials = m.set;
        getAccessToken = m.token;
      },
    },
  },
}));
import { createSheetsWorkspace } from "./sheets-setup-provider";
import { sheetsSetupBody, sheetsSetupTabs } from "../shared/sheets-setup";
const requestId = "a73d82f5-1338-436e-87f7-88c971b22b89";
let fetched: ReturnType<typeof vi.fn>,
  input: Parameters<typeof createSheetsWorkspace>[0];
const good = () => ({
  spreadsheetId: "local-new-file",
  ...sheetsSetupBody(requestId),
});
beforeEach(() => {
  vi.resetAllMocks();
  m.token.mockResolvedValue({ token: "private-token" });
  fetched = vi.fn().mockResolvedValue(new Response(JSON.stringify(good())));
  vi.stubGlobal("fetch", fetched);
  input = {
    requestId,
    auth: {
      clientId: "private-client",
      clientSecret: "private-secret",
      credentials: { refresh_token: "private-refresh" },
    },
    assertCurrent: vi.fn(),
    beforeDispatch: vi.fn(),
  };
});
afterEach(() => vi.unstubAllGlobals());
describe("single-request Sheets workspace provider", () => {
  it("creates all four tabs and literal headers in one request, then returns a verified receipt", async () => {
    const receipt = await createSheetsWorkspace(input);
    expect(receipt).toMatchObject({
      requestId,
      spreadsheetId: "local-new-file",
      templateVersion: 1,
    });
    expect(fetched).toHaveBeenCalledTimes(1);
    const [url, options] = fetched.mock.calls[0];
    expect(new URL(url).origin).toBe("https://sheets.googleapis.com");
    expect(options).toMatchObject({ method: "POST", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options.body);
    expect(body.sheets).toHaveLength(4);
    expect(body.properties.title).toContain(requestId);
    expect(body.sheets.map((s: any) => s.properties.title)).toEqual(
      sheetsSetupTabs.map(t => t.title)
    );
    expect(input.assertCurrent).toHaveBeenCalledTimes(2);
    expect(input.beforeDispatch).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(input.beforeDispatch).mock.invocationCallOrder[0]
    ).toBeLessThan(fetched.mock.invocationCallOrder[0]);
    expect(JSON.stringify(receipt)).not.toContain("private-");
    const intercept = await m.interceptor.mock.calls[0][0].resolved({
      retry: true,
    });
    expect(intercept).toMatchObject({
      retry: false,
      maxRedirects: 0,
      timeout: 20000,
    });
  });
  it.each(["before-auth", "after-auth", "dispatch"])(
    "does not create after a failed %s guard",
    async mode => {
      if (mode === "dispatch")
        vi.mocked(input.beforeDispatch).mockRejectedValue(Error("denied"));
      else if (mode === "before-auth")
        vi.mocked(input.assertCurrent).mockRejectedValueOnce(Error("denied"));
      else
        vi.mocked(input.assertCurrent)
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(Error("denied"));
      await expect(createSheetsWorkspace(input)).rejects.toThrow("denied");
      expect(fetched).not.toHaveBeenCalled();
    }
  );
  it("rejects invalid request ID before authorization", async () => {
    await expect(
      createSheetsWorkspace({ ...input, requestId: "bad" })
    ).rejects.toThrow();
    expect(m.oauth).not.toHaveBeenCalled();
    expect(fetched).not.toHaveBeenCalled();
  });
  it.each(["token-error", "missing-token", "bad-credentials"])(
    "reports %s as pre-dispatch authentication failure",
    async mode => {
      if (mode === "token-error")
        m.token.mockRejectedValue(Error("private-token"));
      if (mode === "missing-token") m.token.mockResolvedValue({ token: null });
      if (mode === "bad-credentials") input.auth.credentials = {};
      await expect(createSheetsWorkspace(input)).rejects.toMatchObject({
        reason: "authentication",
        message: "sheets_setup:authentication",
      });
      expect(input.beforeDispatch).not.toHaveBeenCalled();
      expect(fetched).not.toHaveBeenCalled();
    }
  );
  it.each([
    "network",
    "401",
    "500",
    "redirect",
    "badJSON",
    "large-length",
    "large-stream",
  ])("preserves uncertainty for %s and never repeats POST", async mode => {
    if (mode === "network") fetched.mockRejectedValue(Error("private-token"));
    else
      fetched.mockResolvedValue(
        new Response(
          mode === "large-stream" ? "a".repeat(131073) : "not-json",
          {
            status:
              mode === "401"
                ? 401
                : mode === "500"
                  ? 500
                  : mode === "redirect"
                    ? 302
                    : 200,
            headers:
              mode === "large-length" ? { "Content-Length": "131073" } : {},
          }
        )
      );
    await expect(createSheetsWorkspace(input)).rejects.toMatchObject({
      reason: "unconfirmed",
      message: "sheets_setup:unconfirmed",
    });
    expect(fetched).toHaveBeenCalledTimes(1);
  });
  it.each([
    "title",
    "tab-missing",
    "tab-duplicate",
    "tab-title",
    "type",
    "header",
    "formula",
    "offset",
    "file-id",
  ])("never confirms malformed %s evidence", async mode => {
    const raw: any = good();
    if (mode === "title") raw.properties.title = "different";
    if (mode === "tab-missing") raw.sheets.pop();
    if (mode === "tab-duplicate") raw.sheets[1] = raw.sheets[0];
    if (mode === "tab-title") raw.sheets[0].properties.title = "different";
    if (mode === "type") raw.sheets[0].properties.sheetType = "OBJECT";
    if (mode === "header")
      raw.sheets[0].data[0].rowData[0].values[0].userEnteredValue.stringValue =
        "wrong";
    if (mode === "formula")
      raw.sheets[0].data[0].rowData[0].values[0].userEnteredValue.formulaValue =
        "=1";
    if (mode === "offset") raw.sheets[0].data[0].startRow = 1;
    if (mode === "file-id") raw.spreadsheetId = "../../unsafe";
    fetched.mockResolvedValue(new Response(JSON.stringify(raw)));
    await expect(createSheetsWorkspace(input)).rejects.toMatchObject({
      reason: "unconfirmed",
      spreadsheetId: mode === "file-id" ? undefined : "local-new-file",
    });
    expect(fetched).toHaveBeenCalledTimes(1);
  });
});
