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
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  beginWebsiteAnalysisJob,
  readWebsiteAnalysisJob,
  advanceWebsiteAnalysisJob,
  finishWebsiteAnalysisJob,
  failWebsiteAnalysisJob,
  assertWebsiteAnalysisJob,
  withWebsiteAnalysisWrite,
} from "./website-analysis-jobs";
import type {
  WebsiteJobExecution,
  WebsiteJobResult,
} from "../../shared/website-analysis-job";

describe.skipIf(!process.env.DATABASE_URL)(
  "durable website analysis job authority in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      jobId: string;
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const start = () =>
      beginWebsiteAnalysisJob(owner.userId, owner.merchantId, jobId);
    const read = () =>
      readWebsiteAnalysisJob(owner.userId, owner.merchantId, jobId);
    const scope = async () => {
      const result = await start();
      expect(result.created).toBe(true);
      return result.execution!;
    };
    const result: WebsiteJobResult = {
      success: true,
      title: "Local sample",
      score: 62,
      knowledgeEvolution: {
        added: 1,
        merged: 0,
        evolved: 0,
        unchanged: 1,
        conflicts: 0,
      },
      salesIntelSummary: null,
      knowledgeError: null,
      indexingOutcome: { status: "not_attempted", indexedSections: null },
      crawlStats: null,
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("website-job422");
      other = await createDisposableMerchant("website-job422-other");
      jobId = randomUUID();
      await query("UPDATE merchants SET website_url=? WHERE id IN (?,?)", [
        "https://example.test",
        owner.merchantId,
        other.merchantId,
      ]);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);

    it("persists correlation and scope without exposing the execution token in reads", async () => {
      const accepted = await start();
      expect(accepted).toMatchObject({
        created: true,
        jobId,
        alreadyRunning: false,
        websiteUrl: "https://example.test",
      });
      expect(await read()).toMatchObject({
        merchantId: owner.merchantId,
        jobId,
        status: "running",
        currentStep: "scraping",
        progress: 0,
      });
      expect(JSON.stringify(await read())).not.toContain(
        accepted.execution!.token
      );
      expect(
        await readWebsiteAnalysisJob(other.userId, other.merchantId, jobId)
      ).toEqual({ merchantId: other.merchantId, jobId, status: "idle" });
      await expect(
        readWebsiteAnalysisJob(other.userId, owner.merchantId, jobId)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("allows only one creator when the same start arrives concurrently", async () => {
      const accepted = await Promise.all([start(), start(), start()]);
      expect(accepted.filter(a => a.created)).toHaveLength(1);
      expect(new Set(accepted.map(a => a.jobId)).size).toBe(1);
      expect(
        await query(
          "SELECT id FROM website_analysis_jobs WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("joins an active attempt instead of scheduling another id", async () => {
      await start();
      expect(
        await beginWebsiteAnalysisJob(
          owner.userId,
          owner.merchantId,
          randomUUID()
        )
      ).toMatchObject({
        created: false,
        jobId,
        alreadyRunning: true,
        execution: null,
      });
    });
    it("keeps identical request ids independent across tenants", async () => {
      const first = await start(),
        second = await beginWebsiteAnalysisJob(
          other.userId,
          other.merchantId,
          jobId
        );
      expect(second.created).toBe(true);
      expect(second.execution!.token).not.toBe(first.execution!.token);
    });
    it("recovers a completed result after reconnecting and never consumes it on read", async () => {
      await finishWebsiteAnalysisJob(await scope(), result);
      await closeDb();
      const first = await read();
      expect(first).toMatchObject({
        ...result,
        merchantId: owner.merchantId,
        jobId,
        status: "completed",
      });
      expect(await read()).toEqual(first);
      expect(await start()).toMatchObject({
        created: false,
        alreadyRunning: false,
        execution: null,
      });
    });
    it("keeps a completed result after the old process-local retention window", async () => {
      await finishWebsiteAnalysisJob(await scope(), result);
      await query(
        "UPDATE website_analysis_jobs SET updated_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await read()).toMatchObject({
        status: "completed",
        title: "Local sample",
      });
    });
    it("reports an expired worker as interrupted without claiming rollback or success", async () => {
      const execution = await scope();
      await query(
        "UPDATE website_analysis_jobs SET lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await read()).toMatchObject({
        status: "error",
        issue: "interrupted",
      });
      await expect(advanceWebsiteAnalysisJob(execution)).rejects.toMatchObject({
        reason: "expired",
      });
      await expect(
        finishWebsiteAnalysisJob(execution, result)
      ).rejects.toMatchObject({ reason: "expired" });
      expect(await start()).toMatchObject({
        created: false,
        alreadyRunning: false,
        execution: null,
      });
      expect(
        (
          await query(
            "SELECT state,active_slot FROM website_analysis_jobs WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0]
      ).toEqual({ state: "uncertain", active_slot: null });
    });
    it("replaces an expired attempt only on a new request and fences the old token", async () => {
      const old = await scope();
      await query(
        "UPDATE website_analysis_jobs SET started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE),lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      const next = await beginWebsiteAnalysisJob(
        owner.userId,
        owner.merchantId,
        randomUUID()
      );
      expect(next.created).toBe(true);
      const effect = vi.fn();
      await expect(withWebsiteAnalysisWrite(old, effect)).rejects.toMatchObject(
        { reason: "expired" }
      );
      expect(effect).not.toHaveBeenCalled();
      await assertWebsiteAnalysisJob(next.execution!);
      expect(await read()).toMatchObject({ issue: "interrupted" });
    });
    it("enforces the cooldown across separate start requests", async () => {
      await failWebsiteAnalysisJob(await scope());
      await expect(
        beginWebsiteAnalysisJob(owner.userId, owner.merchantId, randomUUID())
      ).rejects.toMatchObject({ reason: "cooldown" });
    });
    it("keeps progress monotonic and cannot renew the hard deadline", async () => {
      const execution = await scope();
      await advanceWebsiteAnalysisJob(execution, "knowledge", 60);
      await expect(
        advanceWebsiteAnalysisJob(execution, "scraping", 20)
      ).rejects.toMatchObject({ reason: "expired" });
      expect(await read()).toMatchObject({
        currentStep: "knowledge",
        progress: 60,
      });
      await query(
        "UPDATE website_analysis_jobs SET deadline_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(advanceWebsiteAnalysisJob(execution)).rejects.toMatchObject({
        reason: "expired",
      });
    });
    it("refuses a forged token or tenant before running any callback", async () => {
      const execution = await scope(),
        effect = vi.fn();
      for (const forged of [
        { ...execution, token: randomUUID() },
        { ...execution, merchantId: other.merchantId },
      ])
        await expect(
          withWebsiteAnalysisWrite(forged, effect)
        ).rejects.toMatchObject({ reason: "expired" });
      expect(effect).not.toHaveBeenCalled();
    });
    it.each(["website", "owner", "suspended", "actor_disabled"])(
      "invalidates worker authority after %s changes",
      async change => {
        const execution = await scope();
        if (change === "website")
          await query("UPDATE merchants SET website_url=? WHERE id=?", [
            "https://changed.example.test",
            owner.merchantId,
          ]);
        if (change === "owner")
          await query("UPDATE merchants SET userId=? WHERE id=?", [
            other.userId,
            owner.merchantId,
          ]);
        if (change === "suspended")
          await query("UPDATE merchants SET status='suspended' WHERE id=?", [
            owner.merchantId,
          ]);
        if (change === "actor_disabled")
          await query(
            "UPDATE users SET account_status='deletion_pending' WHERE id=?",
            [owner.userId]
          );
        const effect = vi.fn();
        await expect(
          withWebsiteAnalysisWrite(execution, effect)
        ).rejects.toThrow("website_job:");
        expect(effect).not.toHaveBeenCalled();
        // Restore the fixture's owner so normal isolated cleanup finds both tenants.
        if (change === "owner")
          await query("UPDATE merchants SET userId=? WHERE id=?", [
            owner.userId,
            owner.merchantId,
          ]);
      }
    );
    it("revokes a staff-started attempt after membership removal", async () => {
      await query(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      const accepted = await beginWebsiteAnalysisJob(
        other.userId,
        owner.merchantId,
        jobId
      );
      await query(
        "UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, other.userId]
      );
      await expect(
        assertWebsiteAnalysisJob(accepted.execution!)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("allows a viewer to read but not start a job", async () => {
      await start();
      await query(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, other.userId]
      );
      expect(
        await readWebsiteAnalysisJob(other.userId, owner.merchantId, jobId)
      ).toMatchObject({ status: "running" });
      await expect(
        beginWebsiteAnalysisJob(other.userId, owner.merchantId, randomUUID())
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("keeps a finished job immutable", async () => {
      const execution = await scope();
      await finishWebsiteAnalysisJob(execution, result);
      await expect(failWebsiteAnalysisJob(execution)).rejects.toMatchObject({
        reason: "expired",
      });
      await expect(
        finishWebsiteAnalysisJob(execution, { ...result, title: "Changed" })
      ).rejects.toMatchObject({ reason: "expired" });
      expect(await read()).toMatchObject({
        title: "Local sample",
        status: "completed",
      });
    });
    it("does not expose corrupted stored provider payloads", async () => {
      await finishWebsiteAnalysisJob(await scope(), result);
      await query(
        "UPDATE website_analysis_jobs SET result_json=? WHERE merchant_id=?",
        [JSON.stringify({ secret: "PRIVATE" }), owner.merchantId]
      );
      expect(await read()).toEqual({
        merchantId: owner.merchantId,
        jobId,
        status: "error",
        issue: "result_unavailable",
      });
    });
    it.each([null, 0, 2])(
      "database rejects a running active slot %s",
      async slot => {
        await scope();
        await expect(
          query(
            "UPDATE website_analysis_jobs SET active_slot=? WHERE merchant_id=?",
            [slot, owner.merchantId]
          )
        ).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
      }
    );
    it("holds the tenant lock through a fenced write and rolls back a failed callback", async () => {
      const execution = await scope(),
        otherConnection = await (await getPool())!.getConnection();
      try {
        await withWebsiteAnalysisWrite(execution, async () => {
          await otherConnection.beginTransaction();
          await expect(
            otherConnection.execute(
              "SELECT id FROM merchants WHERE id=? FOR UPDATE NOWAIT",
              [owner.merchantId]
            )
          ).rejects.toMatchObject({ code: "ER_LOCK_NOWAIT" });
          await otherConnection.rollback();
        });
        await expect(
          withWebsiteAnalysisWrite(execution, async tx => {
            await tx.execute(
              "UPDATE merchants SET businessName='ROLLBACK_FIXTURE' WHERE id=?",
              [owner.merchantId]
            );
            throw Error("failed");
          })
        ).rejects.toMatchObject({ reason: "unavailable" });
        expect(
          (
            await query("SELECT businessName FROM merchants WHERE id=?", [
              owner.merchantId,
            ])
          )[0].businessName
        ).not.toBe("ROLLBACK_FIXTURE");
      } finally {
        otherConnection.release();
      }
    });
    it.each([false, true])(
      "unknown commit outcome destroys the connection (committed=%s)",
      async committed => {
        const pool = (await getPool())!,
          connection = await pool.getConnection(),
          commit = connection.commit.bind(connection);
        const destroy = vi.spyOn(connection, "destroy");
        vi.spyOn(pool, "getConnection").mockResolvedValueOnce(connection);
        vi.spyOn(connection, "commit").mockImplementation(async () => {
          if (committed) await commit();
          throw Error("unknown");
        });
        await expect(start()).rejects.toMatchObject({ reason: "unknown" });
        expect(destroy).toHaveBeenCalledOnce();
        vi.restoreAllMocks();
        expect((await read()).status).toBe(committed ? "running" : "idle");
        if (committed) expect(await start()).toMatchObject({ created: false });
      }
    );
  }
);
