import type { PoolConnection } from "mysql2/promise";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  merchants,
  botSettings,
  products,
  services,
  setupWizardProgress,
} from "../drizzle/schema";
import {
  setupReviewInput,
  setupCompletionInput,
  setupCompletionReceipt,
  setupReceiptInput,
  setupCatalogConflicts,
  type SetupCompletionFields,
} from "../shared/setup-completion";
import {
  setupAuthority,
  setupHash,
  setupTransaction,
  validSetupScope,
  SetupConflict,
  SetupUnavailable,
  SetupReviewRequired,
} from "./setup-store";
import { destroyMerchantSessions } from "./ai/session-context";

async function reviewSnapshot(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  fields: SetupCompletionFields,
  lock: boolean,
  merchant: any
) {
  const suffix = lock ? " FOR UPDATE" : "";
  const [draft] = await c.execute<any[]>(
    `SELECT id,revision,current_step,completed_steps,wizard_data,is_completed,completed_at FROM setup_wizard_progress WHERE merchant_id=?${suffix}`,
    [merchantId]
  );
  const [bots] = await c.execute<any[]>(
    `SELECT id,tone,language,welcome_message FROM bot_settings WHERE merchant_id=?${suffix}`,
    [merchantId]
  );
  if (draft.length > 1 || bots.length > 1)
    throw new SetupUnavailable("SETUP_REPAIR_REQUIRED");
  const [productNames] = await c.execute<any[]>(
    `SELECT id,name FROM products WHERE merchantId=? ORDER BY id LIMIT 10001${suffix}`,
    [merchantId]
  );
  const [serviceNames] = await c.execute<any[]>(
    `SELECT id,name FROM services WHERE merchant_id=? ORDER BY id LIMIT 10001${suffix}`,
    [merchantId]
  );
  if (productNames.length > 10000 || serviceNames.length > 10000)
    throw new SetupUnavailable("SETUP_CATALOG_LIMIT");
  const [templates] =
    fields.templateId === undefined
      ? [[]]
      : await c.execute<any[]>(
          `SELECT id,is_active FROM business_templates WHERE id=?${lock ? " FOR UPDATE" : ""}`,
          [fields.templateId]
        );
  const templateAvailable =
    fields.templateId === undefined ||
    (templates.length === 1 && templates[0].is_active === 1);
  const alreadyCompleted =
    Number(merchant.setupCompleted) === 1 ||
    Number(draft[0]?.is_completed) === 1;
  const catalogLocked =
    fields.products.length > 0 && merchant.integration_source !== "none";
  const conflicts = setupCatalogConflicts(fields, {
    products: productNames,
    services: serviceNames,
  });
  return {
    merchantId,
    actorId,
    fields,
    currency: merchant.currency as "SAR" | "USD",
    digest: setupHash({
      merchant,
      draft,
      bots,
      productNames,
      serviceNames,
      templates,
      fields,
    }),
    alreadyCompleted,
    catalogLocked,
    templateAvailable,
    conflicts,
    canComplete:
      !alreadyCompleted &&
      !catalogLocked &&
      templateAvailable &&
      conflicts.length === 0,
  };
}
export async function reviewSetupCompletion(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  validSetupScope(merchantId, actorId);
  const { fields } = setupReviewInput.parse(raw);
  return setupTransaction(false, async c => {
    const merchant = await setupAuthority(c, merchantId, actorId, false);
    return reviewSnapshot(c, merchantId, actorId, fields, false, merchant);
  });
}
function receipt(
  row: any,
  merchantId: number,
  actorId: number,
  requestId: string
) {
  if (Number(row.actor_id) !== actorId) throw new SetupConflict();
  const result = setupCompletionReceipt.parse(
    typeof row.result === "string" ? JSON.parse(row.result) : row.result
  );
  if (
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    result.requestId !== requestId
  )
    throw new SetupUnavailable();
  return result;
}
export async function completeReviewedSetup(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  validSetupScope(merchantId, actorId);
  const input = setupCompletionInput.parse(raw),
    inputHash = setupHash(input);
  const result = await setupTransaction(true, async c => {
    const merchant = await setupAuthority(c, merchantId, actorId, true);
    const [prior] = await c.execute<any[]>(
      "SELECT actor_id,input_hash,result FROM setup_completion_receipts WHERE merchant_id=? AND request_id=? FOR UPDATE",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (prior.length !== 1 || prior[0].input_hash !== inputHash)
        throw new SetupConflict();
      return receipt(prior[0], merchantId, actorId, input.requestId);
    }
    const current = await reviewSnapshot(
      c,
      merchantId,
      actorId,
      input.fields,
      true,
      merchant
    );
    if (current.digest !== input.expectedDigest) throw new SetupConflict();
    if (!current.canComplete) throw new SetupReviewRequired();
    const fields = input.fields,
      db = drizzle({ client: c });
    const now = sql`UTC_TIMESTAMP()`;
    await db
      .update(merchants)
      .set({
        businessType: fields.businessType,
        businessName: fields.businessName,
        phone: fields.phone,
        address: fields.address,
        description: fields.description,
        workingHoursType: fields.workingHoursType,
        ...(fields.workingHours === undefined
          ? {}
          : { workingHours: JSON.stringify(fields.workingHours) }),
        setupCompleted: 1,
        setupCompletedAt: now,
        onboardingCompleted: 1,
        onboardingStep: 4,
        onboardingCompletedAt: now,
      })
      .where(eq(merchants.id, merchantId));
    const assistant = {
      tone: fields.botTone,
      language: fields.botLanguage,
      welcomeMessage: fields.welcomeMessage,
    };
    const [bots] = await c.execute<any[]>(
      "SELECT id FROM bot_settings WHERE merchant_id=? FOR UPDATE",
      [merchantId]
    );
    if (bots.length)
      await db
        .update(botSettings)
        .set(assistant)
        .where(
          and(
            eq(botSettings.id, bots[0].id),
            eq(botSettings.merchantId, merchantId)
          )
        );
    else
      await db
        .insert(botSettings)
        .values({ merchantId, ...assistant, autoReplyEnabled: 0 });
    const createdProducts: Array<{
      id: number;
      name: string;
      priceMinor: number;
      currency: "SAR" | "USD";
    }> = [];
    for (const row of fields.products) {
      const [created] = await db
        .insert(products)
        .values({
          merchantId,
          name: row.name,
          description: row.description || null,
          price: row.priceMinor,
          priceUnit: "minor",
          currency: row.currency,
          imageUrl: row.imageUrl || null,
          productUrl: row.productUrl || null,
          category: row.category || null,
          isActive: 1,
          status: "active",
          stock: null,
        })
        .$returningId();
      createdProducts.push({
        id: created.id,
        name: row.name,
        priceMinor: row.priceMinor,
        currency: row.currency,
      });
    }
    const createdServices: Array<{
      id: number;
      name: string;
      priceMinor: number;
      durationMinutes: number;
    }> = [];
    for (const row of fields.services) {
      const [created] = await db
        .insert(services)
        .values({
          merchantId,
          name: row.name,
          description: row.description || null,
          basePrice: row.priceMinor,
          priceType: "fixed",
          durationMinutes: row.durationMinutes,
          category: row.category || null,
          isActive: 1,
        })
        .$returningId();
      createdServices.push({
        id: created.id,
        name: row.name,
        priceMinor: row.priceMinor,
        durationMinutes: row.durationMinutes,
      });
    }
    // Website output stays an attributed draft. It cannot promote knowledge or analysis status.
    const [draft] = await c.execute<any[]>(
      "SELECT id FROM setup_wizard_progress WHERE merchant_id=? FOR UPDATE",
      [merchantId]
    );
    if (draft.length)
      await db
        .update(setupWizardProgress)
        .set({
          isCompleted: 1,
          completedAt: now,
          currentStep: 10,
          completedSteps: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
          revision: sql`${setupWizardProgress.revision} + 1`,
        })
        .where(eq(setupWizardProgress.merchantId, merchantId));
    else
      await db
        .insert(setupWizardProgress)
        .values({
          merchantId,
          isCompleted: 1,
          completedAt: now,
          currentStep: 10,
          completedSteps: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
          revision: 1,
        });
    if (fields.templateId !== undefined)
      await c.execute(
        "UPDATE business_templates SET usage_count=usage_count+1 WHERE id=? AND is_active=1",
        [fields.templateId]
      );
    // Durable cache invalidation shares the transaction with the changed source.
    await c.execute("DELETE FROM sari_response_cache WHERE merchant_id=?", [
      merchantId,
    ]);
    await c.execute(
      "UPDATE session_contexts SET context_json='null',expires_at=UTC_TIMESTAMP(),version=version+1 WHERE merchant_id=?",
      [merchantId]
    );
    const [clock] = await c.query<any[]>(
      "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now"
    );
    const result = setupCompletionReceipt.parse({
      merchantId,
      actorId,
      requestId: input.requestId,
      confirmedAt: clock[0].now,
      businessName: fields.businessName,
      currency: current.currency,
      products: createdProducts,
      services: createdServices,
      templateId: fields.templateId ?? null,
      reviewedWebsite: fields.websiteAnalysis ?? null,
    });
    await c.execute(
      "INSERT INTO setup_completion_receipts (merchant_id,actor_id,request_id,input_hash,result) VALUES (?,?,?,?,?)",
      [merchantId, actorId, input.requestId, inputHash, JSON.stringify(result)]
    );
    return result;
  });
  destroyMerchantSessions(merchantId);
  return result;
}
export async function readSetupCompletionReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  validSetupScope(merchantId, actorId);
  const { requestId } = setupReceiptInput.parse(raw);
  return setupTransaction(false, async c => {
    await setupAuthority(c, merchantId, actorId, false);
    const [rows] = await c.execute<any[]>(
      "SELECT actor_id,result FROM setup_completion_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, requestId]
    );
    if (rows.length > 1) throw new SetupUnavailable();
    return rows.length
      ? receipt(rows[0], merchantId, actorId, requestId)
      : null;
  });
}
