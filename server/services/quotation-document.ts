import { z } from "zod";
import { quotationMinor } from "../../shared/quotation-workspace";
import { downloadPublicMedia } from "../security/download-media";

const money = z
  .number()
  .finite()
  .nonnegative()
  .max(99999999.99)
  .refine(v => quotationMinor(v) !== null);
const optionalText = (max: number) => z.string().max(max).nullish();
export const quotationDocumentInput = z
  .object({
    quotationNumber: z.string().min(1).max(50),
    merchantName: z.string().min(1).max(255),
    merchantLogo: optionalText(8192),
    merchantPhone: optionalText(50),
    customerName: optionalText(255),
    customerPhone: optionalText(50),
    items: z
      .array(
        z
          .object({
            name: z.string().min(1).max(500),
            description: optionalText(1000),
            quantity: z.number().finite().positive().max(99999),
            unitPrice: money,
            total: money,
          })
          .strict()
      )
      .min(1)
      .max(200),
    subtotal: money,
    taxRate: z.number().finite().min(0).max(1).optional(),
    taxAmount: money,
    total: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
    validUntil: optionalText(50),
    termsText: optionalText(5000),
    footerText: optionalText(5000),
    createdAt: z.string().max(100),
  })
  .strict()
  .refine(
    v =>
      v.items.reduce((sum, item) => sum + quotationMinor(item.total)!, 0) ===
        quotationMinor(v.subtotal) &&
      quotationMinor(v.subtotal)! + quotationMinor(v.taxAmount)! ===
        quotationMinor(v.total),
    "Quotation amounts do not reconcile"
  );
export type QuotationData = z.infer<typeof quotationDocumentInput>;
export interface PreparedQuotationDocument {
  data: QuotationData;
  logoDataUrl: string | null;
  logoOmitted: boolean;
}
const logoLimit = 1024 * 1024;
function dimensionsAllowed(width: number, height: number) {
  return (
    width > 0 &&
    height > 0 &&
    width <= 4096 &&
    height <= 4096 &&
    width * height <= 8000000
  );
}
/** Only bounded raster data, never SVG/HTML or URLs, reaches the browser renderer. */
export function quotationLogoMime(
  data: Buffer
): "image/png" | "image/jpeg" | null {
  if (!data.length || data.length > logoLimit) return null;
  if (
    data.length >= 33 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.readUInt32BE(8) === 13 &&
    data.toString("ascii", 12, 16) === "IHDR"
  )
    return dimensionsAllowed(data.readUInt32BE(16), data.readUInt32BE(20))
      ? "image/png"
      : null;
  if (data.length < 4 || data[0] !== 255 || data[1] !== 216) return null;
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 255) return null;
    while (data[offset] === 255) offset++;
    const marker = data[offset++];
    if (marker === 217 || marker === 218) return null;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > data.length) return null;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) return null;
    if (
      [
        192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
      ].includes(marker)
    ) {
      if (length < 8) return null;
      return dimensionsAllowed(
        data.readUInt16BE(offset + 5),
        data.readUInt16BE(offset + 3)
      )
        ? "image/jpeg"
        : null;
    }
    offset += length;
  }
  return null;
}
export function safeQuotationLogoDataUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((logoLimit * 4) / 3) + 50
  )
    return null;
  const match =
    /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const data = Buffer.from(match[2], "base64");
  return quotationLogoMime(data) === match[1] ? value : null;
}
export async function prepareQuotationDocument(
  raw: unknown
): Promise<PreparedQuotationDocument> {
  const parsed = quotationDocumentInput.parse(raw),
    { merchantLogo, ...data } = parsed;
  if (!merchantLogo) return { data, logoDataUrl: null, logoOmitted: false };
  try {
    const downloaded = await downloadPublicMedia(merchantLogo, logoLimit),
      mime = quotationLogoMime(downloaded.data);
    if (!mime) throw Error("Unsupported logo");
    return {
      data,
      logoDataUrl: `data:${mime};base64,${downloaded.data.toString("base64")}`,
      logoOmitted: false,
    };
  } catch {
    return { data, logoDataUrl: null, logoOmitted: true };
  }
}
