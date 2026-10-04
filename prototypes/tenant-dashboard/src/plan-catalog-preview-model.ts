import {
  planCatalogWorkspaceSchema,
  projectCatalogPlan,
} from "../../../shared/plan-catalog-workspace";
import { checkoutReviewSchema } from "../../../shared/subscription-checkout-review";
import type { ServiceMode } from "./service-preview-model";
export function planCatalogPreview(
  merchantId: number,
  actorId: number,
  mode: ServiceMode
) {
  const invalid = mode === "legacy";
  return planCatalogWorkspaceSchema.parse({
    actorId,
    merchantId,
    canManage: mode !== "readonly",
    checkedAt: new Date().toISOString(),
    plans:
      mode === "empty"
        ? []
        : [
            {
              id: 10,
              name: "نواة",
              name_en: "Nawa",
              monthly_price: "99.90",
              yearly_price: "999.00",
              max_customers: 500,
              max_whatsapp_numbers: 1,
              conversation_limit: 1000,
              message_limit: -1,
              voice_message_limit: 0,
            },
            {
              id: 11,
              name: "نمو",
              name_en: "Growth",
              monthly_price: "249.00",
              yearly_price: "2490.00",
              max_customers: 2000,
              max_whatsapp_numbers: 3,
              conversation_limit: 5000,
              message_limit: -1,
              voice_message_limit: 500,
            },
            {
              id: 12,
              name: "مدار",
              name_en: "Madar",
              monthly_price: "499.00",
              yearly_price: "5988.00",
              max_customers: 999999,
              max_whatsapp_numbers: 10,
              conversation_limit: -1,
              message_limit: -1,
              voice_message_limit: -1,
            },
          ].map(p =>
            projectCatalogPlan({
              ...p,
              description: "باقة توضيحية لاختيار سعة عملك",
              description_en: "Sample capacity for your business",
              currency: merchantId === 270 ? "USD" : "SAR",
              features:
                '["Shared knowledge / معرفة مشتركة","Conversation tools / أدوات المحادثات"]',
              ...(invalid
                ? { monthly_price: "-1", voice_message_limit: -2 }
                : {}),
            })
          ),
  });
}
export function checkoutPreview(
  merchantId: number,
  actorId: number,
  mode: ServiceMode,
  input: any
) {
  const plan = planCatalogPreview(merchantId, actorId, mode).plans.find(
    p => p.id === input.planId
  );
  if (!plan) throw Error("NOT_FOUND");
  const yearly = input.billingCycle === "yearly",
    priceMinor = yearly ? plan.yearlyMinor : plan.monthlyMinor;
  const now = new Date();
  return checkoutReviewSchema.parse({
    actorId,
    merchantId,
    planId: plan.id,
    nameAr: plan.nameAr,
    nameEn: plan.nameEn,
    billingCycle: input.billingCycle,
    mode: "upgrade",
    subscriptionId: 41,
    currency: plan.currency,
    priceMinor,
    creditMinor: 5000,
    chargeMinor: Math.max(0, priceMinor! - 5000),
    daysRemaining: 15,
    reviewedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 300000).toISOString(),
    token: "a".repeat(64),
  });
}
