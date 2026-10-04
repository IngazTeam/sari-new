import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import {
  withMerchantOwnerSettings,
  MerchantSettingsAuthorityError,
} from "./merchant-settings-authority";
import {
  merchantProfileFields,
  merchantProfileKeys,
  merchantProfileSave,
  merchantProfileWorkspace,
  merchantProfileSaveResult,
} from "../../shared/merchant-profile-workspace";
const columns = {
  businessName: "businessName",
  phone: "phone",
  autoReplyEnabled: "autoReplyEnabled",
  timezone: "timezone",
  logoUrl: "logo_url",
} as const;
async function stored(tx: PoolConnection, merchantId: number, write: boolean) {
  const [rows] = await tx.execute<any[]>(
    `SELECT ${Object.values(columns).join(",")} FROM merchants WHERE id=? FOR ${write ? "UPDATE" : "SHARE"}`,
    [merchantId]
  );
  if (rows.length !== 1)
    throw new MerchantSettingsAuthorityError("unavailable");
  return rows[0];
}
export function projectMerchantProfile(
  actorId: number,
  merchantId: number,
  canManage: boolean,
  raw: any
) {
  const values: any = {},
    invalidFields: string[] = [];
  for (const key of merchantProfileKeys.options) {
    let value = raw[columns[key]];
    if (key === "phone" && value === null) value = "";
    if (key === "autoReplyEnabled" && (value === 0 || value === 1))
      value = value === 1;
    const parsed = merchantProfileFields.shape[key].safeParse(value);
    values[key] = parsed.success ? parsed.data : null;
    if (!parsed.success) invalidFields.push(key);
  }
  return merchantProfileWorkspace.parse({
    actorId,
    merchantId,
    canView: true,
    canManage,
    values,
    invalidFields,
    revision: createHash("sha256")
      .update(
        JSON.stringify([
          actorId,
          merchantId,
          merchantProfileKeys.options.map(k => raw[columns[k]]),
        ])
      )
      .digest("hex"),
  });
}
export function readMerchantProfileWorkspace(
  actorId: number,
  merchantId: number
) {
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    false,
    async (tx, { canManage, isOwner }) => {
      if (!isOwner)
        return merchantProfileWorkspace.parse({
          actorId,
          merchantId,
          canView: false,
          canManage: false,
          revision: null,
          values: null,
          invalidFields: [],
        });
      return projectMerchantProfile(
        actorId,
        merchantId,
        canManage,
        await stored(tx, merchantId, false)
      );
    }
  );
}
export function saveMerchantProfileWorkspace(
  actorId: number,
  merchantId: number,
  input: unknown
) {
  const { expectedRevision, ...fields } = merchantProfileSave.parse(input);
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    true,
    async (tx, { canManage }) => {
      const before = projectMerchantProfile(
        actorId,
        merchantId,
        canManage,
        await stored(tx, merchantId, true)
      );
      if (before.revision !== expectedRevision)
        throw new MerchantSettingsAuthorityError("stale");
      const keys = merchantProfileKeys.options,
        changed =
          !!before.invalidFields.length ||
          keys.some(k => before.values![k] !== fields[k]);
      if (changed)
        await tx.execute(
          `UPDATE merchants SET ${keys.map(k => `${columns[k]}=?`).join(",")} WHERE id=?`,
          [...keys.map(k => fields[k]), merchantId]
        );
      const workspace = projectMerchantProfile(
        actorId,
        merchantId,
        canManage,
        await stored(tx, merchantId, true)
      );
      if (
        workspace.invalidFields.length ||
        keys.some(k => workspace.values![k] !== fields[k])
      )
        throw new MerchantSettingsAuthorityError("unavailable");
      return merchantProfileSaveResult.parse({ changed, workspace });
    }
  );
}
