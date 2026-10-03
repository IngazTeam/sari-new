import * as analyzer from "./_core/websiteAnalyzer";
import { runCompetitorAnalysisContext } from "./competitor-analysis-context";
import {
  assertCompetitorAnalysisJob,
  advanceCompetitorAnalysisJob,
  finishCompetitorAnalysisJob,
  failCompetitorAnalysisJob,
} from "./competitor-analysis-jobs";
import type { CompetitorAnalysisExecution } from "../shared/competitor-analysis-job";

export async function runCompetitorAnalysisWorker(
  scope: CompetitorAnalysisExecution,
  url: string
) {
  let pending: Promise<void> | null = null,
    stopped = false;
  const timer = setInterval(() => {
    if (stopped || pending) return;
    pending = advanceCompetitorAnalysisJob(scope)
      .catch(() => {
        stopped = true;
        clearInterval(timer);
      })
      .finally(() => {
        pending = null;
      });
  }, 30_000);
  timer.unref?.();
  try {
    await runCompetitorAnalysisContext(
      scope.merchantId,
      () => assertCompetitorAnalysisJob(scope),
      async () => {
        await assertCompetitorAnalysisJob(scope);
        const result = await analyzer.analyzeWebsite(url, scope.merchantId);
        await assertCompetitorAnalysisJob(scope);
        // Reuse the analyzed snapshot instead of fetching a different version for product extraction.
        const products = await analyzer.extractProducts(
          url,
          result._scrapedHtml,
          result._scrapedText + "\n" + result._enrichedText,
          scope.merchantId,
          { requireVerifiedOutcome: true }
        );
        await assertCompetitorAnalysisJob(scope);
        await finishCompetitorAnalysisJob(scope, {
          scores: {
            overall: result.overallScore,
            seo: result.seoScore,
            performance: result.performanceScore,
            ux: result.uxScore,
            content: result.contentQuality,
          },
          industry:
            typeof result.industry === "string" ? result.industry : null,
          products: products.map(p => ({
            name: p.name,
            description: p.description ?? null,
            price: p.price ?? null,
            currency: p.currency || null,
            imageUrl: p.imageUrl || null,
            productUrl: p.productUrl || null,
            category: p.category || null,
          })),
        });
      }
    );
  } catch {
    console.error("[CompetitorAnalysis] Durable worker failed");
    try {
      await failCompetitorAnalysisJob(scope);
    } catch {
      console.error("[CompetitorAnalysis] Outcome requires receipt review");
    }
  } finally {
    stopped = true;
    clearInterval(timer);
    await pending;
  }
}
