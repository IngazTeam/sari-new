import { z } from "zod";
import {
  productImportInput,
  productImportCommitInput,
  productImportReceiptSchema,
  productImportReviewSchema,
  productImportReadInput,
  productImportField,
  type ProductImportInput,
} from "@shared/product-import";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const importOptionsSchema = z
  .object({
    currency: z.enum(["SAR", "USD"]),
    productType: z.enum(["physical", "digital", "service"]),
    status: z.enum(["active", "draft", "archived"]),
    delimiter: z.enum([",", ";", "\t"]),
    sheet: z.number().int().min(0).max(19),
    mapping: z
      .array(
        z
          .object({
            column: z.number().int().min(0).max(59),
            field: productImportField.nullable(),
          })
          .strict()
      )
      .max(60)
      .optional(),
  })
  .strict();
export const importAttemptSchema = z
  .object({
    reviewId: z.string().uuid(),
    fingerprint: hash,
    digest: hash.nullable(),
    attempt: productImportCommitInput.nullable(),
    receipt: productImportReceiptSchema.nullable(),
    options: importOptionsSchema.optional(),
  })
  .strict()
  .refine(
    value =>
      (!value.attempt ||
        (value.attempt.reviewId === value.reviewId &&
          value.attempt.expectedDigest === value.digest)) &&
      (!value.receipt ||
        (value.receipt.reviewId === value.reviewId &&
          value.receipt.digest === value.digest &&
          value.receipt.requestId === value.attempt?.requestId))
  );
export type ImportAttempt = z.infer<typeof importAttemptSchema>;
const prefix = "sary:product-import:v1:";
function key(scope: string) {
  if (!/^[1-9]\d*:[1-9]\d*:product-import$/.test(scope))
    throw Error("Invalid import scope");
  return prefix + scope;
}
function checked(scope: string, raw: unknown) {
  const value = importAttemptSchema.parse(raw),
    [actorId, merchantId] = scope.split(":").map(Number);
  if (
    value.receipt &&
    (value.receipt.actorId !== actorId ||
      value.receipt.merchantId !== merchantId)
  )
    throw Error("Import receipt scope mismatch");
  return value;
}
export function readImportAttempt(scope: string) {
  const raw = sessionStorage.getItem(key(scope));
  if (!raw) return null;
  if (raw.length > 100000) throw Error("Invalid import attempt");
  return checked(scope, JSON.parse(raw));
}
export function saveImportAttempt(
  scope: string,
  value: ImportAttempt,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const raw = JSON.stringify(checked(scope, value)),
    name = key(scope);
  if (raw.length > 100000) throw Error("Invalid import attempt");
  sessionStorage.setItem(name, raw);
  if (sessionStorage.getItem(name) !== raw)
    throw Error("Import recovery unavailable");
}
export function clearImportAttempt(scope: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const name = key(scope);
  sessionStorage.removeItem(name);
  if (sessionStorage.getItem(name) !== null)
    throw Error("Import recovery cleanup unavailable");
}
export function checkedImportReview(
  raw: unknown,
  scope: string,
  selection: z.infer<typeof productImportReadInput>
) {
  const data = productImportReviewSchema.parse(raw),
    [actorId, merchantId] = scope.split(":").map(Number);
  if (
    data.actorId !== actorId ||
    data.merchantId !== merchantId ||
    data.reviewId !== selection.reviewId ||
    JSON.stringify(data.selection) !== JSON.stringify(selection)
  )
    throw Error("Import review scope mismatch");
  if (
    data.receipt &&
    (data.receipt.actorId !== actorId ||
      data.receipt.merchantId !== merchantId ||
      data.receipt.reviewId !== selection.reviewId ||
      data.receipt.digest !== data.preview.digest ||
      data.receipt.count !== data.preview.total)
  )
    throw Error("Import review receipt mismatch");
  return data;
}
export function checkedImportReceipt(
  raw: unknown,
  scope: string,
  attempt: NonNullable<ImportAttempt["attempt"]>
) {
  const data = productImportReceiptSchema.parse(raw),
    [actorId, merchantId] = scope.split(":").map(Number);
  if (
    data.actorId !== actorId ||
    data.merchantId !== merchantId ||
    data.requestId !== attempt.requestId ||
    data.reviewId !== attempt.reviewId ||
    data.digest !== attempt.expectedDigest
  )
    throw Error("Import receipt mismatch");
  return data;
}
export type ImportOptions = {
  currency: "SAR" | "USD";
  productType: "physical" | "digital" | "service";
  status: "active" | "draft" | "archived";
  delimiter: "," | ";" | "\t";
  sheet: number;
  mapping?: ProductImportInput["mapping"];
};
export function importFileError(file: Pick<File, "name" | "size">) {
  const format = file.name.split(".").pop()?.toLowerCase();
  return !["csv", "xlsx"].includes(format || "")
    ? "file_type"
    : file.size === 0
      ? "empty_file"
      : file.size > (format === "csv" ? 5 : 10) * 1024 * 1024
        ? "file_size"
        : null;
}
export async function readImportFile(
  file: File,
  options: ImportOptions
): Promise<ProductImportInput> {
  const error = importFileError(file);
  if (error) throw Error(`product_import:${error}`);
  const bytes = new Uint8Array(await file.arrayBuffer()),
    { currency, productType, status, mapping } = options,
    base = { fileName: file.name, currency, productType, status, mapping };
  if (file.name.toLowerCase().endsWith(".csv")) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw Error("product_import:encoding");
    }
    return productImportInput.parse({
      ...base,
      format: "csv",
      csvData: text,
      delimiter: options.delimiter,
    });
  }
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 16384)
    chunks.push(
      String.fromCharCode(...Array.from(bytes.subarray(start, start + 16384)))
    );
  return productImportInput.parse({
    ...base,
    format: "xlsx",
    fileBase64: btoa(chunks.join("")),
    sheet: options.sheet,
  });
}
export async function fingerprintImportFile(input: ProductImportInput) {
  const bytes = new TextEncoder().encode(JSON.stringify(input)),
    digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, value => value.toString(16).padStart(2, "0")).join(
    ""
  );
}
export function productImportTemplate(
  type: "physical" | "service",
  language: string
) {
  return language.startsWith("en")
    ? `\uFEFFname,price,currency,description,stock,sku,product_type,status\r\n${type === "service" ? "Example service" : "Example product"},99.99,SAR,Replace this example before importing,,EXAMPLE-1,${type},draft\r\n`
    : `\uFEFFالاسم,السعر,العملة,الوصف,الكمية,رمز الصنف,نوع المنتج,الحالة\r\n${type === "service" ? "خدمة تجريبية" : "منتج تجريبي"},99.99,SAR,استبدل المثال ببياناتك قبل الاستيراد,,EXAMPLE-1,${type},draft\r\n`;
}
export function downloadImportText(text: string, name: string) {
  const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" })
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
