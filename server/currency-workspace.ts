import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import { ALL_ROLES } from "./_core/permissions";
import {
  currencySave,
  currencyWorkspace,
  currencySaveResult,
  workspaceCurrency,
} from "../shared/currency-workspace";

export class CurrencyWorkspaceError extends Error {
  constructor(
    readonly reason: "forbidden" | "unavailable" | "stale" | "unknown"
  ) {
    super("currency_workspace:" + reason);
  }
}
async function rows(tx: PoolConnection, sql: string, args: any[]) {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result)) throw new CurrencyWorkspaceError("unavailable");
  return result as any[];
}
export function projectCurrency(
  actorId: number,
  merchantId: number,
  canManage: boolean,
  stored: unknown
) {
  const parsed = workspaceCurrency.safeParse(stored);
  return currencyWorkspace.parse({
    actorId,
    merchantId,
    canManage,
    currency: parsed.success ? parsed.data : null,
    revision: createHash("sha256")
      .update(JSON.stringify([actorId, merchantId, stored]))
      .digest("hex"),
    convertsAmounts: false,
  });
}
async function withCurrencyAuthority<T>(
  actorId: number,
  merchantId: number,
  write: boolean,
  work: (tx: PoolConnection, canManage: boolean, stored: unknown) => Promise<T>
) {
  let tx: PoolConnection | undefined,
    committing = false,
    reusable = true;
  try {
    if (
      ![actorId, merchantId].every(
        n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647
      )
    )
      throw new CurrencyWorkspaceError("forbidden");
    const pool = await getPool();
    if (!pool) throw new CurrencyWorkspaceError("unavailable");
    tx = await pool.getConnection();
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.beginTransaction();
    const [merchant] = await rows(
      tx,
      `SELECT id,userId,status,currency FROM merchants WHERE id=? FOR ${write ? "UPDATE" : "SHARE"}`,
      [merchantId]
    );
    const users = await rows(
      tx,
      "SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE",
      [actorId, merchant?.userId || actorId]
    );
    const members = await rows(
      tx,
      "SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE",
      [merchantId, actorId]
    );
    const role =
      members.length === 1 && members[0].is_active === 1
        ? members[0].role
        : !members.length && merchant?.userId === actorId
          ? "owner"
          : null;
    if (
      !merchant ||
      !["active", "pending"].includes(merchant.status) ||
      users.find(u => u.id === actorId)?.account_status !== "active" ||
      users.find(u => u.id === merchant.userId)?.account_status !== "active" ||
      !ALL_ROLES.includes(role)
    )
      throw new CurrencyWorkspaceError("forbidden");
    // Preserve the existing owner-only currency authority; membership is not write permission.
    const canManage = merchant.status === "active" && role === "owner";
    if (write && !canManage) throw new CurrencyWorkspaceError("forbidden");
    const result = await work(tx, canManage, merchant.currency);
    committing = true;
    await tx.commit();
    committing = false;
    return result;
  } catch (error) {
    if (tx) {
      if (committing) {
        reusable = false;
        tx.destroy();
        throw new CurrencyWorkspaceError("unknown");
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
export function readCurrencyWorkspace(actorId: number, merchantId: number) {
  return withCurrencyAuthority(
    actorId,
    merchantId,
    false,
    async (_tx, canManage, stored) =>
      projectCurrency(actorId, merchantId, canManage, stored)
  );
}
export function saveCurrencyWorkspace(
  actorId: number,
  merchantId: number,
  input: unknown
) {
  const parsed = currencySave.parse(input);
  return withCurrencyAuthority(
    actorId,
    merchantId,
    true,
    async (tx, canManage, stored) => {
      const previous = projectCurrency(actorId, merchantId, canManage, stored);
      if (previous.revision !== parsed.expectedRevision)
        throw new CurrencyWorkspaceError("stale");
      const changed = previous.currency !== parsed.currency;
      if (changed)
        await tx.execute("UPDATE merchants SET currency=? WHERE id=?", [
          parsed.currency,
          merchantId,
        ]);
      const verified = await rows(
        tx,
        "SELECT currency FROM merchants WHERE id=? FOR UPDATE",
        [merchantId]
      );
      if (verified.length !== 1 || verified[0].currency !== parsed.currency)
        throw new CurrencyWorkspaceError("unavailable");
      return currencySaveResult.parse({
        changed,
        workspace: projectCurrency(
          actorId,
          merchantId,
          canManage,
          verified[0].currency
        ),
      });
    }
  );
}
