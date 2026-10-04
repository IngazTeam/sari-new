import type { PoolConnection } from "mysql2/promise";
import { getPool } from "../db/connection";
import { privacyHashExact } from "./privacy-hash";
import {
  safeAccountNotificationLink,
  accountNotificationsInput,
  accountNotificationsWorkspace,
  accountNotificationRecord,
  accountNotificationDetail,
  accountNotificationDetailInput,
  accountNotificationAction,
  accountNotificationActionResult,
  accountNotificationsReadAllInput,
  accountNotificationsReadAllResult,
} from "../../shared/account-notifications-workspace";
export class AccountNotificationError extends Error {
  constructor(
    readonly reason:
      | "forbidden"
      | "unavailable"
      | "stale"
      | "missing"
      | "unknown"
  ) {
    super("account_notifications:" + reason);
  }
}
async function rows(tx: PoolConnection, sql: string, args: any[]) {
  const [r] = await tx.execute(sql, args);
  if (!Array.isArray(r)) throw new AccountNotificationError("unavailable");
  return r as any[];
}
async function transaction<T>(
  actorId: number,
  write: boolean,
  work: (tx: PoolConnection) => Promise<T>
) {
  let tx: PoolConnection | undefined,
    committing = false,
    reusable = true;
  try {
    if (!Number.isSafeInteger(actorId) || actorId < 1 || actorId > 2147483647)
      throw new AccountNotificationError("forbidden");
    const pool = await getPool();
    if (!pool) throw new AccountNotificationError("unavailable");
    tx = await pool.getConnection();
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.beginTransaction();
    const users = await rows(
      tx,
      `SELECT id,account_status FROM users WHERE id=? FOR ${write ? "UPDATE" : "SHARE"}`,
      [actorId]
    );
    if (users.length !== 1 || users[0].account_status !== "active")
      throw new AccountNotificationError("forbidden");
    const result = await work(tx);
    committing = true;
    await tx.commit();
    committing = false;
    return result;
  } catch (error) {
    if (tx) {
      if (committing) {
        reusable = false;
        tx.destroy();
        throw new AccountNotificationError("unknown");
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
const columns = "id,userId,type,title,message,link,isRead,createdAt";
const stateSql =
  "CASE WHEN isRead=0 THEN 'unread' WHEN isRead=1 THEN 'read' ELSE 'unknown' END";
function stamp(v: unknown) {
  if (v instanceof Date)
    return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z)?$/.test(v)
  )
    return null;
  const raw = v.replace(" ", "T"),
    d = new Date(raw.endsWith("Z") ? raw : raw + "Z");
  return Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 19) === raw.slice(0, 19)
    ? d.toISOString()
    : null;
}
export function projectAccountNotification(actorId: number, row: any) {
  if (row.userId !== actorId) throw new AccountNotificationError("forbidden");
  const link = safeAccountNotificationLink(row.link);
  return accountNotificationRecord.parse({
    id: row.id,
    revision: privacyHashExact(
      JSON.stringify([
        "account_notification_v1",
        actorId,
        row.id,
        row.type,
        row.title,
        row.message,
        row.link,
        row.isRead,
        row.createdAt,
      ])
    ),
    type: ["info", "success", "warning", "error"].includes(row.type)
      ? row.type
      : null,
    title:
      typeof row.title === "string" && row.title.length <= 255
        ? row.title
        : null,
    message:
      typeof row.message === "string" && row.message.length <= 65535
        ? row.message
        : null,
    link,
    linkUnavailable: row.link !== null && row.link !== "" && link === null,
    state: row.isRead === 0 ? "unread" : row.isRead === 1 ? "read" : "unknown",
    createdAt: stamp(row.createdAt),
  });
}
const exactCount = (value: unknown) => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(n) || n < 0)
    throw new AccountNotificationError("unavailable");
  return n;
};
const markRevision = (
  actorId: number,
  throughId: number | null,
  unreadCount: number
) =>
  privacyHashExact(
    JSON.stringify([
      "account_notifications_read_all_v1",
      actorId,
      throughId,
      unreadCount,
    ])
  );
async function accountSummary(tx: PoolConnection, actorId: number) {
  const [r] = await rows(
    tx,
    "SELECT MAX(id) AS throughId,COALESCE(SUM(isRead=0),0) AS unreadCount FROM notifications WHERE userId=?",
    [actorId]
  );
  const throughId = r.throughId === null ? null : exactCount(r.throughId),
    unreadCount = exactCount(r.unreadCount);
  return {
    throughId,
    unreadCount,
    revision: markRevision(actorId, throughId, unreadCount),
  };
}
export function readAccountNotifications(actorId: number, input: unknown) {
  const filters = accountNotificationsInput.parse(input);
  return transaction(actorId, false, async tx => {
    const args: any[] = [actorId],
      where = ["userId=?"];
    if (filters.state !== "all") {
      where.push(`(${stateSql})=?`);
      args.push(filters.state);
    }
    if (filters.search) {
      where.push("(title LIKE ? ESCAPE '!' OR message LIKE ? ESCAPE '!')");
      const s = "%" + filters.search.replace(/[!%_]/g, v => "!" + v) + "%";
      args.push(s, s);
    }
    const predicate = where.join(" AND "),
      [totals] = await rows(
        tx,
        `SELECT COUNT(*) AS total,COALESCE(SUM(isRead=0),0) AS unread,COALESCE(SUM(isRead=1),0) AS \`read\`,COALESCE(SUM(isRead NOT IN (0,1) OR isRead IS NULL),0) AS unknown FROM notifications WHERE ${predicate}`,
        args
      );
    const total = {
        total: exactCount(totals.total),
        unread: exactCount(totals.unread),
        read: exactCount(totals.read),
        unknown: exactCount(totals.unknown),
      },
      items = await rows(
        tx,
        `SELECT ${columns} FROM notifications WHERE ${predicate} ORDER BY createdAt DESC,id DESC LIMIT ${filters.pageSize} OFFSET ${(filters.page - 1) * filters.pageSize}`,
        args
      );
    return accountNotificationsWorkspace.parse({
      actorId,
      scope: "account",
      source: "local_notifications",
      checkedAt: new Date().toISOString(),
      filters,
      totals: total,
      markAll: await accountSummary(tx, actorId),
      items: items.map(r => projectAccountNotification(actorId, r)),
      hasNext: filters.page * filters.pageSize < total.total,
    });
  });
}
async function detail(
  tx: PoolConnection,
  actorId: number,
  id: number,
  lock = false
) {
  const r = await rows(
    tx,
    `SELECT ${columns} FROM notifications WHERE id=? AND userId=?${lock ? " FOR UPDATE" : ""}`,
    [id, actorId]
  );
  if (r.length > 1) throw new AccountNotificationError("unavailable");
  return accountNotificationDetail.parse({
    actorId,
    id,
    scope: "account",
    state: r.length ? "found" : "missing",
    record: r.length ? projectAccountNotification(actorId, r[0]) : null,
  });
}
export function readAccountNotification(actorId: number, input: unknown) {
  const { id } = accountNotificationDetailInput.parse(input);
  return transaction(actorId, false, tx => detail(tx, actorId, id));
}
export function applyAccountNotificationAction(
  actorId: number,
  input: unknown
) {
  const p = accountNotificationAction.parse(input);
  return transaction(actorId, true, async tx => {
    const before = await detail(tx, actorId, p.id, true);
    if (!before.record) throw new AccountNotificationError("missing");
    if (before.record.revision !== p.expectedRevision)
      throw new AccountNotificationError("stale");
    const changed = p.action === "delete" || before.record.state !== "read";
    if (changed) {
      const [receipt] = await tx.execute<any>(
        p.action === "delete"
          ? "DELETE FROM notifications WHERE id=? AND userId=?"
          : "UPDATE notifications SET isRead=1 WHERE id=? AND userId=?",
        [p.id, actorId]
      );
      if (receipt.affectedRows !== 1)
        throw new AccountNotificationError("unavailable");
    }
    const after = await detail(tx, actorId, p.id, true);
    return accountNotificationActionResult.parse({
      outcome:
        p.action === "delete" ? "deleted" : changed ? "read" : "already_read",
      detail: after,
    });
  });
}
export function markAccountNotificationsRead(actorId: number, input: unknown) {
  const p = accountNotificationsReadAllInput.parse(input);
  return transaction(actorId, true, async tx => {
    if (
      markRevision(actorId, p.throughId, p.unreadCount) !== p.expectedRevision
    )
      throw new AccountNotificationError("stale");
    // Only unread rows that existed at review time are eligible. Later arrivals
    // have larger auto-increment ids and remain unread, even if another writer runs.

    const [receipt] = await tx.execute<any>(
      "UPDATE notifications SET isRead=1 WHERE userId=? AND id<=? AND isRead=0",
      [actorId, p.throughId]
    );
    if (receipt.affectedRows !== p.unreadCount)
      throw new AccountNotificationError("stale");
    const [verified] = await rows(
      tx,
      "SELECT COUNT(*) AS remaining FROM notifications WHERE userId=? AND id<=? AND isRead=0",
      [actorId, p.throughId]
    );
    if (exactCount(verified.remaining) !== 0)
      throw new AccountNotificationError("unavailable");
    return accountNotificationsReadAllResult.parse({
      actorId,
      scope: "account",
      throughId: p.throughId,
      changed: p.unreadCount,
      remainingUnread: (await accountSummary(tx, actorId)).unreadCount,
    });
  });
}
