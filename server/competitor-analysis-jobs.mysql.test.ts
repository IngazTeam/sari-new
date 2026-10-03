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
import { closeDb, getPool } from "./db/connection";
import {
  assertDisposableDatabase,
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  beginCompetitorAnalysisJob,
  readCompetitorAnalysisJob,
  assertCompetitorAnalysisJob,
  advanceCompetitorAnalysisJob,
  finishCompetitorAnalysisJob,
  failCompetitorAnalysisJob,
  settleCompetitorAnalysisJobs,
} from "./competitor-analysis-jobs";
import type { CompetitorAnalysisResult } from "../shared/competitor-analysis-job";
describe.skipIf(!process.env.DATABASE_URL)(
  "durable competitor attempts in disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      requestId: string;
    const q = async (sql: string, args: any[] = []) => {
      assertDisposableDatabase();
      return (await (await getPool())!.execute<any>(sql, args))[0];
    };
    const start = () =>
      beginCompetitorAnalysisJob(owner.userId, owner.merchantId, {
        requestId,
        name: "Synthetic competitor",
        url: "https://example.test/shop",
      });
    const read = () =>
      readCompetitorAnalysisJob(owner.userId, owner.merchantId, { requestId });
    const product = {
      name: "Synthetic product",
      description: "Local fixture",
      price: 12.5,
      currency: "SAR",
      imageUrl: null,
      productUrl: "https://example.test/item",
      category: null,
    };
    const result: CompetitorAnalysisResult = {
      scores: { overall: 75, seo: 70, performance: 0, ux: 80, content: 65 },
      industry: "Retail",
      products: [
        product,
        { ...product, name: "Dollar product", currency: "USD" },
      ],
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("competitor437");
      other = await createDisposableMerchant("competitor437-other");
      requestId = randomUUID();
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("creates a report and private worker identity atomically and reads a scoped receipt", async () => {
      const started = await start();
      expect(started.created).toBe(true);
      expect(await read()).toEqual({
        actorId: owner.userId,
        merchantId: owner.merchantId,
        requestId,
        state: "running",
        competitorId: started.competitorId,
        reportAvailable: true,
      });
      expect(JSON.stringify(await read())).not.toContain(
        started.execution!.token
      );
      expect(
        (
          await q("SELECT status,name FROM competitor_analyses WHERE id=?", [
            started.competitorId,
          ])
        )[0]
      ).toEqual({ status: "analyzing", name: "Synthetic competitor" });
      expect(
        await readCompetitorAnalysisJob(other.userId, other.merchantId, {
          requestId,
        })
      ).toMatchObject({ state: "idle", competitorId: null });
      await expect(
        readCompetitorAnalysisJob(other.userId, owner.merchantId, { requestId })
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("schedules exactly once for simultaneous identical starts", async () => {
      const starts = await Promise.all([start(), start(), start()]);
      expect(starts.filter(s => s.created)).toHaveLength(1);
      expect(new Set(starts.map(s => s.competitorId)).size).toBe(1);
      expect(
        await q("SELECT id FROM competitor_analyses WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
    });
    it("rejects a different request while work is active and rejects altered replay", async () => {
      await start();
      await expect(
        beginCompetitorAnalysisJob(owner.userId, owner.merchantId, {
          requestId: randomUUID(),
          name: "Other",
          url: "https://other.test/",
        })
      ).rejects.toMatchObject({ reason: "busy" });
      await expect(
        beginCompetitorAnalysisJob(owner.userId, owner.merchantId, {
          requestId,
          name: "Changed",
          url: "https://example.test/shop",
        })
      ).rejects.toMatchObject({ reason: "stale" });
    });
    it("isolates identical request ids between tenants and rejects swapped tokens", async () => {
      const first = await start(),
        second = await beginCompetitorAnalysisJob(
          other.userId,
          other.merchantId,
          { requestId, name: "Other", url: "https://other.test/" }
        );
      expect(second.created).toBe(true);
      expect(second.competitorId).not.toBe(first.competitorId);
      await expect(
        assertCompetitorAnalysisJob({
          ...first.execution!,
          token: second.execution!.token,
        })
      ).rejects.toMatchObject({ reason: "expired" });
    });
    it("saves every product and report outcome together, preserving currencies and real zero", async () => {
      const accepted = await start();
      await finishCompetitorAnalysisJob(accepted.execution!, result);
      expect(await read()).toMatchObject({ state: "completed" });
      expect(
        (
          await q(
            "SELECT status,product_count,avg_price,performance_score,analyzed_at FROM competitor_analyses WHERE id=?",
            [accepted.competitorId]
          )
        )[0]
      ).toMatchObject({
        status: "completed",
        product_count: 2,
        avg_price: null,
        performance_score: 0,
      });
      expect(
        (
          await q(
            "SELECT currency,price FROM competitor_products WHERE competitor_id=? ORDER BY id",
            [accepted.competitorId]
          )
        ).map((p: any) => p.currency)
      ).toEqual(["SAR", "USD"]);
      await closeDb();
      expect(await read()).toMatchObject({ state: "completed" });
      expect(await start()).toMatchObject({ created: false, execution: null });
      await expect(
        finishCompetitorAnalysisJob(accepted.execution!, result)
      ).rejects.toMatchObject({ reason: "expired" });
    });
    it("keeps the receipt after reviewed report deletion, preventing repeat work", async () => {
      const accepted = await start();
      await finishCompetitorAnalysisJob(accepted.execution!, result);
      await q("DELETE FROM competitor_analyses WHERE id=?", [
        accepted.competitorId,
      ]);
      expect(await read()).toMatchObject({
        state: "completed",
        reportAvailable: false,
      });
      expect(await start()).toMatchObject({ created: false, execution: null });
    });
    it("rolls back all products when the second insert fails", async () => {
      const accepted = await start(),
        pool = (await getPool())!,
        tx = await pool.getConnection(),
        execute = tx.execute.bind(tx);
      let count = 0;
      vi.spyOn(tx, "execute").mockImplementation((async (
        sql: any,
        args: any
      ) => {
        if (
          String(sql).startsWith("INSERT INTO competitor_products") &&
          ++count === 2
        )
          throw Error("PRIVATE_DATABASE_DETAIL");
        return execute(sql, args);
      }) as any);
      vi.spyOn(pool, "getConnection").mockResolvedValueOnce(tx);
      await expect(
        finishCompetitorAnalysisJob(accepted.execution!, result)
      ).rejects.toMatchObject({ reason: "unavailable" });
      vi.restoreAllMocks();
      expect(
        await q("SELECT id FROM competitor_products WHERE competitor_id=?", [
          accepted.competitorId,
        ])
      ).toHaveLength(0);
      expect(await read()).toMatchObject({ state: "running" });
      await failCompetitorAnalysisJob(accepted.execution!);
      expect(await read()).toMatchObject({ state: "failed" });
    });
    it("does not leave an orphan report when job admission fails", async () => {
      const pool = (await getPool())!,
        tx = await pool.getConnection(),
        execute = tx.execute.bind(tx);
      vi.spyOn(tx, "execute").mockImplementation((async (
        sql: any,
        args: any
      ) => {
        if (String(sql).startsWith("INSERT INTO competitor_analysis_jobs"))
          throw Error("PRIVATE");
        return execute(sql, args);
      }) as any);
      vi.spyOn(pool, "getConnection").mockResolvedValueOnce(tx);
      await expect(start()).rejects.toMatchObject({ reason: "unavailable" });
      vi.restoreAllMocks();
      expect(
        await q("SELECT id FROM competitor_analyses WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
      expect(await read()).toMatchObject({ state: "idle" });
    });
    it("recovers committed admission after the commit response is lost without starting twice", async () => {
      const pool = (await getPool())!,
        tx = await pool.getConnection(),
        commit = tx.commit.bind(tx);
      vi.spyOn(tx, "commit").mockImplementation(async () => {
        await commit();
        throw Error("PRIVATE_CONNECTION_LOST");
      });
      const destroy = vi.spyOn(tx, "destroy");
      vi.spyOn(pool, "getConnection").mockResolvedValueOnce(tx);
      await expect(start()).rejects.toMatchObject({ reason: "unknown" });
      expect(destroy).toHaveBeenCalledOnce();
      vi.restoreAllMocks();
      expect(await read()).toMatchObject({ state: "running" });
      expect(await start()).toMatchObject({ created: false, execution: null });
      expect(
        await q("SELECT id FROM competitor_analyses WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
    });
    it("rejects a different authorized actor reusing a stored request id", async () => {
      await start();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readCompetitorAnalysisJob(other.userId, owner.merchantId, { requestId })
      ).rejects.toMatchObject({ reason: "forbidden" });
      await expect(
        beginCompetitorAnalysisJob(other.userId, owner.merchantId, {
          requestId,
          name: "Synthetic competitor",
          url: "https://example.test/shop",
        })
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it.each(["lease_expires_at", "deadline_at"])(
      "fences %s expiry, closes only its report and does not auto-restart",
      async column => {
        const accepted = await start();
        await q(
          `UPDATE competitor_analysis_jobs SET ${column}=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?`,
          [owner.merchantId]
        );
        expect(await read()).toMatchObject({ state: "interrupted" });
        await expect(
          advanceCompetitorAnalysisJob(accepted.execution!)
        ).rejects.toMatchObject({ reason: "expired" });
        await expect(
          finishCompetitorAnalysisJob(accepted.execution!, result)
        ).rejects.toMatchObject({ reason: "expired" });
        await settleCompetitorAnalysisJobs(owner.userId, owner.merchantId);
        expect(
          (
            await q(
              "SELECT status,error_message FROM competitor_analyses WHERE id=?",
              [accepted.competitorId]
            )
          )[0]
        ).toEqual({
          status: "failed",
          error_message: "COMPETITOR_ANALYSIS_INTERRUPTED",
        });
        expect(await start()).toMatchObject({
          created: false,
          execution: null,
        });
      }
    );
    it("lets a new explicit request replace expired work while old results remain fenced", async () => {
      const accepted = await start();
      await q(
        "UPDATE competitor_analysis_jobs SET started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE),lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      const next = await beginCompetitorAnalysisJob(
        owner.userId,
        owner.merchantId,
        { requestId: randomUUID(), name: "Next", url: "https://next.test/" }
      );
      expect(next.created).toBe(true);
      await expect(
        finishCompetitorAnalysisJob(accepted.execution!, result)
      ).rejects.toMatchObject({ reason: "expired" });
      await finishCompetitorAnalysisJob(next.execution!, result);
    });
    it.each(["member", "owner", "actor", "merchant"])(
      "rejects live %s authority revocation before committing provider output",
      async kind => {
        const accepted = await start();
        if (kind === "member")
          await q(
            "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
            [owner.merchantId, owner.userId]
          );
        if (kind === "owner")
          await q("UPDATE merchants SET userId=? WHERE id=?", [
            other.userId,
            owner.merchantId,
          ]);
        if (kind === "actor")
          await q(
            "UPDATE users SET account_status='deletion_pending' WHERE id=?",
            [owner.userId]
          );
        if (kind === "merchant")
          await q("UPDATE merchants SET status='pending' WHERE id=?", [
            owner.merchantId,
          ]);
        await expect(
          finishCompetitorAnalysisJob(accepted.execution!, result)
        ).rejects.toMatchObject({
          reason: kind === "owner" ? "expired" : "forbidden",
        });
        expect(
          await q("SELECT id FROM competitor_products WHERE competitor_id=?", [
            accepted.competitorId,
          ])
        ).toHaveLength(0);
      }
    );
    it.each(["name", "url", "status", "child"])(
      "rejects changed report %s or preexisting children",
      async kind => {
        const accepted = await start();
        if (kind === "child")
          await q(
            "INSERT INTO competitor_products (competitor_id,merchant_id,name) VALUES (?,?,?)",
            [accepted.competitorId, other.merchantId, "Foreign child"]
          );
        else
          await q(`UPDATE competitor_analyses SET ${kind}=? WHERE id=?`, [
            kind === "status"
              ? "failed"
              : kind === "name"
                ? "Altered"
                : "https://changed.test/",
            accepted.competitorId,
          ]);
        await expect(
          finishCompetitorAnalysisJob(accepted.execution!, result)
        ).rejects.toMatchObject({ reason: "reference" });
      }
    );
    it("renews a live lease without extending its absolute deadline", async () => {
      const accepted = await start();
      await q(
        "UPDATE competitor_analysis_jobs SET lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 SECOND),deadline_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      await advanceCompetitorAnalysisJob(accepted.execution!);
      expect(
        (
          await q(
            "SELECT lease_expires_at=deadline_at AS bounded FROM competitor_analysis_jobs WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].bounded
      ).toBe(1);
    });
    it("blocks rapid new requests even after a failure", async () => {
      await failCompetitorAnalysisJob((await start()).execution!);
      await expect(
        beginCompetitorAnalysisJob(owner.userId, owner.merchantId, {
          requestId: randomUUID(),
          name: "Next",
          url: "https://next.test/",
        })
      ).rejects.toMatchObject({ reason: "cooldown" });
    });
    it("fails atomically with a fixed public issue instead of provider errors", async () => {
      const accepted = await start();
      await failCompetitorAnalysisJob(accepted.execution!);
      expect(await read()).toMatchObject({ state: "failed" });
      expect(
        (
          await q(
            "SELECT status,error_message FROM competitor_analyses WHERE id=?",
            [accepted.competitorId]
          )
        )[0]
      ).toEqual({
        status: "failed",
        error_message: "COMPETITOR_ANALYSIS_FAILED",
      });
    });
    it.each([
      "http://example.test/",
      "https://127.0.0.1/",
      "https://user:password@example.test/",
      "https://host.internal/",
    ])("rejects an unsafe source before admission %s", async url => {
      await expect(
        beginCompetitorAnalysisJob(owner.userId, owner.merchantId, {
          requestId,
          name: "Unsafe",
          url,
        })
      ).rejects.toMatchObject({ reason: "website" });
      expect(await read()).toMatchObject({ state: "idle" });
    });
  }
);

