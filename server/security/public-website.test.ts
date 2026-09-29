import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ dns: vi.fn(), get: vi.fn() }));
vi.mock("node:dns/promises", () => ({ default: { lookup: m.dns } }));
vi.mock("axios", () => ({ default: { get: m.get } }));
import {
  publicWebsiteUrl,
  requestPublicWebsite,
  samePublicWebsiteOrigin,
} from "./public-website";
beforeEach(() => {
  vi.clearAllMocks();
  m.dns.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  m.get.mockResolvedValue({
    status: 200,
    headers: { "content-type": "text/html" },
    data: Buffer.from("<p>Public page</p>"),
  });
});
afterEach(() => vi.useRealTimers());
it("rejects sitemap prefix lookalikes, invalid URLs and other origins", () => {
  expect(
    samePublicWebsiteOrigin(
      "https://example.test.evil.test/map.xml",
      "https://example.test"
    )
  ).toBe(false);
  expect(samePublicWebsiteOrigin("not a url", "https://example.test")).toBe(
    false
  );
  expect(
    samePublicWebsiteOrigin(
      "https://example.test/map.xml",
      "https://example.test"
    )
  ).toBe(true);
});
it.each([
  "http://example.test",
  "https://127.0.0.1",
  "https://2130706433",
  "https://[::1]",
  "https://u:p@example.test",
  "https://example.test:8443",
  "https://internal",
  "https://a.local.",
  "https://a.internal",
  "file:///etc/passwd",
])("rejects unsafe input before DNS: %s", async url => {
  expect(() => publicWebsiteUrl(url)).toThrow("WEBSITE_URL_INVALID");
  await expect(requestPublicWebsite(url)).rejects.toThrow(
    "WEBSITE_URL_INVALID"
  );
  expect(m.dns).not.toHaveBeenCalled();
  expect(m.get).not.toHaveBeenCalled();
});
it.each([
  "127.0.0.1",
  "169.254.169.254",
  "10.1.2.3",
  "::ffff:7f00:1",
  "100.64.0.1",
  "2002:7f00:1::",
])("rejects a mixed public/private DNS answer %s", async address => {
  m.dns.mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
    { address, family: address.includes(":") ? 6 : 4 },
  ]);
  await expect(requestPublicWebsite("https://example.test")).rejects.toThrow(
    "WEBSITE_FETCH_FAILED"
  );
  expect(m.get).not.toHaveBeenCalled();
});
it("pins the DNS answer and bounds decompressed size, redirects, total time and proxies", async () => {
  const response = await requestPublicWebsite("https://example.test/a#hash");
  expect(await response.text()).toContain("Public page");
  const config = m.get.mock.calls[0][1];
  expect(config).toMatchObject({
    maxRedirects: 0,
    proxy: false,
    maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: 2 * 1024 * 1024,
  });
  expect(config.timeout).toBeLessThanOrEqual(15000);
  const cb = vi.fn();
  config.httpsAgent.options.lookup("example.test", { all: true }, cb);
  expect(cb).toHaveBeenCalledWith(null, [{ address: "8.8.8.8", family: 4 }]);
  expect(m.get.mock.calls[0][0]).toBe("https://example.test/a");
});
it("validates every redirect and blocks a second private socket", async () => {
  m.get.mockResolvedValueOnce({
    status: 302,
    headers: { location: "https://other.test/path" },
    data: Buffer.alloc(0),
  });
  m.dns
    .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
    .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
  await expect(requestPublicWebsite("https://example.test")).rejects.toThrow(
    "WEBSITE_FETCH_FAILED"
  );
  expect(m.get).toHaveBeenCalledTimes(1);
});
it("never forwards auth/cookies and drops store headers on a cross-origin redirect", async () => {
  m.get.mockResolvedValueOnce({
    status: 302,
    headers: { location: "https://other.test/path" },
    data: Buffer.alloc(0),
  });
  await requestPublicWebsite("https://example.test", {
    headers: {
      Authorization: "secret",
      Cookie: "secret",
      "store-id": "public-id",
      Origin: "https://example.test",
    },
  });
  expect(m.get.mock.calls[0][1].headers).toMatchObject({
    "store-id": "public-id",
  });
  for (const [, config] of m.get.mock.calls) {
    expect(config.headers).not.toHaveProperty("authorization");
    expect(config.headers).not.toHaveProperty("cookie");
  }
  expect(m.get.mock.calls[1][1].headers).not.toHaveProperty("store-id");
  expect(m.get.mock.calls[1][1].headers).not.toHaveProperty("origin");
});
it.each([
  "http://other.test",
  "https://user:secret@other.test",
  "https://127.0.0.1",
])("rejects unsafe redirect %s", async location => {
  m.get.mockResolvedValueOnce({
    status: 302,
    headers: { location },
    data: Buffer.alloc(0),
  });
  await expect(requestPublicWebsite("https://example.test")).rejects.toThrow(
    "WEBSITE_FETCH_FAILED"
  );
  expect(m.get).toHaveBeenCalledTimes(1);
});
it("limits redirect loops and rejects oversized bodies without exposing tokens", async () => {
  m.get.mockResolvedValue({
    status: 302,
    headers: { location: "/loop" },
    data: Buffer.alloc(0),
  });
  await expect(
    requestPublicWebsite("https://example.test/?token=secret")
  ).rejects.toThrow(/^WEBSITE_FETCH_FAILED$/);
  expect(m.get).toHaveBeenCalledTimes(4);
  m.get.mockResolvedValue({
    status: 200,
    headers: {},
    data: Buffer.alloc(2 * 1024 * 1024 + 1),
  });
  await expect(requestPublicWebsite("https://example.test")).rejects.toThrow(
    "WEBSITE_FETCH_FAILED"
  );
});
it("bounds stalled DNS before opening any connection", async () => {
  vi.useFakeTimers();
  m.dns.mockImplementation(() => new Promise(() => {}));
  const result = expect(
    requestPublicWebsite("https://example.test")
  ).rejects.toThrow("WEBSITE_FETCH_FAILED");
  await vi.advanceTimersByTimeAsync(5000);
  await result;
  expect(m.get).not.toHaveBeenCalled();
});
