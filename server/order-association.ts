import { and, eq, gte, lte, sql } from "drizzle-orm";
import { conversations, orders } from "../drizzle/schema";
import type { SariDb } from "./db/connection";
import { observationArm } from "../shared/insights-workspace";
/** Caller supplies its existing snapshot; all sources share the same read transaction. */
export async function readOrderAssociation(
  tx: Pick<SariDb, "select">,
  merchantId: number,
  window: { sqlFrom: string; sqlThrough: string }
) {
  const [links] = await tx
    .select({
      total: sql<number>`count(distinct ${conversations.id})`,
      matched: sql<number>`count(distinct case when ${orders.id} is not null then ${conversations.id} end)`,
    })
    .from(conversations)
    .leftJoin(
      orders,
      and(
        eq(orders.merchantId, conversations.merchantId),
        eq(orders.customerPhone, conversations.customerPhone),
        sql`trim(${conversations.customerPhone}) <> ''`,
        gte(orders.createdAt, window.sqlFrom),
        lte(orders.createdAt, window.sqlThrough)
      )
    )
    .where(
      and(
        eq(conversations.merchantId, merchantId),
        gte(conversations.createdAt, window.sqlFrom),
        lte(conversations.createdAt, window.sqlThrough)
      )
    );
  return {
    ...observationArm(Number(links.total), Number(links.matched)),
    evidenceKind: "exact_phone_match_to_any_order_in_period" as const,
    includesAllOrderStatuses: true as const,
    salesConversion: null,
    salesProficiency: null,
  };
}
