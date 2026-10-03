/** Presentation guards for historical rows; these estimates are not sales evidence. */
export function competitorCard(row: any) {
  const score = (value: unknown) =>
    row.status === "completed" &&
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
      ? value
      : null;
  const price = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : null;
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  let url: string | null = null,
    hostname: string | null = null;
  try {
    if (typeof row.url === "string") {
      const parsed = new URL(row.url);
      if (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      ) {
        url = parsed.href;
        hostname = parsed.hostname;
      }
    }
  } catch {
    /* Retain the card, but never render an unsafe or malformed link. */
  }
  const dateInput =
    typeof row.createdAt === "string" &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.createdAt)
      ? row.createdAt.replace(" ", "T") + "Z"
      : row.createdAt;
  const date =
    dateInput instanceof Date || typeof dateInput === "string"
      ? new Date(dateInput)
      : null;
  const avgPrice = price(row.avgPrice),
    minPrice = price(row.minPrice),
    maxPrice = price(row.maxPrice);
  const inconsistentPrices =
    (minPrice !== null && maxPrice !== null && minPrice > maxPrice) ||
    (avgPrice !== null && minPrice !== null && avgPrice < minPrice) ||
    (avgPrice !== null && maxPrice !== null && avgPrice > maxPrice);
  return {
    ...row,
    url,
    hostname,
    createdAt: date && Number.isFinite(date.getTime()) ? date : null,
    overallScore: score(row.overallScore),
    seoScore: score(row.seoScore),
    performanceScore: score(row.performanceScore),
    uxScore: score(row.uxScore),
    contentScore: score(row.contentScore),
    avgPrice: inconsistentPrices ? null : avgPrice,
    minPrice: inconsistentPrices ? null : minPrice,
    maxPrice: inconsistentPrices ? null : maxPrice,
    currency:
      typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency)
        ? row.currency
        : null,
    productCount:
      Number.isSafeInteger(row.productCount) && row.productCount >= 0
        ? row.productCount
        : null,
    strengths: list(row.strengths),
    weaknesses: list(row.weaknesses),
  };
}
