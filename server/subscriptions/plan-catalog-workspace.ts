import { withMerchantOwnerSettings } from "../accounts/merchant-settings-authority";
import {
  planCatalogWorkspaceSchema,
  projectCatalogPlan,
} from "../../shared/plan-catalog-workspace";
import { subscriptionTimestamp } from "../../shared/subscription-usage";
export async function readPlanCatalogWorkspace(
  actorId: number,
  merchantId: number
) {
  return withMerchantOwnerSettings(
    actorId,
    merchantId,
    false,
    async (tx, authority) => {
      const [clock] = await tx.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
      const value = Array.isArray(clock) ? clock[0]?.now : null;
      const epoch =
        value instanceof Date ? value.getTime() : subscriptionTimestamp(value);
      if (epoch === null || !Number.isFinite(epoch))
        throw Error("plan_catalog:unavailable");
      const [rows] = await tx.execute<
        any[]
      >(`SELECT id,name,name_en,description,description_en,monthly_price,yearly_price,currency,
    max_customers,max_whatsapp_numbers,conversation_limit,message_limit,voice_message_limit,features
    FROM subscription_plans WHERE is_active=1 ORDER BY sort_order,id`);
      if (!Array.isArray(rows)) throw Error("plan_catalog:unavailable");
      return planCatalogWorkspaceSchema.parse({
        actorId,
        merchantId,
        canManage: authority.canManage,
        checkedAt: new Date(epoch).toISOString(),
        plans: rows.map(projectCatalogPlan),
      });
    }
  );
}
