import type { PoolConnection } from "mysql2/promise";
import { setupProgressInput, setupResetInput } from "../shared/setup-progress";
import {
  setupAuthority,
  setupHash,
  setupTransaction,
  validSetupScope,
  SetupConflict,
  SetupUnavailable,
} from "./setup-store";

function object(raw: string | null) {
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid draft");
  return value as Record<string, unknown>;
}
function jsonOrRaw(raw: string | null) {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
async function snapshot(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  lock: boolean
) {
  const merchant = await setupAuthority(c, merchantId, actorId, lock);
  const [drafts] = await c.execute<any[]>(
    `SELECT * FROM setup_wizard_progress WHERE merchant_id=?${lock ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
  const [bots] = await c.execute<any[]>(
    `SELECT id,tone,language,welcome_message FROM bot_settings WHERE merchant_id=?${lock ? " FOR SHARE" : ""}`,
    [merchantId]
  );
  if (drafts.length > 1 || bots.length > 1) throw new SetupUnavailable();
  const row = drafts[0],
    bot = bots[0];
  const defaults = {
    businessType: merchant.businessType || "store",
    businessName: merchant.businessName || "",
    phone: merchant.phone || "",
    address: merchant.address || "",
    description: merchant.description || "",
    workingHoursType: merchant.workingHoursType || "weekdays",
    workingHours: jsonOrRaw(merchant.workingHours),
    botTone: bot?.tone || "friendly",
    botLanguage: bot?.language || "ar",
    welcomeMessage: bot?.welcome_message || "",
    products: [],
    services: [],
  };
  let wizardData: string,
    draftUnreadable = false;
  try {
    wizardData = JSON.stringify({ ...defaults, ...object(row?.wizard_data) });
  } catch {
    wizardData = String(row?.wizard_data ?? "");
    draftUnreadable = true;
  }
  return {
    merchantId,
    actorId,
    defaults,
    row,
    data: {
      merchantId,
      actorId,
      currency: merchant.currency as "SAR" | "USD",
      currentStep: Number(row?.current_step ?? 1),
      completedSteps: String(row?.completed_steps ?? "[]"),
      wizardData,
      draftUnreadable,
      isCompleted:
        Number(merchant.setupCompleted) === 1 || Number(row?.is_completed) === 1
          ? 1
          : 0,
      revision: Number(row?.revision ?? 0),
      digest: setupHash({
        merchantId,
        actorId,
        row: row ?? null,
        defaults,
        completed: merchant.setupCompleted,
      }),
    },
  };
}
export async function readSetupProgress(merchantId: number, actorId: number) {
  validSetupScope(merchantId, actorId);
  return setupTransaction(
    false,
    async c => (await snapshot(c, merchantId, actorId, false)).data
  );
}
export async function saveSetupProgress(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  validSetupScope(merchantId, actorId);
  const input = setupProgressInput.parse(raw);
  return setupTransaction(true, async c => {
    const current = await snapshot(c, merchantId, actorId, true);
    if (current.data.isCompleted || current.data.draftUnreadable)
      throw new SetupConflict();
    // A lost acknowledgement may retry an identical draft without another write.
    const identical =
      current.row &&
      current.data.currentStep === input.currentStep &&
      setupHash(jsonOrRaw(current.row.completed_steps)) ===
        setupHash(input.completedSteps) &&
      setupHash(object(current.row.wizard_data)) ===
        setupHash(input.wizardData);
    if (identical) return current.data;
    if (current.data.digest !== input.expectedDigest) throw new SetupConflict();
    const data = [
      input.currentStep,
      JSON.stringify(input.completedSteps),
      JSON.stringify(input.wizardData),
      merchantId,
    ];
    if (current.row)
      await c.execute(
        "UPDATE setup_wizard_progress SET current_step=?,completed_steps=?,wizard_data=?,revision=revision+1 WHERE merchant_id=? AND is_completed=0",
        data
      );
    else
      await c.execute(
        "INSERT INTO setup_wizard_progress (current_step,completed_steps,wizard_data,merchant_id,revision) VALUES (?,?,?,?,1)",
        data
      );
    return (await snapshot(c, merchantId, actorId, true)).data;
  });
}
export async function resetSetupProgress(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  validSetupScope(merchantId, actorId);
  const input = setupResetInput.parse(raw);
  return setupTransaction(true, async c => {
    const current = await snapshot(c, merchantId, actorId, true);
    if (current.data.digest !== input.expectedDigest) throw new SetupConflict();
    await c.execute(
      "UPDATE merchants SET setupCompleted=0,setupCompletedAt=NULL,onboardingCompleted=0,onboardingStep=0,onboardingCompletedAt=NULL WHERE id=?",
      [merchantId]
    );
    if (current.row)
      await c.execute(
        "UPDATE setup_wizard_progress SET current_step=1,completed_steps='[]',wizard_data=?,is_completed=0,completed_at=NULL,revision=revision+1 WHERE merchant_id=?",
        [JSON.stringify(current.defaults), merchantId]
      );
    else
      await c.execute(
        "INSERT INTO setup_wizard_progress (merchant_id,current_step,completed_steps,wizard_data,revision) VALUES (?,1,'[]',?,1)",
        [merchantId, JSON.stringify(current.defaults)]
      );
    return (await snapshot(c, merchantId, actorId, true)).data;
  });
}
