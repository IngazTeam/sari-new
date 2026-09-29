import { beforeEach, it, expect, vi } from "vitest";
import { JSDOM } from "jsdom";
const m = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./security/public-website", async original => ({
  ...(await original<typeof import("./security/public-website")>()),
  requestPublicWebsite: m.request,
}));
import {
  scrapeWebsite,
  discoverPages,
  smartCrawl,
} from "./_core/websiteAnalyzer";
const text =
  "Public source content that is long enough to review without running any scripts on the server.";
const result = (html: string, mime = "text/html") => ({
  ok: true,
  status: 200,
  url: "https://final.example.test/base/",
  headers: { get: () => mime },
  text: async () => html,
});
beforeEach(() => {
  vi.clearAllMocks();
  m.request.mockResolvedValue(result(`<p>${text}</p>`));
});
it("reads static text without executing scripts, fetching images or following frames", async () => {
  m.request.mockResolvedValue(
    result(
      `<script>window.compromised=true</script><iframe src="http://127.0.0.1/private"></iframe><img src="http://127.0.0.1/image"><p>${text}</p>`
    )
  );
  const r = await scrapeWebsite("https://example.test");
  try {
    expect(r.text).toBe(text);
    expect((r.dom.window as any).compromised).toBeUndefined();
    expect(r.dom.window.document.querySelector("iframe")).toBeNull();
    expect(m.request).toHaveBeenCalledTimes(1);
  } finally {
    r.dom.window.close();
  }
});
it("resolves page links against the validated final URL after a redirect", async () => {
  m.request.mockResolvedValue(
    result(
      `<p>${text}</p><a href="shipping">Shipping</a><a href="https://final.example.test.evil.test/returns">Returns</a>`
    )
  );
  const r = await scrapeWebsite("https://example.test");
  try {
    expect(discoverPages(r.dom, "https://example.test")).toEqual([
      {
        pageType: "shipping",
        title: "Shipping",
        url: "https://final.example.test/base/shipping",
      },
    ]);
  } finally {
    r.dom.window.close();
  }
});
it.each(["application/pdf", "image/svg+xml", "application/octet-stream"])(
  "rejects %s before interpreting it as a website",
  async mime => {
    m.request.mockResolvedValue(result(text, mime));
    await expect(scrapeWebsite("https://example.test")).rejects.toThrow(
      "WEBSITE_FETCH_FAILED"
    );
  }
);
it("does not launch a browser or retry via a weaker transport for a dynamic-only shell", async () => {
  m.request.mockResolvedValue(
    result('<div id="app"></div><script src="/bundle.js"></script>')
  );
  await expect(scrapeWebsite("https://example.test")).rejects.toThrow(
    "WEBSITE_NO_READABLE_TEXT"
  );
  expect(m.request).toHaveBeenCalledTimes(1);
});
it("keeps script-like plain text inert", async () => {
  m.request.mockResolvedValue(
    result(`<script>window.compromised=true</script> ${text}`, "text/plain")
  );
  const r = await scrapeWebsite("https://example.test");
  try {
    expect(r.text).toContain("<script>");
    expect((r.dom.window as any).compromised).toBeUndefined();
  } finally {
    r.dom.window.close();
  }
});
it("crawls only discovered same-origin links through the guarded transport", async () => {
  const home = new JSDOM(
    '<a href="/about">About</a><a href="https://other.test/contact">Contact</a>',
    { url: "https://example.test/" }
  );
  try {
    const r = await smartCrawl("https://example.test/", home, 3);
    expect(r.pages).toHaveLength(1);
    expect(m.request).toHaveBeenCalledWith(
      "https://example.test/about",
      expect.any(Object)
    );
  } finally {
    home.window.close();
  }
});
