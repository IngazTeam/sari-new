import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import {
  withMerchantOwnerSettings,
  MerchantSettingsAuthorityError,
} from "./accounts/merchant-settings-authority";
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
  try {
    return await withMerchantOwnerSettings(
      actorId,
      merchantId,
      write,
      async (tx, { canManage }) => {
        const saved = await rows(
          tx,
          "SELECT currency FROM merchants WHERE id=? FOR " +
            (write ? "UPDATE" : "SHARE"),
          [merchantId]
        );
        if (saved.length !== 1) throw new CurrencyWorkspaceError("unavailable");
        return work(tx, canManage, saved[0].currency);
      }
    );
  } catch (error) {
    if (error instanceof MerchantSettingsAuthorityError)
      throw new CurrencyWorkspaceError(error.reason);
    throw error;
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
