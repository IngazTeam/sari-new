import { expect, it } from "vitest";
import {
  competitorComparisonInput,
  competitorComparisonChoices,
  competitorComparisonOptions,
  competitorComparisonView,
} from "../shared/competitor-comparison";
it.each([
  { analysisId: 0, competitorIds: [1] },
  { analysisId: 1, competitorIds: [] },
  { analysisId: 1, competitorIds: [1, 1] },
  { analysisId: 1, competitorIds: [1, 2, 3, 4, 5, 6] },
  { analysisId: 1, competitorIds: [-1] },
  { analysisId: 1, competitorIds: [1], merchantId: 5 },
  { analysisId: 1, competitorIds: [1], actorId: 7 },
])("rejects incomplete or forged comparison selection %j", input =>
  expect(competitorComparisonInput.safeParse(input).success).toBe(false)
);
it.each([
  { source: "UNION" },
  { source: "website", page: 0 },
  { source: "website", query: "x".repeat(201) },
  { source: "website", merchantId: 2 },
])("rejects invalid choices selection %j", input =>
  expect(competitorComparisonChoices.safeParse(input).success).toBe(false)
);

const metrics = ["overall", "seo", "performance", "ux", "content"] as const;
const profile = (id: number, score: number) => ({
  report: {
    id,
    name: "Saved report",
    industry: null,
    url: null,
    status: "completed",
    createdAt: null,
    updatedAt: null,
    analyzedAt: null,
    scores: Object.fromEntries(metrics.map(m => [m, score])),
    products: 3,
    excludedProducts: 0,
    recordedProductCount: 3,
    failure: null,
    scoreEvidence: "website_estimate",
    salesProficiency: null,
  },
  pricing: {
    pricedCount: 2,
    unverifiedCount: 1,
    groups: [
      {
        currency: "SAR",
        count: 2,
        minimum: "10.00",
        maximum: "20.00",
        average: "15.000000",
      },
    ],
    evidence: "extracted_not_current",
  },
});
const comparison = () => ({
  actorId: 1,
  merchantId: 1,
  selection: { analysisId: 1, competitorIds: [2] },
  revision: "a".repeat(64),
  baseline: profile(1, 80),
  competitors: [
    {
      ...profile(2, 90),
      differences: metrics.map(metric => ({
        metric,
        baseline: 80,
        competitor: 90,
        difference: -10,
      })),
      commonCurrencies: ["SAR"],
    },
  ],
  evidence: "stored_website_estimates",
  priceComparability: "products_not_matched",
  salesProficiency: null,
});
it("accepts consistent saved evidence, real zero and missing estimates", () => {
  const data = comparison();
  expect(competitorComparisonView.safeParse(data).success).toBe(true);
  data.baseline.report.scores.performance = 0;
  data.competitors[0].report.scores.performance = 0;
  Object.assign(data.competitors[0].differences[2], {
    baseline: 0,
    competitor: 0,
    difference: 0,
  });
  expect(competitorComparisonView.safeParse(data).success).toBe(true);
  data.baseline.report.scores.content = null as any;
  Object.assign(data.competitors[0].differences[4], {
    baseline: null,
    difference: null,
  });
  expect(competitorComparisonView.safeParse(data).success).toBe(true);
  // Website and competitor reports are separate tables and may share the numeric ID.
  data.competitors[0].report.id = 1;
  data.selection.competitorIds = [1];
  expect(competitorComparisonView.safeParse(data).success).toBe(true);
});
const corruptions: [string, (d: ReturnType<typeof comparison>) => void][] = [
  [
    "wrong website",
    d => {
      d.baseline.report.id = 3;
    },
  ],
  [
    "wrong competitor",
    d => {
      d.competitors[0].report.id = 3;
    },
  ],
  [
    "missing competitor",
    d => {
      d.selection.competitorIds.push(3);
    },
  ],
  [
    "duplicate competitor",
    d => {
      d.competitors.push(structuredClone(d.competitors[0]));
    },
  ],
  [
    "unfinished website",
    d => {
      d.baseline.report.status = "analyzing";
    },
  ],
  [
    "unfinished competitor",
    d => {
      d.competitors[0].report.status = "failed";
    },
  ],
  [
    "duplicate metric",
    d => {
      d.competitors[0].differences[4] = { ...d.competitors[0].differences[0] };
    },
  ],
  [
    "wrong baseline score",
    d => {
      d.competitors[0].differences[0].baseline = 79;
    },
  ],
  [
    "wrong competitor score",
    d => {
      d.competitors[0].differences[0].competitor = 89;
    },
  ],
  [
    "wrong arithmetic",
    d => {
      d.competitors[0].differences[0].difference = 10;
    },
  ],
  [
    "hidden known difference",
    d => {
      d.competitors[0].differences[0].difference = null as any;
    },
  ],
  [
    "false known difference",
    d => {
      d.baseline.report.scores.overall = null as any;
      d.competitors[0].differences[0].baseline = null as any;
    },
  ],
  [
    "incorrect total",
    d => {
      d.baseline.report.products = 4;
    },
  ],
  [
    "incorrect priced count",
    d => {
      d.competitors[0].pricing.groups[0].count = 1;
    },
  ],
  [
    "duplicate currency",
    d => {
      d.baseline.pricing.groups.push({ ...d.baseline.pricing.groups[0] });
      d.baseline.pricing.pricedCount = 4;
      d.baseline.report.products = 5;
    },
  ],
  [
    "zero price",
    d => {
      d.baseline.pricing.groups[0].minimum = "0";
    },
  ],
  [
    "infinite price",
    d => {
      d.baseline.pricing.groups[0].maximum = "9".repeat(400);
    },
  ],
  [
    "reversed price range",
    d => {
      d.baseline.pricing.groups[0].minimum = "30";
    },
  ],
  [
    "average outside range",
    d => {
      d.baseline.pricing.groups[0].average = "21";
    },
  ],
  [
    "empty price group",
    d => {
      d.baseline.pricing.groups[0].count = 0;
      d.baseline.pricing.pricedCount = 0;
      d.baseline.pricing.unverifiedCount = 3;
    },
  ],
  [
    "false common currency",
    d => {
      d.competitors[0].commonCurrencies = ["USD"];
    },
  ],
  [
    "missing common currency",
    d => {
      d.competitors[0].commonCurrencies = [];
    },
  ],
  [
    "duplicate common currency",
    d => {
      d.competitors[0].commonCurrencies = ["SAR", "SAR"];
    },
  ],
];
it.each(corruptions)(
  "rejects contradictory comparison evidence: %s",
  (_, change) => {
    const data = comparison();
    change(data);
    expect(competitorComparisonView.safeParse(data).success).toBe(false);
  }
);
const options = () => ({
  actorId: 1,
  merchantId: 1,
  selection: { source: "website", query: "", page: 1 },
  rows: [profile(1, 80).report],
  matched: 1,
  pages: 1,
  currentPage: 1,
});
it.each(["pages", "currentPage", "matched", "unfinished", "duplicate"])(
  "rejects contradictory choices: %s",
  kind => {
    const data = options();
    if (kind === "pages") data.pages = 2;
    if (kind === "currentPage") data.currentPage = 2;
    if (kind === "matched") data.matched = 2;
    if (kind === "unfinished") data.rows[0].status = "pending";
    if (kind === "duplicate") {
      data.rows.push({ ...data.rows[0] });
      data.matched = 2;
    }
    expect(competitorComparisonOptions.safeParse(data).success).toBe(false);
  }
);
it("accepts an empty choices page and clamps an out-of-range page", () => {
  const empty = { ...options(), rows: [], matched: 0, pages: 0 };
  expect(competitorComparisonOptions.safeParse(empty).success).toBe(true);
  expect(
    competitorComparisonOptions.safeParse({
      ...options(),
      selection: { source: "website", query: "", page: 99 },
    }).success
  ).toBe(true);
});
