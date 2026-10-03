export function competitorViewFixture(actorId = 7, merchantId = 20) {
  const report = {
    id: 8,
    name: "Fixture competitor",
    industry: "Retail",
    url: "https://example.test/",
    status: "completed" as const,
    createdAt: "2026-10-04T08:00:00.000Z",
    updatedAt: "2026-10-04T08:00:00.000Z",
    analyzedAt: "2026-10-04T08:00:00.000Z",
    scores: { overall: 75, seo: 50, performance: 0, ux: 80, content: null },
    products: 2,
    excludedProducts: 0,
    recordedProductCount: 99,
    failure: null,
    scoreEvidence: "website_estimate" as const,
    salesProficiency: null,
  };
  const selection = {
    query: "",
    state: "all" as const,
    sort: "newest" as const,
    page: 1,
  };
  const workspace = {
    actorId,
    merchantId,
    selection,
    canManage: true,
    rows: [report],
    matched: 1,
    pages: 1,
    currentPage: 1,
    stats: { total: 1, completed: 1, running: 0, failed: 0 },
  };
  const detail = {
    actorId,
    merchantId,
    canManage: true,
    revision: "a".repeat(64),
    report,
    notes: {
      strengths: {
        items: ["<b>Literal strength</b>", "Final strength"],
        invalid: false,
      },
      weaknesses: { items: [], invalid: true },
      opportunities: { items: ["Saved suggestion"], invalid: false },
    },
    products: [
      {
        id: 1,
        name: "SAR product",
        description: "Full product description",
        category: "Category",
        price: "20.00",
        currency: "SAR",
        url: "https://example.test/product",
        imageUrl: null,
        matchedProduct: null,
        comparisonEvidence: "not_verified" as const,
        priceEvidence: "extracted" as const,
      },
      {
        id: 2,
        name: "USD product",
        description: null,
        category: null,
        price: "10.00",
        currency: "USD",
        url: null,
        imageUrl: null,
        matchedProduct: { id: 4, name: "Own product" },
        comparisonEvidence: "not_verified" as const,
        priceEvidence: "extracted" as const,
      },
    ],
    productPages: 1,
    productPage: 1,
    pricing: {
      pricedCount: 2,
      unverifiedCount: 0,
      groups: [
        {
          currency: "SAR",
          count: 1,
          minimum: "20.00",
          maximum: "20.00",
          average: "20.00",
        },
        {
          currency: "USD",
          count: 1,
          minimum: "10.00",
          maximum: "10.00",
          average: "10.00",
        },
      ],
      evidence: "extracted_not_current" as const,
    },
  };
  return { workspace, detail };
}
