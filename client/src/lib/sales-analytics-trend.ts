type Point = { date: string; orders: number; revenue: number };
/** Empty buckets are zeros because the source returns every matching order in this window. */
export function completeSalesTrend(
  rows: Point[],
  from: string,
  through: string,
  group: "day" | "week"
): Point[] {
  const start = new Date(from),
    end = new Date(through);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start >= end ||
    end.getTime() - start.getTime() > 366 * 86400000
  )
    return [];
  start.setUTCHours(0, 0, 0, 0);
  if (group === "week")
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const byDate = new Map(rows.map(row => [row.date, row]));
  const result: Point[] = [];
  for (
    let at = start.getTime();
    at < end.getTime();
    at += (group === "day" ? 1 : 7) * 86400000
  ) {
    const date = new Date(at).toISOString().slice(0, 10);
    result.push(byDate.get(date) ?? { date, orders: 0, revenue: 0 });
  }
  return result;
}
