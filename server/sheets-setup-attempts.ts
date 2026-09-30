import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import {
  sheetsSetupInput,
  sheetsSetupRead,
  sheetsSetupReceipt,
  sheetsSetupAttempt,
  sheetsSetupAcknowledge,
} from "../shared/sheets-setup";
import { privacyHashExact } from "./accounts/privacy-hash";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { readSheetsSettingsOn, sheetsSettingsStore } from "./sheets-settings";
import {
  createSheetsWorkspace,
  SheetsSetupProviderError,
} from "./sheets-setup-provider";
import { reserveApiRateLimit } from "./api/distributed-rate-limit";
import { SheetsOAuthError } from "./sheets-oauth";
type Scope = { merchantId: number; userId: number; sessionId: string };
export class SheetsSetupError extends Error {
  constructor(
    public readonly reason:
      | "pending"
      | "changed"
      | "configuration"
      | "rate_limit"
      | "unconfirmed"
      | "missing"
  ) {
    super(`sheets_setup:${reason}`);
  }
}
const hash = (v: unknown) =>
  privacyHashExact(`sheets-setup:${JSON.stringify(v)}`);
const ready = () =>
  assertRuntimeSchema("Sheets setup attempts", [
    {
      table: "sheets_setup_attempts",
      columns: [
        "request_id",
        "execution_hash",
        "source_hash",
        "state",
        "receipt",
        "receipt_hash",
        "lease_until",
      ],
      uniqueIndexes: [
        {
          name: "uq_sheets_setup_request",
          columns: ["merchant_id", "request_id"],
        },
      ],
    },
  ]);
async function transaction<T>(run: (c: PoolConnection) => Promise<T>) {
  await ready();
  return sheetsSettingsStore.transaction(run);
}
export const sheetsSetupStore = { transaction };
async function find(c: PoolConnection, merchantId: number, requestId?: string) {
  const [rows] = await c.execute<any[]>(
    `SELECT *,lease_until>UTC_TIMESTAMP(3) AS lease_valid,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS started,DATE_FORMAT(finished_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS finished FROM sheets_setup_attempts WHERE merchant_id=?${requestId ? " AND request_id=?" : ""} ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    requestId ? [merchantId, requestId] : [merchantId]
  );
  return rows[0] ?? null;
}
function view(row: any, scope: Scope) {
  if (!row || Number(row.merchant_id) !== scope.merchantId)
    throw new SheetsSetupError("missing");
  const receipt =
    row.receipt == null
      ? null
      : sheetsSetupReceipt.parse(
          typeof row.receipt === "string"
            ? JSON.parse(row.receipt)
            : row.receipt
        );
  if (
    receipt &&
    (hash(receipt) !== row.receipt_hash ||
      receipt.requestId !== row.request_id ||
      receipt.spreadsheetId !== row.spreadsheet_id)
  )
    throw Error("Invalid setup receipt");
  const expired = !Number(row.lease_valid),
    pending = ["preparing", "dispatching"].includes(row.state);
  return sheetsSetupAttempt.parse({
    merchantId: scope.merchantId,
    actorId: scope.userId,
    createdBy: Number(row.actor_id),
    requestId: row.request_id,
    state: pending && expired ? "uncertain" : row.state,
    canAcknowledge:
      row.state === "detached" ||
      (expired &&
        ["preparing", "dispatching", "uncertain", "created"].includes(
          row.state
        )),
    startedAt: row.started,
    finishedAt: row.finished,
    reason: row.failure_code,
    receipt,
    spreadsheetId: row.spreadsheet_id,
  });
}
export async function readSheetsSetup(scope: Scope, raw: unknown = {}) {
  const input = sheetsSetupRead.parse(raw);
  return sheetsSetupStore.transaction(async c => {
    await sheetsSettingsStore.authority(c, scope);
    const row = await find(c, scope.merchantId, input.requestId);
    return row ? view(row, scope) : null;
  });
}
async function current(c: PoolConnection, scope: Scope, expected: string) {
  const snapshot = await readSheetsSettingsOn(c, scope);
  if (snapshot.view.digest !== expected) throw new SheetsSetupError("changed");
  if (
    snapshot.view.state !== "needs_destination" ||
    !snapshot.row ||
    !snapshot.config
  )
    throw new SheetsSetupError("configuration");
  return snapshot;
}
/** Re-attach a verified receipt only to the unchanged source; never creates a Google file. */
export async function recoverSheetsSetup(scope: Scope, raw: unknown) {
  const { requestId } = sheetsSetupRead.required().parse(raw);
  return sheetsSetupStore.transaction(async c => {
    const snapshot = await readSheetsSettingsOn(c, scope);
    const row = await find(c, scope.merchantId, requestId);
    const previous = view(row, scope);
    if (row.state !== "created") return previous;
    if (!previous.receipt) throw Error("Missing creation receipt");
    if (
      snapshot.view.digest !== row.source_hash ||
      snapshot.view.state !== "needs_destination"
    ) {
      await c.execute(
        "UPDATE sheets_setup_attempts SET state='detached',failure_code='changed',finished_at=UTC_TIMESTAMP(3) WHERE id=? AND state='created'",
        [row.id]
      );
    } else {
      await c.execute(
        "UPDATE google_integrations SET sheet_id=? WHERE id=? AND merchant_id=? AND integration_type='sheets'",
        [previous.receipt.spreadsheetId, snapshot.row.id, scope.merchantId]
      );
      await c.execute(
        "UPDATE sheets_setup_attempts SET state='completed',failure_code=NULL,finished_at=UTC_TIMESTAMP(3) WHERE id=? AND state='created'",
        [row.id]
      );
    }
    return view(await find(c, scope.merchantId, requestId), scope);
  });
}
export async function acknowledgeSheetsSetup(scope: Scope, raw: unknown) {
  const input = sheetsSetupAcknowledge.parse(raw);
  return sheetsSetupStore.transaction(async c => {
    await sheetsSettingsStore.authority(c, scope);
    const row = await find(c, scope.merchantId, input.requestId),
      previous = view(row, scope);
    if (row.state === "acknowledged") return previous;
    if (!previous.canAcknowledge) throw new SheetsSetupError("pending");
    await c.execute(
      "UPDATE sheets_setup_attempts SET state='acknowledged',reviewed_at=UTC_TIMESTAMP(3),finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3)) WHERE id=?",
      [row.id]
    );
    return view(await find(c, scope.merchantId, input.requestId), scope);
  });
}
export async function startSheetsSetup(scope: Scope, raw: unknown) {
  const input = sheetsSetupInput.parse(raw),
    execution = randomUUID(),
    inputHash = hash(input);
  const reserved = await sheetsSetupStore.transaction(async c => {
    await sheetsSettingsStore.authority(c, scope);
    const existing = await find(c, scope.merchantId, input.requestId);
    if (existing) {
      if (
        existing.input_hash !== inputHash ||
        Number(existing.actor_id) !== scope.userId
      )
        throw new SheetsSetupError("changed");
      return { previous: view(existing, scope) };
    }
    const snapshot = await current(c, scope, input.expectedDigest);
    const [open] = await c.execute<any[]>(
      "SELECT id FROM sheets_setup_attempts WHERE merchant_id=? AND state IN ('preparing','dispatching','uncertain','created') LIMIT 1 FOR UPDATE",
      [scope.merchantId]
    );
    if (open.length) throw new SheetsSetupError("pending");
    if (
      !(
        await reserveApiRateLimit({
          namespace: "merchant_sheets_setup",
          identity: String(scope.merchantId),
          maxRequests: 10,
          windowMs: 60 * 60 * 1000,
        })
      ).allowed
    )
      throw new SheetsSetupError("rate_limit");
    await c.execute(
      "INSERT INTO sheets_setup_attempts (merchant_id,actor_id,request_id,input_hash,source_hash,execution_hash,state,lease_until) VALUES (?,?,?,?,?,?,'preparing',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND))",
      [
        scope.merchantId,
        scope.userId,
        input.requestId,
        inputHash,
        input.expectedDigest,
        hash(execution),
      ]
    );
    return {
      auth: {
        clientId: snapshot.config.clientId,
        clientSecret: snapshot.config.clientSecret,
        credentials: JSON.parse(snapshot.row.credentials),
      },
    };
  });
  if ("previous" in reserved) return reserved.previous!;
  async function guard(dispatch = false) {
    await sheetsSetupStore.transaction(async c => {
      await current(c, scope, input.expectedDigest);
      const row = await find(c, scope.merchantId, input.requestId);
      if (
        !row ||
        row.execution_hash !== hash(execution) ||
        row.state !== "preparing" ||
        !Number(row.lease_valid)
      )
        throw new SheetsSetupError("changed");
      if (dispatch)
        await c.execute(
          "UPDATE sheets_setup_attempts SET state='dispatching',lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND) WHERE id=? AND state='preparing'",
          [row.id]
        );
    });
  }
  let receipt;
  try {
    receipt = sheetsSetupReceipt.parse(
      await createSheetsWorkspace({
        requestId: input.requestId,
        auth: reserved.auth!,
        assertCurrent: () => guard(),
        beforeDispatch: () => guard(true),
      })
    );
  } catch (error) {
    await sheetsSetupStore
      .transaction(async c => {
        // Internal completion capability; permissions may have been revoked after dispatch.
        const row = await find(c, scope.merchantId, input.requestId);
        if (
          !row ||
          row.execution_hash !== hash(execution) ||
          !["preparing", "dispatching"].includes(row.state)
        )
          return;
        const sent = row.state === "dispatching";
        const reason = sent
          ? "unconfirmed"
          : error instanceof SheetsSetupProviderError &&
              error.reason === "authentication"
            ? "authentication"
            : error instanceof SheetsOAuthError ||
                error instanceof SheetsSetupError
              ? "changed"
              : "unavailable";
        await c.execute(
          "UPDATE sheets_setup_attempts SET state=?,failure_code=?,spreadsheet_id=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
          [
            sent ? "uncertain" : "rejected",
            reason,
            error instanceof SheetsSetupProviderError
              ? (error.spreadsheetId ?? null)
              : null,
            row.id,
          ]
        );
      })
      .catch(() => {});
    return await readSheetsSetup(scope, { requestId: input.requestId });
  }
  if (receipt.requestId !== input.requestId)
    throw new SheetsSetupError("unconfirmed");
  try {
    await sheetsSetupStore.transaction(async c => {
      const row = await find(c, scope.merchantId, input.requestId);
      if (
        !row ||
        row.execution_hash !== hash(execution) ||
        !["dispatching", "uncertain", "acknowledged"].includes(row.state)
      )
        throw new SheetsSetupError("changed");
      await c.execute(
        "UPDATE sheets_setup_attempts SET state=?,receipt=?,receipt_hash=?,spreadsheet_id=?,failure_code=NULL,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
        [
          row.state === "acknowledged" ? "acknowledged" : "created",
          JSON.stringify(receipt),
          hash(receipt),
          receipt.spreadsheetId,
          row.id,
        ]
      );
    });
  } catch {
    throw new SheetsSetupError("unconfirmed");
  }
  return recoverSheetsSetup(scope, { requestId: input.requestId });
}
