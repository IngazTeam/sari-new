import { z } from "zod";
export const dashboardWorkspaceInput = z
  .object({
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7),
  })
  .strict();
export const dashboardProductOrderLimit = 250;
export const dashboardProductCharacters = 16384;
const n = z.number().int().nonnegative().safe();
const metrics = z
  .object({
    totalOrders: n,
    validValueOrders: n,
    excludedValueOrders: n,
    totalValueMinor: n,
    deliveredOrders: n,
    deliveredValueMinor: n,
    excludedDeliveredValues: n,
    averageValueMinor: n.nullable(),
  })
  .strict();
export const dashboardWorkspaceSchema = z
  .object({
    version: z.literal(1),
    merchantId: n.positive(),
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    currency: z.enum(["SAR", "USD"]),
    timeZone: z.literal("UTC"),
    from: z.string().datetime(),
    through: z.string().datetime(),
    previousFrom: z.string().datetime(),
    current: metrics,
    previous: metrics,
    growth: z
      .object({
        orders: z.number().finite().nullable(),
        value: z.number().finite().nullable(),
      })
      .strict(),
    trend: z
      .array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            orders: n,
            deliveredOrders: n,
            valueMinor: n,
            deliveredValueMinor: n,
            excludedValues: n,
          })
          .strict()
      )
      .max(91),
    products: z
      .array(
        z
          .object({
            name: z.string().min(1),
            quantity: n.positive(),
            valueMinor: n,
            averageUnitMinor: n,
          })
          .strict()
      )
      .max(5),
    productSample: z
      .object({
        eligibleOrders: n,
        inspectedOrders: n.max(dashboardProductOrderLimit),
        omittedOrders: n,
        excludedOrders: n,
        excludedItems: n,
        includedItems: n,
        orderLimit: z.literal(dashboardProductOrderLimit),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const m of [v.current, v.previous])
      if (
        m.validValueOrders + m.excludedValueOrders !== m.totalOrders ||
        m.deliveredOrders > m.totalOrders ||
        m.excludedDeliveredValues > m.deliveredOrders
      )
        ctx.addIssue({ code: "custom", message: "Invalid dashboard counts" });
    if (
      v.productSample.inspectedOrders + v.productSample.omittedOrders !==
        v.productSample.eligibleOrders ||
      v.productSample.eligibleOrders !== v.current.deliveredOrders ||
      v.productSample.excludedOrders > v.productSample.inspectedOrders
    )
      ctx.addIssue({ code: "custom", message: "Invalid dashboard sample" });
    if (
      v.trend.reduce((n, row) => n + row.orders, 0) !== v.current.totalOrders ||
      v.trend.reduce((n, row) => n + row.valueMinor, 0) !==
        v.current.totalValueMinor ||
      v.trend.reduce((n, row) => n + row.deliveredOrders, 0) !==
        v.current.deliveredOrders ||
      v.trend.reduce((n, row) => n + row.deliveredValueMinor, 0) !==
        v.current.deliveredValueMinor ||
      v.trend.reduce((n, row) => n + row.excludedValues, 0) !==
        v.current.excludedValueOrders
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent dashboard trend" });
  });
export type DashboardWorkspace = z.infer<typeof dashboardWorkspaceSchema>;
