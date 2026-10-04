import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const m = vi.hoisted(() => ({
  token: vi.fn(),
  credentials: vi.fn(),
  construct: vi.fn(),
  interceptor: vi.fn(),
  fetch: vi.fn(),
  check: vi.fn(),
}));
vi.mock("./_core/google-api-clients", () => ({
  google: {
    auth: {
      OAuth2: class {
        transporter = { interceptors: { request: { add: m.interceptor } } };
        constructor(options: unknown) {
          m.construct(options);
        }
        setCredentials = m.credentials;
        getAccessToken = m.token;
      },
    },
  },
}));
import { readProductSheetProvider } from "./product-sheet-provider";
const sheet = {
  id: 0,
  title: "O'Brien",
  hidden: false,
  rows: 1000,
  columns: 26,
};
const auth = {
  clientId: "test-client",
  clientSecret: "test-secret",
  credentials: {
    access_token: "old-token",
    refresh_token: "refresh-token",
    expiry_date: 1,
    token_type: "Bearer" as const,
  },
};
const props = {
  sheetId: 0,
  title: sheet.title,
  hidden: false,
  sheetType: "GRID",
  gridProperties: { rowCount: 1000, columnCount: 26 },
};
const metadata = {
  spreadsheetId: "test-sheet",
  sheets: [{ properties: props }],
};
const call = (selection?: any) =>
  readProductSheetProvider({
    spreadsheetId: "test-sheet",
    auth,
    assertCurrent: m.check,
    selection,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", m.fetch);
  m.token.mockResolvedValue({ token: "fresh-token" });
  m.check.mockResolvedValue(undefined);
  m.fetch.mockResolvedValue(new Response(JSON.stringify(metadata)));
});
afterEach(() => vi.unstubAllGlobals());
describe("bounded read-only Sheets provider", () => {
  it("reads inventory IDs and explicit zero without requiring or parsing a price", async () => {
    m.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...metadata,
          sheets: [
            {
              properties: props,
              data: [
                {
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: "id" } },
                        { userEnteredValue: { stringValue: "stock" } },
                        { userEnteredValue: { stringValue: "price" } },
                      ],
                    },
                    {
                      values: [
                        { userEnteredValue: { numberValue: 12 } },
                        { userEnteredValue: { numberValue: 0 } },
                        { userEnteredValue: { formulaValue: "=BAD()" } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })
      )
    );
    const result: any = await call({ sheet, kind: "inventory", options: {} });
    expect(result.kind).toBe("sheet_inventory");
    expect(result.rows[0]).toMatchObject({
      productId: 12,
      stock: 0,
      issues: [],
    });
    expect(result.rows[0].cells[2].issue).toBe("formula");
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(m.fetch.mock.calls[0][1].method).toBe("GET");
    expect(m.check).toHaveBeenCalledTimes(3);
  });
  it.each([
    { currency: "SAR" },
    { mapping: { productId: 0, stock: 0 } },
    { mapping: { productId: 0, stock: 60 } },
  ])("rejects unsafe inventory options before OAuth %#", async options => {
    await expect(call({ sheet, kind: "inventory", options })).rejects.toThrow();
    expect(m.token).not.toHaveBeenCalled();
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it("uses one GET to the fixed Google endpoint with restricted fields, fresh auth and checks", async () => {
    expect(await call()).toEqual([sheet]);
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(m.check).toHaveBeenCalledTimes(3);
    const [url, options] = m.fetch.mock.calls[0];
    expect(url.origin).toBe("https://sheets.googleapis.com");
    expect(url.pathname).toBe("/v4/spreadsheets/test-sheet");
    expect(url.searchParams.has("ranges")).toBe(false);
    expect(url.searchParams.get("fields")).not.toContain("rowData");
    expect(options).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: { Authorization: "Bearer fresh-token" },
    });
    expect(options.body).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(m.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        transporterOptions: { timeout: 20000, retry: false },
      })
    );
    expect(m.credentials).toHaveBeenCalledWith(auth.credentials);
    const config = await m.interceptor.mock.calls[0][0].resolved({
      retry: true,
      timeout: 0,
    });
    expect(config).toMatchObject({
      retry: false,
      timeout: 20000,
      maxRedirects: 0,
    });
    expect(config.signal).toBeInstanceOf(AbortSignal);
  });
  it("reads the selected bounded grid with original and effective values", async () => {
    const grid = {
      ...metadata,
      sheets: [
        {
          properties: props,
          data: [
            {
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: "name" } },
                    { userEnteredValue: { stringValue: "price" } },
                  ],
                },
                {
                  values: [
                    { userEnteredValue: { stringValue: "Coffee" } },
                    { userEnteredValue: { numberValue: 0 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    m.fetch.mockResolvedValue(new Response(JSON.stringify(grid)));
    const r: any = await call({
      sheet,
      options: { sheetId: 0, currency: "SAR" },
    });
    expect(r.preview.rows[0].fields).toMatchObject({
      name: "Coffee",
      price: "0",
    });
    const url = m.fetch.mock.calls[0][0];
    expect(url.searchParams.get("ranges")).toBe("'O''Brien'!A1:Z1000");
    expect(url.searchParams.get("fields")).toContain(
      "userEnteredValue,effectiveValue"
    );
  });
  it.each([1, 2, 3])(
    "withholds access when the source check %s fails",
    async at => {
      let n = 0;
      m.check.mockImplementation(async () => {
        if (++n === at) throw Error("source changed");
      });
      await expect(call()).rejects.toThrow("source changed");
      expect(m.fetch).toHaveBeenCalledTimes(at === 3 ? 1 : 0);
      expect(m.token).toHaveBeenCalledTimes(at === 1 ? 0 : 1);
    }
  );
  it.each([401, 403, 404, 429, 500])(
    "rejects %s without leaking provider content or retrying",
    async status => {
      m.fetch.mockResolvedValue(
        new Response("private token=secret", { status })
      );
      await expect(call()).rejects.toThrow(
        status === 401 || status === 403 ? "authentication" : "unavailable"
      );
      expect(m.fetch).toHaveBeenCalledTimes(1);
    }
  );
  it("redacts authentication and transport failures", async () => {
    m.token.mockRejectedValue(Error("secret=private"));
    await expect(call()).rejects.toThrow(
      "product_sheet_provider:authentication"
    );
    expect(m.fetch).not.toHaveBeenCalled();
    m.token.mockResolvedValue({ token: "fresh-token" });
    m.fetch.mockRejectedValue(Error("private request headers"));
    await expect(call()).rejects.toThrow("product_sheet_provider:unavailable");
  });
  it.each(["length", "stream", "json", "utf8"])(
    "rejects bad %s and releases the body",
    async kind => {
      const body =
        kind === "stream"
          ? "x".repeat(8 * 1024 * 1024 + 1)
          : kind === "utf8"
            ? new Uint8Array([0xc3, 0x28])
            : "not json";
      const r = new Response(
        body,
        kind === "length"
          ? { headers: { "content-length": String(8 * 1024 * 1024 + 1) } }
          : undefined
      );
      m.fetch.mockResolvedValue(r);
      await expect(call()).rejects.toThrow(
        kind === "length" || kind === "stream"
          ? "response_size"
          : "response_invalid"
      );
      expect(r.body?.locked).toBe(false);
      expect(m.fetch).toHaveBeenCalledTimes(1);
    }
  );
  it.each(["https://attacker.example/x", "../secret", "sheet\r\nheader"])(
    "rejects arbitrary destination %s before auth",
    async spreadsheetId => {
      await expect(
        readProductSheetProvider({
          spreadsheetId,
          auth,
          assertCurrent: m.check,
        })
      ).rejects.toThrow();
      expect(m.token).not.toHaveBeenCalled();
      expect(m.fetch).not.toHaveBeenCalled();
    }
  );
  it("rejects missing tokens and CRLF credentials", async () => {
    m.token.mockResolvedValue({ token: null });
    await expect(call()).rejects.toThrow("authentication");
    expect(m.fetch).not.toHaveBeenCalled();
    await expect(
      readProductSheetProvider({
        spreadsheetId: "test-sheet",
        auth: { ...auth, clientSecret: "x\r\ny" },
        assertCurrent: m.check,
      })
    ).rejects.toThrow("authentication");
  });
});
