import type { PoolConnection } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { sheetsOAuthStore } from "./sheets-oauth";
import type { SheetsUserScope } from "./sheets-user-operation";
import { canonicalWhatsAppPhoneDigits } from "./channels/whatsapp/instance-ownership";
import { sheetsReportContext } from "../shared/sheets-report-review";
const phone = (value: unknown) => {
  if (typeof value !== "string" || !/^[+\d ()-]+$/.test(value)) return null;
  try {
    const normalized = canonicalWhatsAppPhoneDigits(value);
    return /^[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
  } catch {
    return null;
  }
};
export function reportProviderOrigin(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      ["api.green-api.com", "api.greenapi.com"].some(
        host => url.hostname === host || url.hostname.endsWith("." + host)
      )
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
export async function reportContextOn(
  tx: PoolConnection,
  scope: SheetsUserScope
) {
  const [merchants] = await tx.execute<any[]>(
    "SELECT m.id,m.phone,u.account_status FROM merchants m JOIN users u ON u.id=m.userId WHERE m.id=? FOR SHARE",
    [scope.merchantId]
  );
  if (
    !Array.isArray(merchants) ||
    merchants.length !== 1 ||
    merchants[0].account_status !== "active"
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "sheets_report:unavailable",
    });
  // Do not retain an integration row lock: the Google SDK may refresh credentials on a separate connection.
  const [integrations] = await tx.execute<any[]>(
    "SELECT id,is_active,sheet_id FROM google_integrations WHERE merchant_id=? AND integration_type='sheets' ORDER BY id LIMIT 2",
    [scope.merchantId]
  );
  if (!Array.isArray(integrations) || integrations.length > 1)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "sheets_report:unavailable",
    });
  const [instances] = await tx.execute<any[]>(
    "SELECT id,phone_number,api_url,provider,status,(expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) AS unexpired FROM whatsapp_instances WHERE merchant_id=? AND is_primary=1 ORDER BY id LIMIT 2 FOR SHARE",
    [scope.merchantId]
  );
  if (!Array.isArray(instances)) throw Error("Invalid report sender");
  const instance = instances.length === 1 ? instances[0] : null;
  const recipientPhone = phone(merchants[0].phone),
    senderPhone = phone(instance?.phone_number);
  const canSend =
    !!recipientPhone &&
    !!senderPhone &&
    instance?.provider === "green_api" &&
    instance.status === "active" &&
    Number(instance.unexpired) === 1 &&
    !!reportProviderOrigin(instance.api_url);
  return sheetsReportContext.parse({
    actorId: scope.userId,
    merchantId: scope.merchantId,
    spreadsheetId:
      integrations[0]?.is_active === 1 ? integrations[0].sheet_id : null,
    recipientPhone,
    instanceId: canSend ? instance.id : null,
    senderPhone: canSend ? senderPhone : null,
    canSend,
  });
}
export async function readSheetsReportContext(scope: SheetsUserScope) {
  try {
    return await sheetsOAuthStore.transaction(async tx => {
      await sheetsOAuthStore.authority(tx, scope);
      return reportContextOn(tx, scope);
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "sheets_report:unavailable",
    });
  }
}
export async function assertReportReview(
  tx: PoolConnection,
  scope: SheetsUserScope,
  input: {
    expectedSpreadsheetId: string;
    expectedRecipientPhone?: string;
    expectedInstanceId?: number;
  }
) {
  const context = await reportContextOn(tx, scope);
  if (
    context.spreadsheetId !== input.expectedSpreadsheetId ||
    (input.expectedRecipientPhone !== undefined &&
      (!context.canSend ||
        context.recipientPhone !== input.expectedRecipientPhone ||
        context.instanceId !== input.expectedInstanceId))
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "sheets_report:review_changed",
    });
  return context;
}
