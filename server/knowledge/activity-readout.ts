import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import {
  knowledgeActivityInput,
  knowledgeActivityPage,
  type KnowledgeActivityPage,
} from "../../shared/knowledge-activity";

/** Read-only, tenant-scoped feed. Listing history must never erase history. */
export async function readKnowledgeActivity(
  merchantId: number,
  raw: unknown
): Promise<KnowledgeActivityPage> {
  if (
    !Number.isInteger(merchantId) ||
    merchantId < 1 ||
    merchantId > 2147483647
  )
    throw Error("Invalid activity scope");
  const input = knowledgeActivityInput.parse(raw),
    requestedPage = input?.page ?? 1,
    pageSize = input?.pageSize ?? 15;
  await assertRuntimeSchema("Sari Brain activity log", [
    {
      table: "sari_activity_log",
      columns: ["merchant_id", "action_type", "description", "created_at"],
    },
  ]);
  const pool = await getPool();
  if (!pool) throw Error("Knowledge activity unavailable");
  const c = await pool.getConnection();
  let reusable = true;
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("SET TRANSACTION READ ONLY");
    await c.beginTransaction();
    const [merchant] = await c.execute<any[]>(
      "SELECT id FROM merchants WHERE id=?",
      [merchantId]
    );
    if (merchant.length !== 1) throw Error("Activity merchant unavailable");
    const action =
      input?.actionType && input.actionType !== "all" ? input.actionType : null;
    const filter = action ? " AND action_type=?" : "";
    const values = action ? [merchantId, action] : [merchantId];
    const [count] = await c.execute<any[]>(
      `SELECT COUNT(*) total FROM sari_activity_log WHERE merchant_id=?${filter}`,
      values
    );
    const total = Number(count[0]?.total);
    if (!Number.isSafeInteger(total) || total < 0)
      throw Error("Invalid activity count");
    const totalPages = Math.ceil(total / pageSize),
      page = Math.min(requestedPage, Math.max(1, totalPages)),
      offset = (page - 1) * pageSize;
    const [rows] = await c.execute<any[]>(
      `SELECT id,action_type,description,created_at FROM sari_activity_log WHERE merchant_id=?${filter} ORDER BY created_at DESC,id DESC LIMIT ${pageSize} OFFSET ${offset}`,
      values
    );
    const [types] = await c.execute<any[]>(
      "SELECT DISTINCT action_type FROM sari_activity_log WHERE merchant_id=? ORDER BY action_type LIMIT 201",
      [merchantId]
    );
    const actionTypes = types.slice(0, 200).map(row => String(row.action_type));
    if (action && !actionTypes.includes(action)) actionTypes.push(action);
    const result = knowledgeActivityPage.parse({
      merchantId,
      filter: action,
      items: rows.map(row => ({
        id: Number(row.id),
        actionType: row.action_type,
        description: row.description,
        details: null,
        createdAt:
          row.created_at instanceof Date &&
          !Number.isNaN(row.created_at.getTime())
            ? row.created_at.toISOString()
            : null,
      })),
      total,
      page,
      pageSize,
      totalPages,
      actionTypes,
      actionTypesTruncated: types.length > 200,
    });
    await c.commit();
    return result;
  } catch (error) {
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
