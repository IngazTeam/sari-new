import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { PoolConnection } from "mysql2/promise";
import { virtualAgents, virtualTeamSaveReceipts } from "../drizzle/schema";
import {
  virtualTeamSaveInput,
  virtualTeamSaveReceipt,
  virtualTeamSaveReceiptInput,
  type VirtualTeamSaveReceipt,
} from "../shared/virtual-team-save";
import { hasPermission, type MerchantRole } from "./_core/permissions";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { virtualTeamRevision } from "./virtual-team-version";

async function transaction<T>(
  write: boolean,
  run: (c: PoolConnection) => Promise<T>
): Promise<T> {
  await assertRuntimeSchema(
    "virtual team save",
    [
      {
        table: "virtual_team_save_receipts",
        columns: ["actor_id", "input_hash", "result", "created_at"],
        uniqueIndexes: [
          {
            name: "uq_virtual_team_save_request",
            columns: ["merchant_id", "request_id"],
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
  const pool = await getPool();
  if (!pool) throw Error("Virtual team storage unavailable");
  const c = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await c.query(
      `SET TRANSACTION ISOLATION LEVEL ${write ? "SERIALIZABLE" : "REPEATABLE READ"}`
    );
    if (!write) await c.query("SET TRANSACTION READ ONLY");
    await c.beginTransaction();
    const result = await run(c);
    committing = true;
    await c.commit();
    return result;
  } catch (error) {
    // An interrupted commit may have succeeded. Recovery reads the receipt; it never repeats the write here.
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

async function authority(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  lock: boolean
) {
  if (!Number.isInteger(actorId) || actorId < 1 || actorId > 2147483647)
    throw new TRPCError({ code: "FORBIDDEN" });
  // The merchant is always locked first, including an empty team, like the other team mutations.
  const [merchants] = await c.execute<any[]>(
    `SELECT id,userId,status FROM merchants WHERE id=?${lock ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
  const [users] = await c.execute<any[]>(
    `SELECT account_status FROM users WHERE id=?${lock ? " FOR SHARE" : ""}`,
    [actorId]
  );
  const [members] = await c.execute<any[]>(
    `SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=?${lock ? " FOR SHARE" : ""}`,
    [merchantId, actorId]
  );
  const m = merchants[0];
  const role =
    members.length === 1 && Number(members[0].is_active) === 1
      ? members[0].role
      : members.length === 0 && Number(m?.userId) === actorId
        ? "owner"
        : null;
  if (
    merchants.length !== 1 ||
    m.status === "suspended" ||
    users[0]?.account_status !== "active" ||
    !role ||
    !hasPermission(role as MerchantRole, "bot_settings.manage")
  )
    throw new TRPCError({ code: "FORBIDDEN" });
}

function receipt(
  row: typeof virtualTeamSaveReceipts.$inferSelect,
  merchantId: number,
  actorId: number,
  requestId: string
): VirtualTeamSaveReceipt {
  if (row.actorId !== actorId) throw new TRPCError({ code: "NOT_FOUND" });
  const result = virtualTeamSaveReceipt.parse(row.result);
  if (
    row.merchantId !== merchantId ||
    row.requestId !== requestId ||
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    result.requestId !== requestId
  )
    throw Error("Invalid virtual team receipt");
  return result;
}

export async function saveReviewedVirtualAgent(
  actorId: number,
  value: unknown
) {
  const input = virtualTeamSaveInput.parse(value);
  const inputHash = createHash("sha256")
    .update(JSON.stringify({ actorId, ...input }))
    .digest("hex");
  return transaction(true, async c => {
    await authority(c, input.merchantId, actorId, true);
    const db = drizzle(c);
    const [existingReceipt] = await db
      .select()
      .from(virtualTeamSaveReceipts)
      .where(
        and(
          eq(virtualTeamSaveReceipts.merchantId, input.merchantId),
          eq(virtualTeamSaveReceipts.requestId, input.requestId)
        )
      );
    if (existingReceipt) {
      if (
        existingReceipt.actorId !== actorId ||
        existingReceipt.inputHash !== inputHash
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "VIRTUAL_TEAM_REQUEST_CHANGED",
        });
      return receipt(
        existingReceipt,
        input.merchantId,
        actorId,
        input.requestId
      );
    }
    const readTeam = () =>
      db
        .select()
        .from(virtualAgents)
        .where(eq(virtualAgents.merchantId, input.merchantId));
    const before = await readTeam();
    if (
      virtualTeamRevision(input.merchantId, before) !== input.expectedRevision
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "VIRTUAL_TEAM_CHANGED",
      });
    if (
      input.editing !== null &&
      !before.some(agent => agent.id === input.editing)
    )
      throw new TRPCError({ code: "NOT_FOUND" });
    if (input.editing === null && before.length >= 10)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "VIRTUAL_TEAM_LIMIT",
      });
    const d = input.draft;
    if (d.isDefault)
      await db
        .update(virtualAgents)
        .set({ isDefault: 0 })
        .where(eq(virtualAgents.merchantId, input.merchantId));
    const data = {
      name: d.name,
      role: d.role,
      department: d.department || null,
      personalityPrompt: d.personalityPrompt,
      tone: d.tone,
      avatarEmoji: d.avatarEmoji,
      isDefault: d.isDefault ? 1 : 0,
      isActive: d.isActive ? 1 : 0,
      triggerKeywords: JSON.stringify(d.triggerKeywords),
      shiftStart: d.shiftStart || null,
      shiftEnd: d.shiftEnd || null,
    };
    let personaId = input.editing;
    if (personaId === null) {
      const [result] = await db
        .insert(virtualAgents)
        .values({
          ...data,
          merchantId: input.merchantId,
          sortOrder: before.length
            ? Math.max(...before.map(agent => agent.sortOrder)) + 1
            : 0,
        });
      personaId = result.insertId;
    } else {
      // Preserve routing intents and priority which are not part of the persona editor.
      await db
        .update(virtualAgents)
        .set(data)
        .where(
          and(
            eq(virtualAgents.merchantId, input.merchantId),
            eq(virtualAgents.id, personaId)
          )
        );
    }
    const result = virtualTeamSaveReceipt.parse({
      merchantId: input.merchantId,
      actorId,
      requestId: input.requestId,
      operation: input.editing === null ? "create" : "update",
      personaId,
      reviewedRevision: input.expectedRevision,
      revisionAfter: virtualTeamRevision(input.merchantId, await readTeam()),
      savedAt: new Date().toISOString(),
    });
    await db
      .insert(virtualTeamSaveReceipts)
      .values({
        merchantId: input.merchantId,
        actorId,
        requestId: input.requestId,
        inputHash,
        result,
      });
    return result;
  });
}

export async function readVirtualAgentSaveReceipt(
  actorId: number,
  value: unknown
) {
  const input = virtualTeamSaveReceiptInput.parse(value);
  return transaction(false, async c => {
    await authority(c, input.merchantId, actorId, false);
    const [row] = await drizzle(c)
      .select()
      .from(virtualTeamSaveReceipts)
      .where(
        and(
          eq(virtualTeamSaveReceipts.merchantId, input.merchantId),
          eq(virtualTeamSaveReceipts.requestId, input.requestId)
        )
      );
    return row
      ? receipt(row, input.merchantId, actorId, input.requestId)
      : null;
  });
}
