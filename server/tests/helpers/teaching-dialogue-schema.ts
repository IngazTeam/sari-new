import { readFileSync } from "node:fs";
import { getPool } from "../../db/connection";
import { assertDisposableDatabase } from "./disposable-merchant";
export async function ensureTeachingDialogueSchema() {
  assertDisposableDatabase();
  const db = await (await getPool())!.getConnection();
  try {
    const [lock] = await db.query<any[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':teaching-dialogue-schema'),10) AS ok"
    );
    if (lock[0]?.ok !== 1) throw Error("Schema locked");
    const [rows] = await db.query<any[]>(
      "SHOW TABLES LIKE 'merchant_teaching_turns'"
    );
    if (!rows.length)
      for (const statement of readFileSync(
        "drizzle/0163_teaching_dialogues.sql",
        "utf8"
      ).split("--> statement-breakpoint"))
        await db.query(statement);
  } finally {
    try {
      await db.query(
        "SELECT RELEASE_LOCK(CONCAT(DATABASE(),':teaching-dialogue-schema'))"
      );
    } finally {
      db.release();
    }
  }
}
