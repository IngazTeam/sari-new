import {
  competitorSelection,
  competitorWorkspaceResult,
  competitorDetailResult,
  type CompetitorSelection,
} from "@shared/competitor-workspace";
export function competitorNavigation(search: string) {
  const p = new URLSearchParams(search),
    page = p.get("page");
  return competitorSelection.parse({
    query: (p.get("q") || "").trim().slice(0, 200),
    state: ["pending", "analyzing", "completed", "failed"].includes(
      p.get("state") || ""
    )
      ? p.get("state")
      : "all",
    sort: p.get("sort") === "oldest" ? "oldest" : "newest",
    page:
      page && /^[1-9]\d*$/.test(page) && Number(page) <= 100000
        ? Number(page)
        : 1,
  });
}
export function scopedCompetitors(
  raw: unknown,
  actorId: number,
  merchantId: number,
  selection: CompetitorSelection
) {
  const p = competitorWorkspaceResult.safeParse(raw);
  if (!p.success) return null;
  const d = p.data;
  return d.actorId === actorId &&
    d.merchantId === merchantId &&
    JSON.stringify(d.selection) === JSON.stringify(selection) &&
    d.matched <= d.stats.total &&
    d.pages === Math.ceil(d.matched / 25) &&
    d.currentPage === Math.min(selection.page, Math.max(1, d.pages)) &&
    d.rows.length ===
      Math.min(25, Math.max(0, d.matched - (d.currentPage - 1) * 25)) &&
    new Set(d.rows.map(r => r.id)).size === d.rows.length
    ? d
    : null;
}
export function scopedCompetitorDetail(
  raw: unknown,
  actorId: number,
  merchantId: number,
  id: number,
  page: number
) {
  const p = competitorDetailResult.safeParse(raw);
  if (!p.success) return null;
  const d = p.data;
  return d.actorId === actorId &&
    d.merchantId === merchantId &&
    d.report.id === id &&
    d.productPages === Math.ceil(d.report.products / 25) &&
    d.productPage === Math.min(page, Math.max(1, d.productPages)) &&
    d.products.length ===
      Math.min(25, Math.max(0, d.report.products - (d.productPage - 1) * 25)) &&
    d.pricing.pricedCount + d.pricing.unverifiedCount === d.report.products &&
    d.pricing.groups.reduce((n, g) => n + g.count, 0) ===
      d.pricing.pricedCount &&
    new Set(d.products.map(r => r.id)).size === d.products.length
    ? d
    : null;
}
export function competitorFields(name: string, url: string) {
  let valid = false;
  try {
    const u = new URL(url.trim());
    valid =
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      url.trim().length <= 500;
  } catch {}
  return { name: !name.trim() || name.trim().length > 255, url: !valid };
}
