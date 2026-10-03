import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ llm: vi.fn(), request: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: m.llm }));
vi.mock("./security/public-website", async original => ({
  ...(await original<typeof import("./security/public-website")>()),
  requestPublicWebsite: m.request,
}));
import { extractProducts } from "./_core/websiteAnalyzer";
const html =
    "<html><body><p>" +
    "Local readable text. ".repeat(40) +
    "</p></body></html>",
  text = "Local readable text. ".repeat(40);
const run = () =>
  extractProducts("https://example.test/", html, text, 20, {
    requireVerifiedOutcome: true,
  });
beforeEach(() => {
  vi.resetAllMocks();
  for (const method of ["log", "warn", "error"] as const)
    vi.spyOn(console, method).mockImplementation(() => {});
  m.request.mockResolvedValue({ ok: false, status: 404, text: async () => "" });
  m.llm.mockResolvedValue({
    choices: [{ message: { content: '{"products":[]}' } }],
  });
});
afterEach(() => vi.restoreAllMocks());
it("accepts a successful verified empty result", async () =>
  expect(await run()).toEqual([]));
it.each([
  null,
  "not json",
  "{}",
  '{"products":null}',
  '{"products":[{"name":"Bad","price":"4"}]}',
])(
  "does not turn invalid provider output into an empty success: %s",
  async content => {
    m.llm.mockResolvedValue({ choices: [{ message: { content } }] });
    await expect(run()).rejects.toThrow("PRODUCT_EXTRACTION_UNAVAILABLE");
  }
);
it("does not turn an AI transport failure into an empty success", async () => {
  m.llm.mockRejectedValue(Error("PRIVATE_PROVIDER"));
  await expect(run()).rejects.toThrow("PRODUCT_EXTRACTION_UNAVAILABLE");
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "PRIVATE_PROVIDER"
  );
});
it("does not assert zero products when the page has too little evidence", async () => {
  await expect(
    extractProducts("https://example.test/", html, "", 20, {
      requireVerifiedOutcome: true,
    })
  ).rejects.toThrow("PRODUCT_EXTRACTION_UNAVAILABLE");
  expect(m.llm).not.toHaveBeenCalled();
});
it("preserves successful structured product extraction without requiring AI", async () => {
  const structured =
    '<html><script type="application/ld+json">{"@type":"Product","name":"Fixture","offers":{"price":"12.50","priceCurrency":"USD"}}</script></html>' +
    html;
  const result = await extractProducts(
    "https://example.test/",
    structured,
    text,
    20,
    { requireVerifiedOutcome: true }
  );
  expect(result[0]).toMatchObject({
    name: "Fixture",
    price: 12.5,
    currency: "USD",
  });
  expect(m.llm).not.toHaveBeenCalled();
});
it("keeps the legacy optional-extraction caller contract unchanged", async () => {
  m.llm.mockRejectedValue(Error("PRIVATE"));
  expect(
    await extractProducts("https://example.test/", html, text, 20)
  ).toEqual([]);
});
