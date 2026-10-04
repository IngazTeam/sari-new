import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "../db/connection";
import {
  selfProfileName,
  selfProfileEmail,
  selfProfileWorkspace,
  selfProfileRename,
  selfProfileRenameResult,
} from "../../shared/self-profile-workspace";
export class SelfProfileError extends Error {
  constructor(
    readonly reason: "forbidden" | "unavailable" | "stale" | "unknown"
  ) {
    super("self_profile:" + reason);
  }
}
async function stored(tx: PoolConnection, actorId: number, write: boolean) {
  const [rows] = await tx.execute<any[]>(
    `SELECT id,name,email,email_verified_at,account_status FROM users WHERE id=? FOR ${write ? "UPDATE" : "SHARE"}`,
    [actorId]
  );
  if (rows.length !== 1 || rows[0].account_status !== "active")
    throw new SelfProfileError("forbidden");
  return rows[0];
}
export function projectSelfProfile(actorId: number, raw: any) {
  const name = selfProfileName.safeParse(raw.name),
    email = selfProfileEmail.safeParse(raw.email);
  const verified =
    raw.email_verified_at === null
      ? false
      : raw.email_verified_at instanceof Date &&
          !Number.isNaN(raw.email_verified_at.getTime())
        ? true
        : typeof raw.email_verified_at === "string" &&
            /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(
              raw.email_verified_at
            ) &&
            Number.isFinite(Date.parse(raw.email_verified_at))
          ? true
          : null;
  return selfProfileWorkspace.parse({
    actorId,
    name: name.success ? name.data : null,
    email: email.success ? email.data : null,
    emailVerified: email.success && email.data ? verified : null,
    revision: createHash("sha256")
      .update(
        JSON.stringify([
          actorId,
          raw.name,
          raw.email,
          raw.email_verified_at,
          raw.account_status,
        ])
      )
      .digest("hex"),
  });
}
async function withSelfProfile<T>(
  actorId: number,
  write: boolean,
  work: (tx: PoolConnection, raw: any) => Promise<T>
) {
  let tx: PoolConnection | undefined,
    committing = false,
    reusable = true;
  try {
    if (!Number.isSafeInteger(actorId) || actorId < 1 || actorId > 2147483647)
      throw new SelfProfileError("forbidden");
    const pool = await getPool();
    if (!pool) throw new SelfProfileError("unavailable");
    tx = await pool.getConnection();
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.beginTransaction();
    const result = await work(tx, await stored(tx, actorId, write));
    committing = true;
    await tx.commit();
    committing = false;
    return result;
  } catch (error) {
    if (tx) {
      if (committing) {
        reusable = false;
        tx.destroy();
        throw new SelfProfileError("unknown");
      }
      try {
        await tx.rollback();
      } catch {
        reusable = false;
        tx.destroy();
      }
    }
    throw error;
  } finally {
    if (tx && reusable) tx.release();
  }
}
export function readSelfProfile(actorId: number) {
  return withSelfProfile(actorId, false, async (_tx, raw) =>
    projectSelfProfile(actorId, raw)
  );
}
export function renameSelfProfile(actorId: number, input: unknown) {
  const parsed = selfProfileRename.parse(input);
  return withSelfProfile(actorId, true, async (tx, raw) => {
    const before = projectSelfProfile(actorId, raw);
    if (before.revision !== parsed.expectedRevision)
      throw new SelfProfileError("stale");
    const changed = raw.name !== parsed.name;
    if (changed)
      await tx.execute("UPDATE users SET name=? WHERE id=?", [
        parsed.name,
        actorId,
      ]);
    const after = await stored(tx, actorId, true);
    if (after.name !== parsed.name) throw new SelfProfileError("unavailable");
    return selfProfileRenameResult.parse({
      changed,
      workspace: projectSelfProfile(actorId, after),
    });
  });
}
