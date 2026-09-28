export function orderValuesByCurrency(
  orders: readonly { status: string; totalAmount: number; currency: string }[]
) {
  return (["SAR", "USD"] as const).map(currency => ({
    currency,
    totalMinor: orders
      .filter(
        order => order.currency === currency && order.status !== "cancelled"
      )
      .reduce((sum, order) => sum + order.totalAmount, 0),
  }));
}
