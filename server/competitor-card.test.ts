import { expect, it } from "vitest";
import { competitorCard } from "../client/src/lib/competitor-card";
it.each([
  "javascript:alert(1)",
  "data:text/html,private",
  "file:///etc/passwd",
  "https://user:private@example.test",
  "broken",
  null,
])("keeps a historical card without rendering unsafe URL %s", url => {
  const row = competitorCard({ id: 8, url });
  expect(row.id).toBe(8);
  expect(row.url).toBeNull();
  expect(row.hostname).toBeNull();
});
it("retains a valid public HTTP link and parsed hostname", () => {
  expect(competitorCard({ url: "https://example.test/path" })).toMatchObject({
    url: "https://example.test/path",
    hostname: "example.test",
  });
});
it.each([null, undefined, "80", NaN, Infinity, -1, 101])(
  "does not invent a website score from %s",
  overallScore => {
    expect(
      competitorCard({ status: "completed", overallScore }).overallScore
    ).toBeNull();
  }
);
it("retains actual zero scores but suppresses unfinished estimates", () => {
  expect(
    competitorCard({ status: "completed", overallScore: 0 }).overallScore
  ).toBe(0);
  for (const status of ["pending", "analyzing", "failed"])
    expect(
      competitorCard({ status, overallScore: 80 }).overallScore
    ).toBeNull();
});
it.each([null, NaN, Infinity, "30", -1, 0])(
  "does not show %s as a verified price",
  avgPrice => {
    expect(competitorCard({ avgPrice }).avgPrice).toBeNull();
  }
);
it.each([
  { minPrice: 20, maxPrice: 10, avgPrice: 15 },
  { minPrice: 10, maxPrice: 30, avgPrice: 50 },
])("hides inconsistent historical price summaries", patch => {
  expect(competitorCard(patch)).toMatchObject({
    minPrice: null,
    maxPrice: null,
    avgPrice: null,
  });
});
it("retains only valid date, currency and textual notes", () => {
  expect(
    competitorCard({
      createdAt: "broken",
      currency: "<bad>",
      strengths: [null, {}, "Useful note"],
      weaknesses: {},
    })
  ).toMatchObject({
    createdAt: null,
    currency: null,
    strengths: ["Useful note"],
    weaknesses: [],
  });
  expect(
    competitorCard({
      createdAt: "2026-10-03 12:30:00",
      currency: "USD",
      avgPrice: 10,
    }).createdAt?.toISOString()
  ).toBe("2026-10-03T12:30:00.000Z");
});
