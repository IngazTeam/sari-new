import { readFileSync } from "node:fs";
import { getPool } from "../../db/connection";
import { assertDisposableDatabase } from "./disposable-merchant";
export async function ensureOnboardingTestSchema() {
  assertDisposableDatabase();
  const db = await (await getPool())!.getConnection();
  try {
    const [lock] = await db.query<any[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':onboarding-test-schema'),10) AS ok"
    );
    if (lock[0]?.ok !== 1) throw Error("Schema busy");
    const [columns] = await db.query<any[]>(
      "SHOW COLUMNS FROM merchant_onboarding_answers LIKE 'verified_event_key'"
    );
    if (!columns.length)
      for (const statement of readFileSync(
        "drizzle/0160_contextual_onboarding.sql",
        "utf8"
      ).split("--> statement-breakpoint"))
        await db.query(statement);
  } finally {
    try {
      await db.query(
        "SELECT RELEASE_LOCK(CONCAT(DATABASE(),':onboarding-test-schema'))"
      );
    } finally {
      db.release();
    }
  }
}
