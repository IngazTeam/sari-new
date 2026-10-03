import {
  competitorAnalysisStart,
  competitorAnalysisAttempt,
  competitorAnalysisReceipt,
} from "../../../shared/competitor-analysis-job";
import {
  competitorSelection,
  competitorDetailSelection,
  competitorDeleteInput,
  competitorWorkspaceResult,
  competitorDetailResult,
  type CompetitorDetail,
} from "../../../shared/competitor-workspace";
import type { ServiceMode } from "./service-preview-model";
export const competitorPreviewQueries = [
  "websiteAnalysis.competitorWorkspace",
  "websiteAnalysis.competitorDetail",
  "websiteAnalysis.competitorAnalysisAttempt",
] as const;
export const competitorPreviewMutations = [
  "websiteAnalysis.addCompetitor",
  "websiteAnalysis.closeCompetitorAnalysisAttempt",
  "websiteAnalysis.deleteReviewedCompetitor",
] as const;
const fault = (reason: string, code = "BAD_REQUEST") => ({
  message: "competitor_workspace:" + reason,
  data: { code },
});
export class CompetitorPreviewStore {
  writes = 0;
  private rows = new Map<number, CompetitorDetail>();
  private attempts = new Map<
    string,
    { competitorId: number | null; name: string; url: string }
  >();
  constructor(
    readonly actorId: number,
    readonly merchantId: number,
    readonly now: string,
    private mode: () => ServiceMode
  ) {
    if (mode() === "empty") return;
    for (let id = 1; id <= 32; id++) {
      const legacy = mode() === "legacy" && id === 32,
        status =
          id === 31 ? "analyzing" : id % 9 === 0 ? "failed" : "completed";
      const products: CompetitorDetail["products"] =
        id === 32
          ? Array.from({ length: 28 }, (_, i) => ({
              id: i + 1,
              name: `منتج ${i + 1} · Product ${i + 1}`,
              description:
                i === 0
                  ? "تفاصيل المنتج المحفوظة كاملة دون اختصار. Full saved product details. ".repeat(
                      8
                    )
                  : "وصف توضيحي · Synthetic description",
              category: "توضيحي · Sample",
              price: i > 24 ? null : String((i + 1) * 10) + ".00",
              currency: i > 24 ? null : i % 2 ? "USD" : "SAR",
              url: i === 0 ? "https://example.test/product" : null,
              imageUrl: null,
              matchedProduct:
                i === 0 ? { id: 1, name: "منتج متجرك · Your product" } : null,
              comparisonEvidence: "not_verified",
              priceEvidence: i > 24 ? "unverified" : "extracted",
            }))
          : [];
      const groups = ["SAR", "USD"]
        .map(currency => {
          const prices = products
            .filter(p => p.currency === currency)
            .map(p => Number(p.price));
          return {
            currency,
            count: prices.length,
            minimum: String(Math.min(...prices)),
            maximum: String(Math.max(...prices)),
            average: (
              prices.reduce((a, b) => a + b, 0) / prices.length
            ).toFixed(2),
          };
        })
        .filter(g => g.count > 0);
      const d: CompetitorDetail = {
        actorId,
        merchantId,
        canManage: true,
        revision: this.marker(id),
        report: {
          id,
          name: `${merchantId === 269 ? "نواة · Nawa" : "مدار · Madar"} · منافس Competitor ${id}${id === 1 ? " %_literal" : ""}`,
          industry: "تجارة تجزئة · Retail",
          url: legacy ? null : "https://example.test/competitor/" + id,
          status,
          createdAt: now,
          updatedAt: now,
          analyzedAt: status === "completed" ? now : null,
          scores: {
            overall: status === "completed" && !legacy ? 75 : null,
            seo: status === "completed" ? 80 : null,
            performance: status === "completed" ? 0 : null,
            ux: status === "completed" ? 65 : null,
            content: status === "completed" ? 90 : null,
          },
          products: products.length,
          excludedProducts:
            mode() === "unavailable-reference" && id === 32 ? 1 : 0,
          recordedProductCount: id === 32 ? 99 : 0,
          failure: status === "failed" ? "analysis_failed" : null,
          scoreEvidence: "website_estimate",
          salesProficiency: null,
        },
        notes: {
          strengths: {
            items: Array.from(
              { length: 6 },
              (_, i) => `نقطة قوة ${i + 1} · Saved strength ${i + 1}`
            ),
            invalid: false,
          },
          weaknesses: {
            items: legacy
              ? []
              : ["راجع تفاصيل الشحن · Review delivery details"],
            invalid: legacy,
          },
          opportunities: {
            items: [
              "قارن منتجات من العملة نفسها · Compare products in the same currency",
            ],
            invalid: false,
          },
        },
        products,
        productPages: Math.ceil(products.length / 25),
        productPage: 1,
        pricing: {
          pricedCount: products.filter(p => p.price !== null).length,
          unverifiedCount: products.filter(p => p.price === null).length,
          groups,
          evidence: "extracted_not_current",
        },
      };
      // Keep all synthetic products in memory; the actual read returns one page.
      this.rows.set(id, d);
    }
  }
  private marker(id: number) {
    return [this.merchantId, id, this.writes, 0, 0, 0, 0, 0]
      .map(n => n.toString(16).padStart(8, "0"))
      .join("");
  }
  read(name: string, input: unknown) {
    const canManage = this.mode() !== "readonly";
    if (name === "websiteAnalysis.competitorAnalysisAttempt") {
      const { requestId } = competitorAnalysisAttempt.parse(input),
        saved = this.attempts.get(requestId);
      const report = saved?.competitorId
        ? this.rows.get(saved.competitorId)
        : null;
      return competitorAnalysisReceipt.parse({
        actorId: this.actorId,
        merchantId: this.merchantId,
        requestId,
        state: !saved
          ? "idle"
          : saved.competitorId === null
            ? "closed"
            : report?.report.status === "completed"
              ? "completed"
              : report?.report.status === "failed"
                ? "failed"
                : "running",
        competitorId: saved?.competitorId ?? null,
        reportAvailable: !!report,
      });
    }

    if (name === "websiteAnalysis.competitorWorkspace") {
      const selection = competitorSelection.parse(input),
        all = Array.from(this.rows.values()).map(d => d.report);
      const rows = all
        .filter(
          r =>
            (selection.state === "all" || r.status === selection.state) &&
            `${r.name} ${r.url} ${r.id}`
              .toLowerCase()
              .includes(selection.query.toLowerCase())
        )
        .sort((a, b) =>
          selection.sort === "oldest" ? a.id - b.id : b.id - a.id
        );
      const pages = Math.ceil(rows.length / 25),
        currentPage = Math.min(selection.page, Math.max(1, pages));
      return competitorWorkspaceResult.parse({
        actorId: this.actorId,
        merchantId: this.merchantId,
        selection,
        canManage,
        rows: rows.slice((currentPage - 1) * 25, currentPage * 25),
        matched: rows.length,
        pages,
        currentPage,
        stats: {
          total: all.length,
          completed: all.filter(r => r.status === "completed").length,
          running: all.filter(r => ["pending", "analyzing"].includes(r.status))
            .length,
          failed: all.filter(r => r.status === "failed").length,
        },
      });
    }
    if (name !== "websiteAnalysis.competitorDetail") throw fault("unmapped");
    const selected = competitorDetailSelection.parse(input);
    if (this.mode() === "choices-error")
      throw fault("unavailable", "INTERNAL_SERVER_ERROR");
    const d = this.rows.get(selected.id);
    if (!d) throw fault("missing", "NOT_FOUND");
    const productPage = Math.min(
      selected.productPage,
      Math.max(1, d.productPages)
    );
    return competitorDetailResult.parse({
      ...d,
      canManage,
      productPage,
      products: d.products.slice((productPage - 1) * 25, productPage * 25),
    });
  }
  mutate(name: string, input: unknown) {
    if (this.mode() === "readonly") throw fault("forbidden", "FORBIDDEN");
    if (name === "websiteAnalysis.closeCompetitorAnalysisAttempt") {
      const { requestId } = competitorAnalysisAttempt.parse(input);
      if (!this.attempts.has(requestId)) {
        this.attempts.set(requestId, { competitorId: null, name: "", url: "" });
        this.writes++;
      }
      return this.read("websiteAnalysis.competitorAnalysisAttempt", {
        requestId,
      });
    }
    if (name === "websiteAnalysis.addCompetitor") {
      const p = competitorAnalysisStart.parse(input),
        previous = this.attempts.get(p.requestId);
      const parsedUrl = new URL(p.url);
      if (
        parsedUrl.protocol !== "https:" ||
        parsedUrl.username ||
        parsedUrl.password
      )
        throw fault("website");
      if (previous) {
        if (
          previous.competitorId === null ||
          previous.name !== p.name ||
          previous.url !== p.url
        )
          throw fault("stale", "CONFLICT");
        return {
          competitorId: previous.competitorId,
          requestId: p.requestId,
          created: false,
        };
      }
      const id = Math.max(0, ...Array.from(this.rows.keys())) + 1;
      this.writes++;
      this.rows.set(id, {
        actorId: this.actorId,
        merchantId: this.merchantId,
        canManage: true,
        revision: this.marker(id),
        report: {
          id,
          name: p.name,
          industry: null,
          url: p.url,
          status: "pending",
          createdAt: this.now,
          updatedAt: this.now,
          analyzedAt: null,
          scores: {
            overall: null,
            seo: null,
            performance: null,
            ux: null,
            content: null,
          },
          products: 0,
          excludedProducts: 0,
          recordedProductCount: 0,
          failure: null,
          scoreEvidence: "website_estimate",
          salesProficiency: null,
        },
        notes: {
          strengths: { items: [], invalid: false },
          weaknesses: { items: [], invalid: false },
          opportunities: { items: [], invalid: false },
        },
        products: [],
        productPage: 1,
        productPages: 0,
        pricing: {
          groups: [],
          pricedCount: 0,
          unverifiedCount: 0,
          evidence: "extracted_not_current",
        },
      });
      this.attempts.set(p.requestId, {
        competitorId: id,
        name: p.name,
        url: p.url,
      });
      return { competitorId: id, requestId: p.requestId, created: true };
    }
    if (name !== "websiteAnalysis.deleteReviewedCompetitor")
      throw fault("unmapped");
    const p = competitorDeleteInput.parse(input),
      d = this.rows.get(p.id);
    if (!d) throw fault("missing", "NOT_FOUND");
    if (d.report.excludedProducts)
      throw fault("reference", "PRECONDITION_FAILED");
    if (!["completed", "failed"].includes(d.report.status))
      throw fault("running", "PRECONDITION_FAILED");
    if (p.expectedRevision !== d.revision) throw fault("stale", "CONFLICT");
    this.rows.delete(p.id);
    this.writes++;
    return { merchantId: this.merchantId, id: p.id, success: true };
  }
}
