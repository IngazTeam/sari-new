import { readFileSync } from "node:fs";
import { getPool } from "../../db/connection";
import { assertDisposableDatabase } from "./disposable-merchant";
export async function ensureGroupTestSchema() {
  assertDisposableDatabase();
  const c = await (await getPool())!.getConnection();
  try {
    const [locked] = await c.query<any[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':group-understanding'),10) AS ok"
    );
    if (locked[0]?.ok !== 1) throw Error("Group schema locked");
    const [rows] = await c.query<any[]>(
      "SHOW TABLES LIKE 'ai_group_understanding'"
    );
    if (!rows.length)
      await c.query(
        readFileSync("drizzle/0165_group_understanding.sql", "utf8")
      );
  } finally {
    try {
      await c.query(
        "SELECT RELEASE_LOCK(CONCAT(DATABASE(),':group-understanding'))"
      );
    } finally {
      c.release();
    }
  }
}
