import { describe, it, expect } from "vitest";
import { completeSalesTrend } from "../client/src/lib/sales-analytics-trend";
describe("sales chart calendar coverage", () => {
  it("keeps quiet days between activity and excludes a midnight end", () => {
    const rows = completeSalesTrend(
      [{ date: "2024-01-02", orders: 2, revenue: 100 }],
      "2024-01-01T12:00:00Z",
      "2024-01-04T00:00:00Z",
      "day"
    );
    expect(rows).toEqual([
      { date: "2024-01-01", orders: 0, revenue: 0 },
      { date: "2024-01-02", orders: 2, revenue: 100 },
      { date: "2024-01-03", orders: 0, revenue: 0 },
    ]);
  });
  it("includes partial weeks using the same Sunday boundary as the source", () => {
    expect(
      completeSalesTrend(
        [],
        "2024-01-02T12:00:00Z",
        "2024-01-14T00:00:00Z",
        "week"
      ).map(r => r.date)
    ).toEqual(["2023-12-31", "2024-01-07"]);
  });
  it("handles leap days in UTC", () => {
    expect(
      completeSalesTrend(
        [],
        "2024-02-28T00:00:00Z",
        "2024-03-01T12:00:00Z",
        "day"
      ).map(r => r.date)
    ).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
  });
  it("rejects invalid and unbounded periods", () => {
    expect(completeSalesTrend([], "bad", "2024-01-01", "day")).toEqual([]);
    expect(completeSalesTrend([], "2024-01-01", "2023-01-01", "day")).toEqual(
      []
    );
    expect(completeSalesTrend([], "2020-01-01", "2024-01-01", "day")).toEqual(
      []
    );
  });
});
