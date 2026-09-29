import { readFileSync } from "node:fs";
import { getPool } from "../../db/connection";
import { assertDisposableDatabase } from "./disposable-merchant";
export async function ensureTestFeedbackSchema() {
  assertDisposableDatabase();
  const c = await (await getPool())!.getConnection();
  try {
    const [locked] = await c.query<any[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':test-feedback'),10) ok"
    );
    if (locked[0]?.ok !== 1) throw Error("Feedback schema locked");
    for (const statement of readFileSync(
      "drizzle/0166_test_feedback_history.sql",
      "utf8"
    )
      .split("--> statement-breakpoint")
      .filter(s => s.trim()))
      await c.query(statement);
  } finally {
    try {
      await c.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':test-feedback'))");
    } finally {
      c.release();
    }
  }
}
