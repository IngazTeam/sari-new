import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const m = vi.hoisted(() => ({
  analyze: vi.fn(),
  ingest: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("./_core/websiteAnalyzer", () => ({
  analyzeWebsite: m.analyze,
  cleanScrapedText: (text: string) => text,
}));
vi.mock("./ai/knowledge-engine", () => ({ ingestContent: m.ingest }));
vi.mock("./ai/rag-engine", () => ({ embedAllSectionsWithEvidence: m.embed }));
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { sariBrainRouter } from "./routers-sari-brain";
import * as jobs from "./knowledge/website-analysis-jobs";
import { createSection } from "./db/knowledge";

describe.skipIf(!process.env.DATABASE_URL)(
  "durable website pipeline with local provider stubs",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      jobId: string;
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const caller = () =>
      sariBrainRouter.createCaller({
        user: { id: owner.userId, role: "user" },
        req: { headers: { "x-merchant-id": String(owner.merchantId) } },
        res: {},
      } as any);
    const input = () => ({ merchantId: owner.merchantId, jobId });
    const counts = {
      added: 1,
      merged: 0,
      evolved: 0,
      conflicts: 0,
      unchanged: 0,
    };
    const sample = {
      title: "Fixture site",
      industry: "Local fixture",
      overallScore: 70,
      _scrapedText: "Local knowledge source. ".repeat(20),
      _crawlStats: {
        pagesDiscovered: 1,
        pagesCrawled: 1,
        pagesSuccess: 1,
        mainPageWords: 40,
        totalWords: 50,
        enrichedTextLength: 200,
        faqsFound: 1,
      },
      faqs: [{ question: "Local question?", answer: "Local answer" }],
      _crawledPages: [
        {
          url: "https://example.test/about",
          title: "About",
          content: "Local facts",
          success: true,
          pageType: "about",
        },
      ],
    };
    const terminal = async () => {
      let status: any;
      await vi.waitFor(
        async () => {
          status = await caller().getAnalysisStatus(input());
          expect(status.status).not.toBe("running");
        },
        { timeout: 10_000 }
      );
      return status;
    };
    beforeEach(async () => {
      vi.resetAllMocks();
      owner = await createDisposableMerchant("website-api423");
      jobId = randomUUID();
      await query("UPDATE merchants SET website_url=? WHERE id=?", [
        "https://example.test",
        owner.merchantId,
      ]);
      m.analyze.mockResolvedValue(sample);
      m.ingest.mockImplementation(async () => {
        await createSection({
          merchantId: owner.merchantId,
          title: "Fixture knowledge",
          content: "Saved local knowledge",
          sectionType: "policies",
          source: "website",
          status: "approved",
        });
        return { evolveResult: counts };
      });
      m.embed.mockResolvedValue({
        selectedSections: 1,
        attemptedSections: 1,
        storedSections: 0,
        reusedSections: 0,
        unconfirmedSections: 1,
        currentSnapshot: {
          sections: 1,
          matchingEmbeddings: 0,
          changedSinceStart: false,
        },
      });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner?.userId].filter(Boolean));
    });
    afterAll(closeDb);
    it("stores the complete result and the actual analysis id and cleaned text, then recovers after reconnect", async () => {
      const accepted = await caller().reanalyzeWebsite(input());
      expect(accepted).toMatchObject({
        ...input(),
        started: true,
        alreadyRunning: false,
      });
      const report = await terminal();
      expect(report).toMatchObject({
        ...input(),
        status: "completed",
        title: "Fixture site",
        knowledgeEvolution: counts,
        indexingOutcome: {
          status: "observed",
          evidence: { unconfirmedSections: 1 },
        },
      });
      expect(report.crawlStats).toEqual({
        pagesDiscovered: 1,
        pagesCrawled: 1,
        pagesSuccess: 1,
        mainPageWords: 40,
        totalWords: 50,
      });
      const analyses = await query(
        "SELECT id,scraped_content FROM website_analyses WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(analyses).toHaveLength(1);
      expect(analyses[0].id).toBeGreaterThan(0);
      expect(analyses[0].scraped_content).toContain("Local knowledge source.");
      expect(
        await query("SELECT id FROM discovered_pages WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      await closeDb();
      expect(await caller().getAnalysisStatus(input())).toEqual(report);
      expect(await caller().reanalyzeWebsite(input())).toMatchObject({
        alreadyRunning: false,
      });
      expect(m.analyze).toHaveBeenCalledOnce();
    });
    it("joins duplicate and alternative starts without launching the provider again", async () => {
      let release!: (result: any) => void;
      m.analyze.mockImplementation(
        () => new Promise(resolve => (release = resolve))
      );
      await caller().reanalyzeWebsite(input());
      await vi.waitFor(() => expect(m.analyze).toHaveBeenCalledOnce());
      const joined = randomUUID();
      const responses = await Promise.all([
        caller().reanalyzeWebsite(input()),
        caller().reanalyzeWebsite({ ...input(), jobId: joined }),
      ]);
      expect(responses.map(row => row.jobId)).toEqual([jobId, joined]);
      expect(responses.every(row => row.alreadyRunning)).toBe(true);
      release(sample);
      expect((await terminal()).status).toBe("completed");
      expect(
        await caller().getAnalysisStatus({ ...input(), jobId: joined })
      ).toMatchObject({
        jobId: joined,
        status: "completed",
        title: sample.title,
      });
      await query(
        "UPDATE website_analysis_jobs SET started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(
        await caller().reanalyzeWebsite({ ...input(), jobId: joined })
      ).toMatchObject({ jobId: joined, alreadyRunning: false });
      expect(m.analyze).toHaveBeenCalledOnce();
    });
    it("preserves crawl facts and records partial knowledge without exposing raw processing errors", async () => {
      m.ingest.mockRejectedValue(Error("PRIVATE_PROVIDER_SECRET"));
      await caller().reanalyzeWebsite(input());
      const report = await terminal();
      expect(report).toMatchObject({
        status: "completed",
        knowledgeError: "knowledge_processing_incomplete",
        knowledgeEvolution: null,
        indexingOutcome: { status: "not_attempted" },
      });
      expect(JSON.stringify(report)).not.toContain("PRIVATE");
      expect(
        await query("SELECT id FROM website_analyses WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      expect(m.embed).not.toHaveBeenCalled();
    });
    it("records provider failure durably without returning its message", async () => {
      m.analyze.mockRejectedValue(Error("PRIVATE_ACCESS_TOKEN"));
      await caller().reanalyzeWebsite(input());
      expect(await terminal()).toEqual({
        ...input(),
        status: "error",
        issue: "processing_failed",
      });
      await closeDb();
      expect(await caller().getAnalysisStatus(input())).toMatchObject({
        status: "error",
        issue: "processing_failed",
      });
      expect(m.ingest).not.toHaveBeenCalled();
    });
    it("does not store a late crawl after a replacement attempt owns the tenant", async () => {
      const failed = vi.spyOn(jobs, "failWebsiteAnalysisJob");
      let release!: (result: any) => void;
      m.analyze.mockImplementation(
        () => new Promise(resolve => (release = resolve))
      );
      await caller().reanalyzeWebsite(input());
      await vi.waitFor(() => expect(m.analyze).toHaveBeenCalledOnce());
      await query(
        "UPDATE website_analysis_jobs SET started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE),lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      const next = await jobs.beginWebsiteAnalysisJob(
        owner.userId,
        owner.merchantId,
        randomUUID()
      );
      release(sample);
      await vi.waitFor(() =>
        expect(failed.mock.settledResults[0]?.type).toBe("rejected")
      );
      expect(await caller().getAnalysisStatus(input())).toMatchObject({
        status: "error",
        issue: "interrupted",
      });
      expect(
        await jobs.readWebsiteAnalysisJob(
          owner.userId,
          owner.merchantId,
          next.jobId
        )
      ).toMatchObject({ status: "running" });
      expect(
        await query("SELECT id FROM website_analyses WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
      expect(m.ingest).not.toHaveBeenCalled();
    });
    it("retains already saved facts but blocks indexing after execution expires during ingestion", async () => {
      const failed = vi.spyOn(jobs, "failWebsiteAnalysisJob");
      let release!: () => void;
      m.ingest.mockImplementation(async () => {
        await createSection({
          merchantId: owner.merchantId,
          title: "Before expiry",
          content: "Authorized earlier",
          sectionType: "policies",
          source: "website",
          status: "approved",
        });
        await new Promise<void>(resolve => (release = resolve));
        return { evolveResult: counts };
      });
      await caller().reanalyzeWebsite(input());
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      await query(
        "UPDATE website_analysis_jobs SET lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      release();
      await vi.waitFor(() =>
        expect(failed.mock.settledResults[0]?.type).toBe("rejected")
      );
      expect(await caller().getAnalysisStatus(input())).toMatchObject({
        status: "error",
        issue: "interrupted",
      });
      expect(m.embed).not.toHaveBeenCalled();
      expect(
        await query("SELECT id FROM knowledge_sections WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
    });
  }
);
