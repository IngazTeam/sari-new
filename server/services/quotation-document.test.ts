import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../security/download-media", () => ({
  downloadPublicMedia: mocks.download,
}));
import {
  prepareQuotationDocument,
  quotationDocumentInput,
  quotationLogoMime,
  safeQuotationLogoDataUrl,
} from "./quotation-document";

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
function png(width = 1, height = 1) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
function jpeg(width = 1, height = 1) {
  const bytes = Buffer.from([255, 216, 255, 192, 0, 8, 8, 0, 1, 0, 1, 0]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes;
}
beforeEach(() => vi.resetAllMocks());
describe("bounded quotation material", () => {
  it("accepts reconciled amounts and rejects contradictory totals", () => {
    expect(quotationDocumentInput.parse(document()).total).toBe(34.53);
    expect(
      quotationDocumentInput.safeParse({ ...document(), total: 34.54 }).success
    ).toBe(false);
    expect(
      quotationDocumentInput.safeParse({
        ...document(),
        subtotal: 30.04,
        total: 34.54,
      }).success
    ).toBe(false);
  });
  it.each([NaN, Infinity, -1, 0.001, 100000000])(
    "rejects invalid money %s before any fetch",
    async value => {
      await expect(
        prepareQuotationDocument({
          ...document(),
          total: value,
          merchantLogo: "https://cdn.example/logo",
        })
      ).rejects.toThrow();
      expect(mocks.download).not.toHaveBeenCalled();
    }
  );
  it("bounds item count, names, quantities and currency without discarding invalid rows", () => {
    for (const change of [
      { items: [] },
      { items: Array(201).fill(document().items[0]) },
      { currency: "<svg>" },
      { items: [{ ...document().items[0], quantity: 0 }] },
      { items: [{ ...document().items[0], name: "x".repeat(501) }] },
      { privateToken: "x" },
    ]) {
      expect(
        quotationDocumentInput.safeParse({ ...document(), ...change }).success
      ).toBe(false);
    }
  });
  it("does not fetch when no merchant logo exists", async () => {
    expect(await prepareQuotationDocument(document())).toEqual({
      data: document(),
      logoDataUrl: null,
      logoOmitted: false,
    });
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("embeds a bounded fetched raster and removes the original signed URL", async () => {
    mocks.download.mockResolvedValue({ data: png(), contentType: "text/html" });
    const result = await prepareQuotationDocument({
      ...document(),
      merchantLogo: "https://cdn.example/logo?token=secret",
    });
    expect(mocks.download).toHaveBeenCalledWith(
      "https://cdn.example/logo?token=secret",
      1024 * 1024
    );
    expect(result.logoDataUrl).toBe(
      `data:image/png;base64,${png().toString("base64")}`
    );
    expect(result.logoOmitted).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it.each(['<svg onload="alert(1)">', "<html>unsafe</html>", "RIFF....WEBP"])(
    "omits unsupported image content %s",
    async content => {
      mocks.download.mockResolvedValue({ data: Buffer.from(content) });
      expect(
        await prepareQuotationDocument({
          ...document(),
          merchantLogo: "https://cdn.example/logo",
        })
      ).toMatchObject({ logoDataUrl: null, logoOmitted: true });
    }
  );
  it("omits unavailable or blocked logos without exposing source URL or error", async () => {
    mocks.download.mockRejectedValue(Error("secret URL"));
    const result = await prepareQuotationDocument({
      ...document(),
      merchantLogo: "https://127.0.0.1/private",
    });
    expect(result).toEqual({
      data: document(),
      logoDataUrl: null,
      logoOmitted: true,
    });
  });
});
describe("raster header boundary", () => {
  it("recognizes bounded PNG and JPEG headers", () => {
    expect(quotationLogoMime(png())).toBe("image/png");
    expect(quotationLogoMime(jpeg())).toBe("image/jpeg");
  });
  it.each([
    [0, 1],
    [1, 0],
    [4097, 1],
    [1, 4097],
    [4096, 4096],
  ])("rejects unsafe raster dimensions %s × %s", (width, height) => {
    expect(quotationLogoMime(png(width, height))).toBeNull();
    expect(quotationLogoMime(jpeg(width, height))).toBeNull();
  });
  it("rejects truncation, malformed JPEG segment lengths, absent dimensions and oversized bytes", () => {
    for (const data of [
      Buffer.alloc(0),
      png().subarray(0, 24),
      jpeg().subarray(0, 11),
      Buffer.from([255, 216, 255, 192, 0, 1]),
      Buffer.from([255, 216, 255, 218]),
      Buffer.alloc(1024 * 1024 + 1),
      Buffer.from([255, 216, 255, 255, 255, 255]),
    ])
      expect(quotationLogoMime(data)).toBeNull();
  });
  it("allows only an image data URL whose MIME matches the bounded bytes", () => {
    const encoded = png().toString("base64");
    expect(
      safeQuotationLogoDataUrl(`data:image/png;base64,${encoded}`)
    ).toBeTruthy();
    for (const value of [
      null,
      "https://cdn.example/a",
      `data:image/jpeg;base64,${encoded}`,
      `data:image/svg+xml;base64,${encoded}`,
      `data:image/png;base64,${encoded}\" onerror=\"alert(1)`,
      `data:image/png;base64,${"A".repeat(1400000)}`,
    ])
      expect(safeQuotationLogoDataUrl(value)).toBeNull();
  });
});
