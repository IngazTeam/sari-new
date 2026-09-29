import { readFileSync } from "node:fs";
import { getPool } from "../../db/connection";
import { assertDisposableDatabase } from "./disposable-merchant";
export async function ensureCoachingTestSchema() {
  assertDisposableDatabase();
  const connection = await (await getPool())!.getConnection();
  try {
    const [lock] = await connection.query<any[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':coaching-test-schema'),10) AS ok"
    );
    if (lock[0]?.ok !== 1) throw Error("Coaching schema locked");
    const [columns] = await connection.query<any[]>(
      "SHOW COLUMNS FROM sari_coaching_questions LIKE 'context_json'"
    );
    if (!columns.length)
      await connection.query(
        readFileSync("drizzle/0158_contextual_coaching.sql", "utf8")
      );
  } finally {
    try {
      await connection.query(
        "SELECT RELEASE_LOCK(CONCAT(DATABASE(),':coaching-test-schema'))"
      );
    } finally {
      connection.release();
    }
  }
}
