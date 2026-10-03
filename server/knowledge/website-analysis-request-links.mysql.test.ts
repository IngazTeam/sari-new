import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  beginWebsiteAnalysisJob,
  readWebsiteAnalysisJob,
  finishWebsiteAnalysisJob,
  failWebsiteAnalysisJob,
  assertWebsiteAnalysisJob,
} from "./website-analysis-jobs";
import type {
  WebsiteJobExecution,
  WebsiteJobResult,
} from "../../shared/website-analysis-job";
describe.skipIf(!process.env.DATABASE_URL)(
  "durable joins to website analysis jobs",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      execution: WebsiteJobExecution,
      joined: string;
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const join = () =>
      beginWebsiteAnalysisJob(owner.userId, owner.merchantId, joined);
    const read = () =>
      readWebsiteAnalysisJob(owner.userId, owner.merchantId, joined);
    const result: WebsiteJobResult = {
      success: true,
      title: "Original report",
      knowledgeEvolution: null,
      salesIntelSummary: null,
      knowledgeError: null,
      indexingOutcome: { status: "not_attempted", indexedSections: null },
      crawlStats: null,
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("website-link425");
      other = await createDisposableMerchant("website-link425-other");
      joined = randomUUID();
      await query(
        "UPDATE merchants SET website_url='https://example.test' WHERE id IN (?,?)",
        [owner.merchantId, other.merchantId]
      );
      execution = (
        await beginWebsiteAnalysisJob(
          owner.userId,
          owner.merchantId,
          randomUUID()
        )
      ).execution!;
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("returns the caller reference and reads the original running attempt through it", async () => {
      expect(await join()).toMatchObject({
        created: false,
        jobId: joined,
        alreadyRunning: true,
        execution: null,
      });
      expect(await read()).toMatchObject({
        merchantId: owner.merchantId,
        jobId: joined,
        status: "running",
      });
      expect(JSON.stringify(await read())).not.toContain(execution.token);
      const rows = await query(
        "SELECT request_id,actor_id FROM website_analysis_request_links WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(rows).toEqual([{ request_id: joined, actor_id: owner.userId }]);
    });
    it("keeps a single binding for concurrent joins with the same reference", async () => {
      const accepted = await Promise.all([join(), join(), join()]);
      expect(accepted.every(v => v.jobId === joined && !v.created)).toBe(true);
      expect(
        await query(
          "SELECT request_id FROM website_analysis_request_links WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
      expect(
        await query(
          "SELECT id FROM website_analysis_jobs WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("recovers completion across connections and never creates another job from the joined reference", async () => {
      await join();
      await finishWebsiteAnalysisJob(execution, result);
      await query(
        "UPDATE website_analysis_jobs SET started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY) WHERE merchant_id=?",
        [owner.merchantId]
      );
      await closeDb();
      expect(await read()).toMatchObject({
        ...result,
        jobId: joined,
        status: "completed",
      });
      expect(await join()).toMatchObject({
        created: false,
        jobId: joined,
        alreadyRunning: false,
        execution: null,
      });
      expect(
        await query(
          "SELECT id FROM website_analysis_jobs WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("keeps a failed joined attempt terminal instead of resending it", async () => {
      await join();
      await failWebsiteAnalysisJob(execution);
      expect(await read()).toMatchObject({
        status: "error",
        issue: "processing_failed",
      });
      expect(await join()).toMatchObject({ created: false, execution: null });
    });
    it("does not retarget an interrupted join when a fresh attempt replaces the old worker", async () => {
      await join();
      await query(
        "UPDATE website_analysis_jobs SET started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE),lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      const fresh = await beginWebsiteAnalysisJob(
        owner.userId,
        owner.merchantId,
        randomUUID()
      );
      expect(fresh.created).toBe(true);
      expect(await join()).toMatchObject({
        created: false,
        jobId: joined,
        alreadyRunning: false,
      });
      expect(await read()).toMatchObject({
        status: "error",
        issue: "interrupted",
      });
      expect(
        await readWebsiteAnalysisJob(
          owner.userId,
          owner.merchantId,
          fresh.jobId
        )
      ).toMatchObject({ status: "running" });
    });
    it("rejects using a joined reference as execution authority even with the original token", async () => {
      await join();
      await expect(
        assertWebsiteAnalysisJob({ ...execution, jobId: joined })
      ).rejects.toMatchObject({ reason: "expired" });
    });
    it("does not reveal the joined result to another tenant and allows independent request namespaces", async () => {
      await join();
      expect(
        await readWebsiteAnalysisJob(other.userId, other.merchantId, joined)
      ).toEqual({
        merchantId: other.merchantId,
        jobId: joined,
        status: "idle",
      });
      await expect(
        readWebsiteAnalysisJob(other.userId, owner.merchantId, joined)
      ).rejects.toMatchObject({ reason: "forbidden" });
      expect(
        (await beginWebsiteAnalysisJob(other.userId, other.merchantId, joined))
          .created
      ).toBe(true);
    });
    it("rechecks account authority before reading or repeating a joined request", async () => {
      await join();
      await query("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
      await expect(join()).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("enforces tenant identity in the foreign key even for a direct SQL insert", async () => {
      const [job] = await query(
        "SELECT id FROM website_analysis_jobs WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(
        query(
          "INSERT INTO website_analysis_request_links (merchant_id,request_id,job_pk,actor_id) VALUES (?,?,?,?)",
          [other.merchantId, joined, job.id, other.userId]
        )
      ).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });
    });
    it.each([false, true])(
      "recovers an uncertain join commit without starting a second worker (committed=%s)",
      async committed => {
        const pool = (await getPool())!,
          connection = await pool.getConnection(),
          commit = connection.commit.bind(connection);
        vi.spyOn(pool, "getConnection").mockResolvedValueOnce(connection);
        const destroy = vi.spyOn(connection, "destroy");
        vi.spyOn(connection, "commit").mockImplementation(async () => {
          if (committed) await commit();
          throw Error("unknown");
        });
        await expect(join()).rejects.toMatchObject({ reason: "unknown" });
        expect(destroy).toHaveBeenCalledOnce();
        vi.restoreAllMocks();
        expect((await read()).status).toBe(committed ? "running" : "idle");
        expect(await join()).toMatchObject({ created: false, jobId: joined });
        expect(
          await query(
            "SELECT id FROM website_analysis_jobs WHERE merchant_id=?",
            [owner.merchantId]
          )
        ).toHaveLength(1);
      }
    );
  }
);
