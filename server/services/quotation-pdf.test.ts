import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  launch: vi.fn(),
  executable: vi.fn(),
  storage: vi.fn(),
  close: vi.fn(),
  page: {
    setJavaScriptEnabled: vi.fn(),
    setOfflineMode: vi.fn(),
    setRequestInterception: vi.fn(),
    on: vi.fn(),
    setContent: vi.fn(),
    evaluate: vi.fn(),
    pdf: vi.fn(),
  },
}));
vi.mock("../security/download-media", () => ({
  downloadPublicMedia: mocks.download,
}));
vi.mock("../browser/chromium-runtime", () => ({
  resolveChromiumExecutable: mocks.executable,
  chromiumLaunchArgs: () => ["--disable-dev-shm-usage"],
}));
vi.mock("puppeteer-core", () => ({ launch: mocks.launch }));
vi.mock("../storage", () => ({ storagePut: mocks.storage }));
import {
  buildQuotationHTML,
  generateQuotationPDF,
  renderPreparedQuotationPDF,
} from "./quotation-pdf";
const document = () => ({
  quotationNumber: "Q-test",
  merchantName: "متجر الفحص",
  items: [{ name: "خدمة", quantity: 3, unitPrice: 10.01, total: 30.03 }],
  subtotal: 30.03,
  taxAmount: 4.5,
  total: 34.53,
  currency: "SAR",
  createdAt: "2026-09-30",
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.executable.mockReturnValue("/trusted/chromium");
  mocks.launch.mockResolvedValue({
    newPage: async () => mocks.page,
    close: mocks.close,
  });
  mocks.page.evaluate.mockResolvedValue(undefined);
  mocks.page.pdf.mockResolvedValue(Buffer.from("%PDF-fixture"));
  mocks.storage.mockImplementation(async (key: string) => ({
    url: `https://storage.example/${key}`,
  }));
});
afterEach(() => vi.useRealTimers());
describe("quotation HTML", () => {
  it("escapes every supplied text surface, including date and fallback brand initial", () => {
    const attack = '<svg onload="alert(1)">';
    const html = buildQuotationHTML({
      ...document(),
      merchantName: attack,
      createdAt: attack,
      quotationNumber: attack,
      customerName: attack,
      customerPhone: attack,
      merchantPhone: attack,
      validUntil: attack,
      termsText: attack,
      footerText: attack,
      items: [{ ...document().items[0], name: attack, description: attack }],
    });
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;svg onload=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('class="brand-mark">&lt;</div>');
    expect(html).toContain("34.53 SAR");
  });
  it("has an offline policy and local embedded Arabic fonts; no raw logo URL reaches HTML", () => {
    const html = buildQuotationHTML({
      ...document(),
      merchantLogo: "http://169.254.169.254/private?token=secret",
    });
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toContain("169.254");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("http://");
    expect(html).toContain("#244238");
    expect(html).not.toContain("#7c3aed");
  });
  it("does not infer a historical tax rate", () => {
    expect(buildQuotationHTML(document())).not.toContain("(15%)");
    expect(buildQuotationHTML({ ...document(), taxRate: 0.15 })).toContain(
      "(15%)"
    );
  });
});
describe("offline renderer and storage", () => {
  it("refuses changed reviewed HTML before launching Chromium", async () => {
    await expect(
      renderPreparedQuotationPDF(
        { data: document(), logoDataUrl: null, logoOmitted: false },
        "a".repeat(64)
      )
    ).rejects.toThrow("Reviewed document layout changed");
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("disables scripts and networking before parsing HTML and bounds rendering", async () => {
    await generateQuotationPDF(document());
    expect(mocks.page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(mocks.page.setOfflineMode).toHaveBeenCalledWith(true);
    expect(mocks.page.setRequestInterception).toHaveBeenCalledWith(true);
    expect(mocks.page.setOfflineMode.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.page.setContent.mock.invocationCallOrder[0]
    );
    expect(mocks.page.setContent).toHaveBeenCalledWith(expect.any(String), {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    expect(mocks.page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 15000, format: "A4" })
    );
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it.each([
    "https://cdn.example/font",
    "http://169.254.169.254/",
    "file:///etc/passwd",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "javascript:alert(1)",
  ])("blocks browser resource %s", async url => {
    await generateQuotationPDF(document());
    const request = {
      url: () => url,
      abort: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    };
    mocks.page.on.mock.calls[0][1](request);
    expect(request.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(request.continue).not.toHaveBeenCalled();
  });
  it.each([
    "data:image/png;base64,YQ==",
    "data:image/jpeg;base64,YQ==",
    "data:font/woff2;base64,YQ==",
  ])("allows only embedded raster/font request %s", async url => {
    await generateQuotationPDF(document());
    const request = {
      url: () => url,
      abort: vi.fn(),
      continue: vi.fn().mockResolvedValue(undefined),
    };
    mocks.page.on.mock.calls[0][1](request);
    expect(request.continue).toHaveBeenCalledOnce();
    expect(request.abort).not.toHaveBeenCalled();
  });
  it("uses content-derived storage names so changing terms cannot overwrite the prior document", async () => {
    const first = await generateQuotationPDF(document());
    expect(await generateQuotationPDF(document())).toBe(first);
    expect(
      await generateQuotationPDF({ ...document(), termsText: "شروط جديدة" })
    ).not.toBe(first);
    expect(first).toMatch(/quote-[a-f0-9]{64}\.pdf$/);
    expect(mocks.storage).toHaveBeenCalledWith(
      expect.stringMatching(/^quotations\/quote-/),
      Buffer.from("%PDF-fixture"),
      "application/pdf"
    );
  });
  it("renders a prepared snapshot without fetching the logo again", async () => {
    await renderPreparedQuotationPDF({
      data: { ...document(), merchantLogo: "https://cdn.example/private" },
      logoDataUrl: null,
      logoOmitted: true,
    });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.page.setContent.mock.calls[0][0]).not.toContain("cdn.example");
  });
  it("rejects oversized output without uploading it, while always closing Chromium", async () => {
    mocks.page.pdf.mockResolvedValue(Buffer.alloc(5 * 1024 * 1024 + 1));
    await expect(generateQuotationPDF(document())).rejects.toThrow(
      "PDF too large"
    );
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("closes on renderer failure and never uploads an incomplete document", async () => {
    mocks.page.setContent.mockRejectedValue(Error("render failed"));
    await expect(generateQuotationPDF(document())).rejects.toThrow(
      "render failed"
    );
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("times out a stuck font preparation and closes Chromium", async () => {
    vi.useFakeTimers();
    mocks.page.evaluate.mockReturnValue(new Promise(() => {}));
    const pending = expect(generateQuotationPDF(document())).rejects.toThrow(
      "Font preparation timed out"
    );
    await vi.advanceTimersByTimeAsync(5001);
    await pending;
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("fails safely when Chromium is unavailable", async () => {
    mocks.executable.mockReturnValue(null);
    await expect(generateQuotationPDF(document())).rejects.toThrow(
      "Chromium not found"
    );
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});
