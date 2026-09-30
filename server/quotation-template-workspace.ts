import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import {
  quotationActor,
  quotationClock,
  quotationDigest,
} from "./quotation-review";
import { QuotationConflict, QuotationUnavailable } from "./quotation-mutations";
import {
  templateFields,
  templateWriteInput,
  templateReceipt,
  templateReceiptInput,
  templateListInput,
  type TemplateRecord,
  type TemplateReceipt,
} from "../shared/quotation-templates";

const id = z.number().int().positive().safe();
export class QuotationTemplateLimit extends Error {}
const fields = (row: any) => ({
  name: row.name,
  headerImageUrl: row.header_image_url,
  footerText: row.footer_text,
  termsText: row.terms_text,
  isDefault: Boolean(Number(row.is_default)),
});
const digest = (row: any) =>
  quotationDigest({
    merchantId: Number(row.merchant_id),
    id: Number(row.id),
    ...fields(row),
  });
const selection = `id,merchant_id,LEFT(name,256) name,LEFT(header_image_url,501) header_image_url,
 LEFT(footer_text,5001) footer_text,LEFT(terms_text,5001) terms_text,is_default,
 (CHAR_LENGTH(name)>255 OR COALESCE(CHAR_LENGTH(header_image_url),0)>500 OR COALESCE(CHAR_LENGTH(footer_text),0)>5000 OR COALESCE(CHAR_LENGTH(terms_text),0)>5000) truncated,
 DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') created_at`;
function record(row: any): TemplateRecord {
  const value = fields(row),
    truncated = Boolean(Number(row.truncated));
  return {
    ...value,
    id: Number(row.id),
    merchantId: Number(row.merchant_id),
    digest: digest(row),
    createdAt: row.created_at,
    truncated,
    editable: !truncated && templateFields.safeParse(value).success,
  };
}
async function transaction<T>(
  writes: boolean,
  run: (c: PoolConnection) => Promise<T>
): Promise<T> {
  await assertRuntimeSchema("quotation template workspace", [
    { table: "quotation_templates" },
    ...(writes
      ? [
          {
            table: "quotation_template_receipts",
            columns: ["input_hash", "actor_id", "result"],
            uniqueIndexes: [
              {
                name: "uq_quotation_template_request",
                columns: ["merchant_id", "request_id"],
              },
            ],
          },
          { table: "sari_activity_log" },
        ]
      : []),
  ]);
  const pool = await getPool();
  if (!pool) throw Error("Quotation templates unavailable");
  const c = await pool.getConnection();
  try {
    if (!writes)
      await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.beginTransaction();
    const result = await run(c);
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
export async function readTemplateWorkspace(merchantId: number, raw: unknown) {
  id.parse(merchantId);
  const input = templateListInput.parse(raw);
  return transaction(false, async c => {
    const [counts] = await c.execute<any[]>(
      "SELECT COUNT(*) total,COALESCE(SUM(LOCATE(?,name)>0),0) filtered FROM quotation_templates WHERE merchant_id=?",
      [input.search, merchantId]
    );
    const total = Number(counts[0].total),
      filtered = Number(counts[0].filtered),
      pages = Math.max(1, Math.ceil(filtered / 20)),
      page = Math.min(input.page, pages);
    const [rows] = await c.query<any[]>(
      `SELECT ${selection} FROM quotation_templates WHERE merchant_id=? AND LOCATE(?,name)>0 ORDER BY is_default DESC,created_at,id LIMIT 20 OFFSET ?`,
      [merchantId, input.search, (page - 1) * 20]
    );
    return {
      merchantId,
      selection: input,
      page,
      pageSize: 20 as const,
      total,
      filtered,
      pages,
      limit: 20 as const,
      items: rows.map(record),
    };
  });
}
export async function readTemplateDetail(
  merchantId: number,
  templateId: number
) {
  id.parse(merchantId);
  id.parse(templateId);
  return transaction(false, async c => {
    const [rows] = await c.execute<any[]>(
      `SELECT ${selection} FROM quotation_templates WHERE merchant_id=? AND id=?`,
      [merchantId, templateId]
    );
    return rows.length ? record(rows[0]) : null;
  });
}
function saved(
  row: any,
  merchantId: number,
  actorId: number,
  requestId: string
): TemplateReceipt {
  const value = templateReceipt.parse(
    typeof row.result === "string" ? JSON.parse(row.result) : row.result
  );
  if (
    value.merchantId !== merchantId ||
    value.actorId !== actorId ||
    value.requestId !== requestId ||
    value.action !== row.action
  )
    throw Error("Invalid template receipt");
  return value;
}
export async function writeQuotationTemplate(
  merchantId: number,
  actorId: number,
  raw: unknown
): Promise<TemplateReceipt> {
  id.parse(merchantId);
  id.parse(actorId);
  const input = templateWriteInput.parse(raw),
    hash = quotationDigest(input);
  return transaction(true, async c => {
    // Shared merchant lock serializes template caps/defaults and quotation send review.
    await quotationActor(c, merchantId, actorId);
    const [prior] = await c.execute<any[]>(
      "SELECT actor_id,action,input_hash,result FROM quotation_template_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (Number(prior[0].actor_id) !== actorId || prior[0].input_hash !== hash)
        throw new QuotationConflict();
      return saved(prior[0], merchantId, actorId, input.requestId);
    }
    let recordId: number,
      resultDigest: string | null = null;
    if (input.action === "create") {
      const [count] = await c.execute<any[]>(
        "SELECT COUNT(*) total FROM quotation_templates WHERE merchant_id=?",
        [merchantId]
      );
      if (Number(count[0].total) >= 20) throw new QuotationTemplateLimit();
      const f = input.fields;
      if (f.isDefault)
        await c.execute(
          "UPDATE quotation_templates SET is_default=0 WHERE merchant_id=?",
          [merchantId]
        );
      const [created] = await c.execute<any>(
        "INSERT INTO quotation_templates (merchant_id,name,header_image_url,footer_text,terms_text,is_default) VALUES (?,?,?,?,?,?)",
        [
          merchantId,
          f.name,
          f.headerImageUrl,
          f.footerText,
          f.termsText,
          f.isDefault ? 1 : 0,
        ]
      );
      recordId = Number(created.insertId);
      resultDigest = quotationDigest({ merchantId, id: recordId, ...f });
    } else {
      const [rows] = await c.execute<any[]>(
        `SELECT ${selection} FROM quotation_templates WHERE merchant_id=? AND id=? FOR UPDATE`,
        [merchantId, input.id]
      );
      if (rows.length !== 1) throw new QuotationUnavailable();
      // Reject oversized legacy content: a clipped preview cannot authorize replacing it.
      const current = record(rows[0]);
      if (current.truncated || current.digest !== input.expectedDigest)
        throw new QuotationConflict();
      recordId = input.id;
      if (input.action === "delete")
        await c.execute(
          "DELETE FROM quotation_templates WHERE merchant_id=? AND id=?",
          [merchantId, recordId]
        );
      else {
        const f = input.fields;
        // Existence and reviewed contents are checked before clearing any other default.
        if (f.isDefault)
          await c.execute(
            "UPDATE quotation_templates SET is_default=0 WHERE merchant_id=?",
            [merchantId]
          );
        await c.execute(
          "UPDATE quotation_templates SET name=?,header_image_url=?,footer_text=?,terms_text=?,is_default=? WHERE merchant_id=? AND id=?",
          [
            f.name,
            f.headerImageUrl,
            f.footerText,
            f.termsText,
            f.isDefault ? 1 : 0,
            merchantId,
            recordId,
          ]
        );
        resultDigest = quotationDigest({ merchantId, id: recordId, ...f });
      }
    }
    const result: TemplateReceipt = {
      version: "quotation-template-receipt.v1",
      merchantId,
      actorId,
      requestId: input.requestId,
      action: input.action,
      recordId,
      digest: resultDigest,
      committedAt: await quotationClock(c),
    };
    await c.execute(
      "INSERT INTO quotation_template_receipts (merchant_id,actor_id,request_id,action,input_hash,result) VALUES (?,?,?,?,?,?)",
      [
        merchantId,
        actorId,
        input.requestId,
        input.action,
        hash,
        JSON.stringify(result),
      ]
    );
    await c.execute(
      "INSERT INTO sari_activity_log (merchant_id,action_type,description,details) VALUES (?,?,?,?)",
      [
        merchantId,
        "quotation_template_saved",
        "تم حفظ إجراء القالب محليًا؛ لا يضيف شروطًا إلى عروض سابقة",
        JSON.stringify(result),
      ]
    );
    return result;
  });
}
export async function readTemplateReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  id.parse(merchantId);
  id.parse(actorId);
  const { requestId } = templateReceiptInput.parse(raw);
  return transaction(true, async c => {
    await quotationActor(c, merchantId, actorId);
    const [rows] = await c.execute<any[]>(
      "SELECT actor_id,action,result FROM quotation_template_receipts WHERE merchant_id=? AND actor_id=? AND request_id=?",
      [merchantId, actorId, requestId]
    );
    return rows.length ? saved(rows[0], merchantId, actorId, requestId) : null;
  });
}
