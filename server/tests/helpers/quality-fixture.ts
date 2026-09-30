import {
  qualityFlag,
  type QualityReadout,
} from "../../../shared/quality-readout";
export function qualityFixture(days = 30): QualityReadout {
  const through = "2026-10-01T12:00:00.000Z";
  return {
    days,
    from: new Date(Date.parse(through) - days * 86400000).toISOString(),
    through,
    totalResponses: 20,
    avgResponseTimeMs: 840,
    responseTimeSamples: 18,
    cache: qualityFlag(20, 5, 12),
    shortResponses: qualityFlag(20, 2, 18),
    escalation: qualityFlag(20, 0, 20),
    sentiment: { positive: 6, neutral: 4, negative: 3, unknown: 7 },
    questions: [
      { text: "ما شروط الاسترجاع؟ · What is the return policy?", count: 5 },
      { text: "هل يتوفر الشحن إلى مدينتي؟", count: 3 },
    ],
    recent: [
      {
        id: 101,
        question: "ما شروط الاسترجاع؟",
        response: "راجع السياسة المعتمدة في المتجر.",
        createdAt: "2026-09-30T12:00:00.000Z",
      },
    ],
    trend: {
      state: "insufficient",
      current: qualityFlag(6, 1, 5),
      previous: qualityFlag(2, 0, 2),
    },
  };
}
