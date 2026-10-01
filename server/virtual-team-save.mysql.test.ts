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
import { eq } from "drizzle-orm";
import { virtualAgents, virtualTeamSaveReceipts } from "../drizzle/schema";
import { emptyVirtualAgent } from "../shared/virtual-agent-form";
import { getDb, getPool, closeDb } from "./db/connection";
import { virtualTeamRevision } from "./virtual-team-version";
import {
  saveReviewedVirtualAgent as save,
  readVirtualAgentSaveReceipt as read,
} from "./virtual-team-save";
import { virtualAgentsRouter } from "./routers-virtual-agents";
import {
  cleanupDisposableMerchants,
  createDisposableMerchant,
} from "./tests/helpers/disposable-merchant";

describe.skipIf(!process.env.DATABASE_URL)(
  "durable persona saves in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const team = async (merchantId = owner.merchantId) =>
      (await getDb())!
        .select()
        .from(virtualAgents)
        .where(eq(virtualAgents.merchantId, merchantId));
    const receipts = async () =>
      (await getDb())!
        .select()
        .from(virtualTeamSaveReceipts)
        .where(eq(virtualTeamSaveReceipts.merchantId, owner.merchantId));
    const request = async (editing: number | null = null) => ({
      merchantId: owner.merchantId,
      requestId: randomUUID(),
      editing,
      expectedRevision: virtualTeamRevision(owner.merchantId, await team()),
      draft: {
        ...emptyVirtualAgent,
        name: "سارة",
        role: "دعم",
        personalityPrompt: "ساعد العميل بالمعرفة المعتمدة",
        isDefault: true,
      },
    });
    beforeEach(async () => {
      owner = await createDisposableMerchant("persona-receipt");
      other = await createDisposableMerchant("persona-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);

    it("replays one concurrent create once and recovers the exact receipt read-only", async () => {
      const input = await request();
      const results = await Promise.all([
        save(owner.userId, input),
        save(owner.userId, input),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(await team()).toHaveLength(1);
      expect(await receipts()).toHaveLength(1);
      expect(
        await read(owner.userId, {
          merchantId: owner.merchantId,
          requestId: input.requestId,
        })
      ).toEqual(results[0]);
      expect(results[0]).toMatchObject({
        actorId: owner.userId,
        operation: "create",
        reviewedRevision: input.expectedRevision,
      });
      expect(results[0].revisionAfter).toBe(
        virtualTeamRevision(owner.merchantId, await team())
      );
    });
    it("rejects the same UUID with a different form, target or revision", async () => {
      const input = await request();
      const receipt = await save(owner.userId, input);
      for (const change of [
        { draft: { ...input.draft, name: "Changed" } },
        { editing: receipt.personaId },
        { expectedRevision: receipt.revisionAfter },
      ])
        await expect(
          save(owner.userId, { ...input, ...change })
        ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await team())[0].name).toBe("سارة");
      expect(await receipts()).toHaveLength(1);
    });
    it("replays a receipt after later edits and deletion without reviving the persona", async () => {
      const input = await request(),
        receipt = await save(owner.userId, input);
      const update = await request(receipt.personaId);
      update.draft.name = "Later";
      await save(owner.userId, update);
      expect(await save(owner.userId, input)).toEqual(receipt);
      expect((await team())[0].name).toBe("Later");
      await (await getDb())!
        .delete(virtualAgents)
        .where(eq(virtualAgents.id, receipt.personaId));
      expect(await save(owner.userId, input)).toEqual(receipt);
      expect(
        await read(owner.userId, {
          merchantId: owner.merchantId,
          requestId: input.requestId,
        })
      ).toEqual(receipt);
      expect(await team()).toHaveLength(0);
    });
    it("keeps hidden intents and priority, supports overnight hours and clearing them", async () => {
      const created = await save(owner.userId, await request());
      await (await getDb())!
        .update(virtualAgents)
        .set({ triggerIntents: '["greeting"]', sortOrder: 8 })
        .where(eq(virtualAgents.id, created.personaId));
      const input = await request(created.personaId);
      Object.assign(input.draft, {
        name: "نورة",
        isActive: false,
        shiftStart: "22:00",
        shiftEnd: "06:00",
      });
      const receipt = await save(owner.userId, input);
      expect(receipt.operation).toBe("update");
      expect((await team())[0]).toMatchObject({
        name: "نورة",
        isActive: 0,
        triggerIntents: '["greeting"]',
        sortOrder: 8,
        shiftStart: "22:00",
        shiftEnd: "06:00",
      });
      await save(owner.userId, await request(created.personaId));
      expect((await team())[0]).toMatchObject({
        shiftStart: null,
        shiftEnd: null,
        triggerIntents: '["greeting"]',
      });
    });
    it("serializes different requests at the ten-persona boundary and default selection", async () => {
      for (let i = 0; i < 9; i++) await save(owner.userId, await request());
      const input = await request();
      const results = await Promise.allSettled([
        save(owner.userId, input),
        save(owner.userId, { ...input, requestId: randomUUID() }),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find(r => r.status === "rejected")).toMatchObject({
        reason: { code: "CONFLICT" },
      });
      expect(await team()).toHaveLength(10);
      expect((await team()).filter(a => a.isDefault)).toHaveLength(1);
      expect(new Set((await team()).map(a => a.sortOrder)).size).toBe(10);
      await expect(save(owner.userId, await request())).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
    it("rejects foreign targets, merchant headers, owners and receipt actors without changing rows", async () => {
      const input = await request(),
        result = await save(owner.userId, input);
      await expect(save(other.userId, await request())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        save(other.userId, {
          ...(await request(result.personaId)),
          merchantId: other.merchantId,
          expectedRevision: virtualTeamRevision(other.merchantId, []),
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const caller = virtualAgentsRouter.createCaller({
        user: { id: owner.userId, role: "user" },
        req: { headers: { "x-merchant-id": String(owner.merchantId) } },
        res: {},
      } as any);
      await expect(
        caller.saveReviewed({ ...input, merchantId: other.merchantId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.getSaveReceipt({
          merchantId: other.merchantId,
          requestId: input.requestId,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await (await getPool())!.execute(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        read(other.userId, {
          merchantId: owner.merchantId,
          requestId: input.requestId,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(save(other.userId, input)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(await team()).toHaveLength(1);
      expect(await team(other.merchantId)).toHaveLength(0);
    });
    it("rechecks revoked membership for both receipt reads and replay", async () => {
      const input = await request();
      await save(owner.userId, input);
      await (await getPool())!.execute(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(save(owner.userId, input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        read(owner.userId, {
          merchantId: owner.merchantId,
          requestId: input.requestId,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("returns null for a missing receipt without writing anything", async () => {
      expect(
        await read(owner.userId, {
          merchantId: owner.merchantId,
          requestId: randomUUID(),
        })
      ).toBeNull();
      expect(await team()).toHaveLength(0);
      expect(await receipts()).toHaveLength(0);
    });
    it("rolls back persona and default changes when inserting the receipt fails", async () => {
      const original = await save(owner.userId, await request());
      const input = await request(),
        pool = (await getPool())!,
        acquire = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementationOnce(async () => {
        const c = await acquire();
        return new Proxy(c, {
          get(target, key) {
            if (key === "query")
              return (...args: any[]) => {
                const sql =
                  typeof args[0] === "string" ? args[0] : args[0]?.sql;
                if (/insert into `virtual_team_save_receipts`/i.test(sql))
                  return Promise.reject(Error("injected receipt failure"));
                return (target.query as any)(...args);
              };
            const v = Reflect.get(target, key);
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      });
    await expect(save(owner.userId, input)).rejects.toMatchObject({
      cause: { message: "injected receipt failure" },
    });
      expect(await team()).toMatchObject([
        { id: original.personaId, isDefault: 1 },
      ]);
      expect(await receipts()).toHaveLength(1);
    });
    it("recovers a committed receipt after a lost commit acknowledgement without retrying internally", async () => {
      const input = await request(),
        pool = (await getPool())!,
        acquire = pool.getConnection.bind(pool);
      const destroyed = vi.fn();
      let commits = 0;
      vi.spyOn(pool, "getConnection").mockImplementationOnce(async () => {
        const c = await acquire();
        return new Proxy(c, {
          get(target, key) {
            if (key === "commit")
              return async () => {
                commits++;
                await target.commit();
                throw Error("lost acknowledgement");
              };
            if (key === "destroy")
              return () => {
                destroyed();
                target.destroy();
              };
            const v = Reflect.get(target, key);
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      });
      await expect(save(owner.userId, input)).rejects.toThrow(
        "lost acknowledgement"
      );
      expect(commits).toBe(1);
      expect(destroyed).toHaveBeenCalledOnce();
      const receipt = await read(owner.userId, {
        merchantId: owner.merchantId,
        requestId: input.requestId,
      });
      expect(receipt?.operation).toBe("create");
      expect(await save(owner.userId, input)).toEqual(receipt);
      expect(await team()).toHaveLength(1);
    });
  }
);
