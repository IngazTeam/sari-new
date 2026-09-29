import { readFileSync } from "node:fs";
import { getPool } from "../../db/connection";
import { assertDisposableDatabase } from "./disposable-merchant";
export async function ensureMerchantDirectiveTestSchema() {
  assertDisposableDatabase();
  const c = await (await getPool())!.getConnection();
  try {
    const [lock] = await c.query<any[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':merchant-directive-schema'),10) AS ok"
    );
    if (lock[0]?.ok !== 1) throw Error("Schema busy");
    const [rows] = await c.query<any[]>(
      "SHOW TABLES LIKE 'merchant_directive_actions'"
    );
    if (!rows.length)
      await c.query(
        readFileSync("drizzle/0159_merchant_directive_actions.sql", "utf8")
      );
  } finally {
    try {
      await c.query(
        "SELECT RELEASE_LOCK(CONCAT(DATABASE(),':merchant-directive-schema'))"
      );
    } finally {
      c.release();
    }
  }
}
