import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { hasPermission, type MerchantRole } from "./_core/permissions";
import { customerSourceCte } from "./customer-workspace";
import { orderMinor } from "../shared/order-workspace";
import {
  customerAnnotationsInput,
  customerAnnotationsSchema,
  customerAnnotationWrite,
  customerAnnotationReceiptInput,
  customerAnnotationReceipt,
  customerTags,
  type CustomerAnnotationReceipt,
} from "../shared/customer-annotations";

export class CustomerAnnotationMissing extends Error {}
export class CustomerAnnotationConflict extends Error {}
export class CustomerAnnotationForbidden extends Error {}
const id = z.number().int().positive().safe();
const count = {
  parse(value: unknown) {
    const result = orderMinor(value);
    if (result === null) throw Error("Invalid customer count");
    return result;
  },
};
const parseJson = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function transaction<T>(
  writes: boolean,
  run: (c: PoolConnection) => Promise<T>
): Promise<T> {
  await assertRuntimeSchema("customer annotations", [
    {
      table: "customer_workspace_tags",
      columns: ["customer_key", "revision", "tags"],
      uniqueIndexes: [
        {
          name: "uq_customer_workspace_tags",
          columns: ["merchant_id", "customer_key"],
        },
      ],
    },
    {
      table: "customer_workspace_notes",
      columns: ["merchant_id", "customer_key", "actor_id", "content"],
    },
    {
      table: "customer_annotation_receipts",
      columns: ["input_hash", "actor_id", "result"],
      uniqueIndexes: [
        {
          name: "uq_customer_annotation_request",
          columns: ["merchant_id", "request_id"],
        },
      ],
    },
  ]);
  const pool = await getPool();
  if (!pool) throw Error("Customers unavailable");
  const c = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await c.query(
      writes
        ? "SET TRANSACTION ISOLATION LEVEL READ COMMITTED"
        : "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
    );
    await c.beginTransaction();
    const result = await run(c);
    committing = true;
    await c.commit();
    return result;
  } catch (error) {
    if (committing) reusable = false;
    else
      try {
        await c.rollback();
      } catch {
        reusable = false;
      }
    throw error;
  } finally {
    if (reusable) c.release();
    else c.destroy();
  }
}
async function actor(c: PoolConnection, merchantId: number, actorId: number) {
  const [merchants] = await c.execute<any[]>(
    "SELECT id,userId,status FROM merchants WHERE id=? FOR UPDATE",
    [merchantId]
  );
  if (merchants.length !== 1) throw new CustomerAnnotationMissing();
  const merchant = merchants[0];
  const [users] = await c.execute<any[]>(
    "SELECT account_status FROM users WHERE id=? FOR SHARE",
    [actorId]
  );
  const [members] = await c.execute<any[]>(
    "SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE",
    [merchantId, actorId]
  );
  const role =
    members.length === 1 && Number(members[0].is_active) === 1
      ? members[0].role
      : members.length === 0 && Number(merchant.userId) === actorId
        ? "owner"
        : null;
  if (
    merchant.status === "suspended" ||
    users[0]?.account_status !== "active" ||
    !role ||
    !hasPermission(role as MerchantRole, "customers.manage")
  )
    throw new CustomerAnnotationForbidden();
}
async function identity(c: PoolConnection, merchantId: number, key: string) {
  const [clock] = await c.query<any[]>(
    "SELECT DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%dT%H:%i:%sZ') AS now"
  );
  if (clock.length !== 1) throw Error("Customer clock unavailable");
  const cte = customerSourceCte(
    merchantId,
    z.string().datetime().parse(clock[0].now)
  );
  const query = new MySqlDialect()
    .sqlToQuery(sql`${cte} SELECT customerKey FROM customers
    WHERE customerKey=CAST(${key} AS BINARY)`);
  const parameters = query.params.map(value =>
    z.union([z.string(), z.number().finite()]).parse(value)
  );
  const [rows] = await c.execute<any[]>(query.sql, parameters);
  if (rows.length !== 1) throw new CustomerAnnotationMissing();
  return String(rows[0].customerKey);
}
function receipt(
  row: any,
  merchantId: number,
  actorId: number,
  requestId: string
): CustomerAnnotationReceipt {
  if (Number(row.actor_id) !== actorId) throw new CustomerAnnotationConflict();
  const result = customerAnnotationReceipt.parse(parseJson(row.result));
  if (
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    result.requestId !== requestId
  )
    throw Error("Invalid customer receipt");
  return result;
}
export async function readCustomerAnnotations(
  merchantId: number,
  raw: unknown
) {
  id.parse(merchantId);
  const selection = customerAnnotationsInput.parse(raw);
  return transaction(false, async c => {
    const key = await identity(c, merchantId, selection.key);
    const [tagRows] = await c.execute<any[]>(
      "SELECT revision,tags FROM customer_workspace_tags WHERE merchant_id=? AND BINARY customer_key=BINARY ?",
      [merchantId, key]
    );
    if (tagRows.length > 1) throw Error("Invalid customer tags");
    const [counts] = await c.execute<any[]>(
      "SELECT COUNT(*) AS total FROM customer_workspace_notes WHERE merchant_id=? AND BINARY customer_key=BINARY ?",
      [merchantId, key]
    );
    if (counts.length !== 1) throw Error("Customer notes unavailable");
    const total = count.parse(counts[0].total);
    const [notes] = await c.query<any[]>(
      `SELECT id,actor_id,content,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt
      FROM customer_workspace_notes WHERE merchant_id=? AND BINARY customer_key=BINARY ? ORDER BY id DESC LIMIT 25 OFFSET ?`,
      [merchantId, key, (selection.page - 1) * 25]
    );
    return customerAnnotationsSchema.parse({
      merchantId,
      key,
      selection,
      canManage: false,
      revision: tagRows.length ? count.parse(tagRows[0].revision) : 0,
      tags: tagRows.length
        ? customerTags.parse(parseJson(tagRows[0].tags))
        : [],
      pagination: {
        page: selection.page,
        pageSize: 25,
        total,
        pages: Math.ceil(total / 25),
      },
      notes: notes.map(row => ({
        id: id.parse(Number(row.id)),
        actorId: id.parse(Number(row.actor_id)),
        content: row.content,
        createdAt: row.createdAt,
      })),
    });
  });
}
export async function writeCustomerAnnotation(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  id.parse(merchantId);
  id.parse(actorId);
  const input = customerAnnotationWrite.parse(raw),
    inputHash = digest(input);
  return transaction(true, async c => {
    await actor(c, merchantId, actorId);
    const [prior] = await c.execute<any[]>(
      "SELECT actor_id,input_hash,result FROM customer_annotation_receipts WHERE merchant_id=? AND request_id=? FOR UPDATE",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (prior.length !== 1 || prior[0].input_hash !== inputHash)
        throw new CustomerAnnotationConflict();
      return receipt(prior[0], merchantId, actorId, input.requestId);
    }
    const key = await identity(c, merchantId, input.key);
    let noteId: number | null = null,
      revision: number | null = null;
    if (input.kind === "note") {
      const [result] = await c.execute<any>(
        "INSERT INTO customer_workspace_notes (merchant_id,customer_key,actor_id,content) VALUES (?,?,?,?)",
        [merchantId, key, actorId, input.content]
      );
      noteId = id.parse(Number(result.insertId));
    } else {
      const [rows] = await c.execute<any[]>(
        "SELECT revision FROM customer_workspace_tags WHERE merchant_id=? AND BINARY customer_key=BINARY ? FOR UPDATE",
        [merchantId, key]
      );
      if (rows.length > 1) throw Error("Invalid customer tags");
      const current = rows.length ? count.parse(rows[0].revision) : 0;
      if (current !== input.expectedRevision || current >= 4294967295)
        throw new CustomerAnnotationConflict();
      revision = current + 1;
      if (rows.length) {
        const [result] = await c.execute<any>(
          "UPDATE customer_workspace_tags SET tags=?,revision=? WHERE merchant_id=? AND BINARY customer_key=BINARY ? AND revision=?",
          [JSON.stringify(input.tags), revision, merchantId, key, current]
        );
        if (Number(result.affectedRows) !== 1)
          throw new CustomerAnnotationConflict();
      } else
        await c.execute(
          "INSERT INTO customer_workspace_tags (merchant_id,customer_key,tags,revision) VALUES (?,?,?,?)",
          [merchantId, key, JSON.stringify(input.tags), revision]
        );
    }
    const [clock] = await c.query<any[]>(
      "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
    );
    const result = customerAnnotationReceipt.parse({
      merchantId,
      actorId,
      requestId: input.requestId,
      key,
      kind: input.kind,
      noteId,
      tags: input.kind === "tags" ? input.tags : null,
      revision,
      createdAt: clock[0]?.now,
    });
    await c.execute(
      "INSERT INTO customer_annotation_receipts (merchant_id,actor_id,request_id,input_hash,result) VALUES (?,?,?,?,?)",
      [merchantId, actorId, input.requestId, inputHash, JSON.stringify(result)]
    );
    return result;
  });
}
export async function readCustomerAnnotationReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  id.parse(merchantId);
  id.parse(actorId);
  const input = customerAnnotationReceiptInput.parse(raw);
  return transaction(false, async c => {
    const [rows] = await c.execute<any[]>(
      "SELECT actor_id,input_hash,result FROM customer_annotation_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (rows.length > 1) throw Error("Invalid customer receipts");
    return rows.length
      ? receipt(rows[0], merchantId, actorId, input.requestId)
      : null;
  });
}
