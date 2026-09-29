import type { MessageSnapshot } from "../../../client/src/lib/message-export";
export function messageWorkspaceFixture(): MessageSnapshot {
  return {
    merchantId: 20,
    period: "7d",
    from: "2026-09-23T00:00:00.000Z",
    through: "2026-09-29T10:00:00.000Z",
    timeZone: "UTC",
    messages: {
      total: 10,
      incoming: 6,
      outgoing: 4,
      activeConversations: 3,
      byType: [
        { kind: "text", count: 6, share: 60 },
        { kind: "voice", count: 2, share: 20 },
        { kind: "image", count: 1, share: 10 },
        { kind: "document", count: 1, share: 10 },
      ],
    },
    daily: [0, 0, 0, 2, 3, 4, 1].map((count, i) => ({
      date: `2026-09-${23 + i}`,
      count,
    })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hour === 12 ? 10 : 0,
    })),
    sentiment: {
      incoming: 6,
      classified: 4,
      unclassified: 2,
      classificationCoverage: (4 / 6) * 100,
      distribution: (
        [
          "positive",
          "negative",
          "neutral",
          "happy",
          "angry",
          "sad",
          "frustrated",
        ] as const
      ).map(kind => ({
        kind,
        count:
          kind === "positive"
            ? 2
            : kind === "neutral" || kind === "sad"
              ? 1
              : 0,
        share:
          ((kind === "positive"
            ? 2
            : kind === "neutral" || kind === "sad"
              ? 1
              : 0) /
            6) *
          100,
      })),
      confidence: {
        average: 80,
        validCount: 4,
        invalidCount: 0,
        meaning: "model_self_report_not_accuracy",
      },
      evidenceKind: "latest_stored_analysis_per_incoming_message",
      measuredSatisfaction: null,
    },
    products: {
      rows: [
        {
          productId: 5,
          productName:
            "قهوة مختصة من المرتفعات - اسم طويل لاختبار التفاف النص وإظهار المنتج كاملًا",
          price: 1250,
          priceUnit: "minor",
          currency: "SAR",
          mentionCount: 3,
        },
        {
          productId: 6,
          productName: '=HYPERLINK("https://invalid.test")',
          price: 99,
          priceUnit: "unverified",
          currency: "USD",
          mentionCount: 1,
        },
      ],
      limit: 10,
      evidenceKind: "literal_current_catalog_name_in_incoming_text",
      priceMeaning: "current_catalog_price",
    },
    orderAssociation: {
      total: 3,
      positive: 1,
      ratio: 100 / 3,
      valid: true,
      evidenceKind: "exact_phone_match_to_any_order_in_period",
      includesAllOrderStatuses: true,
      salesConversion: null,
      salesProficiency: null,
    },
  };
}
