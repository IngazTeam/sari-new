import { it, expect, vi, beforeEach } from "vitest";
import {
  qualityReadoutInput,
  qualityFlag,
  qualityTrend,
} from "../shared/quality-readout";
const m = vi.hoisted(() => ({ getDb: vi.fn(), schema: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: m.getDb }));
vi.mock("./db/schema-readiness", () => ({ assertRuntimeSchema: m.schema }));
import { readQualityReadout } from "./quality-readout";
beforeEach(() => vi.resetAllMocks());
it('rejects a caller-supplied tenant override',()=>expect(()=>qualityReadoutInput.parse({days:30,merchantId:2})).toThrow());
it.each([0, -1, 1.1, 91, Infinity, NaN])("rejects unsupported days %s", days =>
  expect(() => qualityReadoutInput.parse({ days })).toThrow()
);
it("preserves zero and unknown denominators", () => {
  expect(qualityFlag(4, 0, 0)).toEqual({
    yes: 0,
    no: 0,
    unknown: 4,
    rate: null,
  });
  expect(qualityFlag(4, 0, 3)).toEqual({ yes: 0, no: 3, unknown: 1, rate: 0 });
  expect(qualityFlag(4, 1, 2).rate).toBe(33.3);
  expect(() => qualityFlag(1, 1, 1)).toThrow();
});
it("does not call insufficient evidence stable", () =>
  expect(qualityTrend(qualityFlag(4, 0, 4), qualityFlag(8, 0, 8))).toBe(
    "insufficient"
  ));
it.each([
  [4, 3, "stable"],
  [3, 4, "stable"],
  [5, 3, "declining"],
  [3, 5, "improving"],
] as const)(
  "compares the exact five-point boundary %s / %s",
  (current, previous, state) =>
    expect(
      qualityTrend(
        qualityFlag(20, current, 20 - current),
        qualityFlag(20, previous, 20 - previous)
      )
    ).toBe(state)
);
it("rejects a missing database instead of returning an empty successful report", async () => {
  m.getDb.mockResolvedValue(null);
  await expect(readQualityReadout(1)).rejects.toThrow("unavailable");
});
it("propagates query failure instead of reporting zero", async () => {
  m.getDb.mockResolvedValue({
    transaction: () => {
      throw Error("read failure");
    },
  });
  await expect(readQualityReadout(1)).rejects.toThrow("read failure");
});
it.each([0, -1, 1.5, NaN])(
  "rejects invalid tenant %s before reading",
  async id => {
    await expect(readQualityReadout(id)).rejects.toThrow("Invalid merchant");
    expect(m.getDb).not.toHaveBeenCalled();
  }
);
