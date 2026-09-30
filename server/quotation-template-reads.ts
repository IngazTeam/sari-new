import { z } from "zod";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";

const id = z.number().int().positive().safe();
export interface QuotationTemplate {
  id: number;
  merchantId: number;
  name: string;
  headerImageUrl: string | null;
  footerText: string | null;
  termsText: string | null;
  isDefault: boolean;
  createdAt: Date;
}
const mapTemplate = (row: any): QuotationTemplate => ({
  id: Number(row.id),
  merchantId: Number(row.merchant_id),
  name: row.name,
  headerImageUrl: row.header_image_url,
  footerText: row.footer_text,
  termsText: row.terms_text,
  isDefault: Boolean(Number(row.is_default)),
  createdAt: new Date(row.created_at),
});
async function source(merchantId: number) {
  id.parse(merchantId);
  // Readiness checks inspect schema; visiting a page must never seed commercial terms.
  await assertRuntimeSchema("quotation templates", [
    { table: "quotation_templates" },
  ]);
  const pool = await getPool();
  if (!pool) throw Error("Quotation templates unavailable");
  return pool;
}
const columns =
  "id,merchant_id,name,header_image_url,footer_text,terms_text,is_default,created_at";
/** Compatibility list, bounded without silently hiding legacy records. */
export async function getTemplates(
  merchantId: number
): Promise<QuotationTemplate[]> {
  const pool = await source(merchantId);
  const [rows] = await pool.execute<any[]>(
    `SELECT ${columns} FROM quotation_templates WHERE merchant_id=? ORDER BY is_default DESC,created_at,id LIMIT 201`,
    [merchantId]
  );
  if (rows.length > 200)
    throw Error("Quotation template list requires pagination");
  return rows.map(mapTemplate);
}
/** An explicit template selection never falls back to another template. */
export async function getTemplateById(
  templateId: number,
  merchantId: number
): Promise<QuotationTemplate | null> {
  id.parse(templateId);
  const pool = await source(merchantId);
  const [rows] = await pool.execute<any[]>(
    `SELECT ${columns} FROM quotation_templates WHERE merchant_id=? AND id=? LIMIT 1`,
    [merchantId, templateId]
  );
  return rows.length ? mapTemplate(rows[0]) : null;
}
