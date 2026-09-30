import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  token: vi.fn(),
  fetch: vi.fn(),
  guard: vi.fn(),
  interceptor: vi.fn(),
  credentials: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        transporter = { interceptors: { request: { add: m.interceptor } } };
        setCredentials = m.credentials;
        getAccessToken = m.token;
      },
    },
  },
}));
import { writeInventorySheetProvider } from "./inventory-sheet-export-provider";
const row = [
  "4",
  '=HYPERLINK("url")',
  "+category",
  "12.34 USD",
  "",
  "2026-09-30T12:00:00.000Z",
];
const auth = {
  clientId: "synthetic",
  clientSecret: "private-secret",
  credentials: { refresh_token: "private-refresh" },
};
let metadata: any, answer: any;
const run = (patch: any = {}) =>
  writeInventorySheetProvider({
    spreadsheetId: "local-export",
    auth,
    rows: [row],
    assertCurrent: m.guard,
    ...patch,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", m.fetch);
  m.token.mockResolvedValue({ token: "private-access" });
  metadata = {
    spreadsheetId: "local-export",
    sheets: [
      {
        properties: {
          sheetId: 12,
          title: "المخزون",
          sheetType: "GRID",
          gridProperties: { rowCount: 1000, columnCount: 26 },
        },
      },
    ],
  };
  answer = { spreadsheetId: "local-export", replies: [{}] };
  m.fetch.mockImplementation(
    async (_u, o) =>
      new Response(JSON.stringify(o.method === "GET" ? metadata : answer))
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("bounded literal inventory export transport", () => {
  it("writes one batch to the selected sheet ID, clearing only old values below its six headers", async () => {
    expect(await run()).toMatchObject({
      spreadsheetId: "local-export",
      sheetId: 12,
      rows: 1,
    });
    expect(m.fetch).toHaveBeenCalledTimes(2);
    const [url, opts] = m.fetch.mock.calls[1];
    expect(String(url)).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/local-export:batchUpdate?fields=spreadsheetId,replies"
    );
    expect(opts).toMatchObject({ method: "POST", redirect: "error" });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    const req = JSON.parse(opts.body).requests;
    expect(req).toHaveLength(1);
    expect(req[0].updateCells.range).toEqual({
      sheetId: 12,
      startRowIndex: 1,
      endRowIndex: 1000,
      startColumnIndex: 0,
      endColumnIndex: 6,
    });
    expect(req[0].updateCells.fields).toBe("userEnteredValue");
    expect(req[0].updateCells.rows[0].values[1]).toEqual({
      userEnteredValue: { stringValue: row[1] },
    });
    expect(req[0].updateCells.rows[0].values[4]).toEqual({
      userEnteredValue: { stringValue: "" },
    });
    expect(m.guard).toHaveBeenCalledTimes(3);
  });
  it("expands a short grid and writes in the same batch", async () => {
    metadata.sheets[0].properties.gridProperties = {
      rowCount: 1,
      columnCount: 2,
    };
    answer.replies = [{}, {}, {}];
    await run();
    const req = JSON.parse(m.fetch.mock.calls[1][1].body).requests;
    expect(req[0]).toEqual({
      appendDimension: { sheetId: 12, dimension: "ROWS", length: 1 },
    });
    expect(req[1]).toEqual({
      appendDimension: { sheetId: 12, dimension: "COLUMNS", length: 4 },
    });
  });
  it.each([1, 2, 3])(
    "checks permission and connection at boundary %s",
    async boundary => {
      let n = 0;
      m.guard.mockImplementation(async () => {
        if (++n === boundary) throw Error("scope changed");
      });
      await expect(run()).rejects.toThrow("scope changed");
      expect(
        m.fetch.mock.calls.filter(c => c[1].method === "POST")
      ).toHaveLength(0);
    }
  );
  it.each(["wrongFile", "missing", "hidden", "wrongType", "duplicate"])(
    "does not write an ambiguous or invalid destination %s",
    async kind => {
      if (kind === "wrongFile") metadata.spreadsheetId = "foreign";
      if (kind === "missing") metadata.sheets = [];
      if (kind === "hidden") metadata.sheets[0].properties.hidden = true;
      if (kind === "wrongType")
        metadata.sheets[0].properties.sheetType = "OBJECT";
      if (kind === "duplicate")
        metadata.sheets.push({
          ...metadata.sheets[0],
          properties: { ...metadata.sheets[0].properties, sheetId: 13 },
        });
      await expect(run()).rejects.toMatchObject({ reason: "destination" });
      expect(m.fetch).toHaveBeenCalledTimes(1);
    }
  );
  it.each([
    "network",
    "http",
    "wrongFile",
    "missingReplies",
    "invalidJson",
    "large",
    "streamLarge",
  ])("marks a write response %s unconfirmed without retry", async kind => {
    m.fetch.mockImplementation(async (_u, o) => {
      if (o.method === "GET") return new Response(JSON.stringify(metadata));
      if (kind === "network") throw Error("secret URL");
      if (kind === "http")
        return new Response("private error", { status: 500 });
      if (kind === "wrongFile")
        return new Response(
          JSON.stringify({ ...answer, spreadsheetId: "foreign" })
        );
      if (kind === "missingReplies") return new Response("{}");
      if (kind === "invalidJson") return new Response("not JSON");
      if (kind === "large")
        return new Response("{}", { headers: { "content-length": "9999999" } });
      return new Response("x".repeat(524289));
    });
    await expect(run()).rejects.toMatchObject({
      message: "inventory_export:unconfirmed",
      reason: "unconfirmed",
    });
    expect(m.fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed destination, rows and credentials before any HTTP request", async () => {
    for (const patch of [
      { spreadsheetId: "https://evil.test" },
      { rows: [] },
      { rows: [[...row, "extra"]] },
      { auth: { ...auth, credentials: { access_token: "bad\r\ntoken" } } },
    ])
      await expect(run(patch)).rejects.toThrow();
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("disables OAuth retries, redirects and long requests", async () => {
    await run();
    const options = await m.interceptor.mock.calls[0][0].resolved({
      retry: true,
    });
    expect(options).toMatchObject({
      retry: false,
      maxRedirects: 0,
      timeout: 20000,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
