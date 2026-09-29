import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  cleanupDisposableMerchants,
  createDisposableMerchant,
} from "../tests/helpers/disposable-merchant";
import {
  createWorkspaceFaq,
  changeWorkspaceFaq,
  listFaqWorkspace,
} from "./faq-workspace";
import { appRouter } from "../routers";
describe.skipIf(!process.env.DATABASE_URL)("FAQ workspace transactions", () => {
  const users: number[] = [];
  let merchantId: number, userId: number;
  const query = async (sql: string, args: unknown[] = []) =>
    (await (await getPool())!.execute<any>(sql, args))[0];
  beforeEach(async () => {
    const owner = await createDisposableMerchant("faq-workspace");
    merchantId = owner.merchantId;
    userId = owner.userId;
    users.push(userId);
  });
  afterEach(async () => {
    await cleanupDisposableMerchants(users);
    users.length = 0;
  });
  afterAll(closeDb);
  const input = () => ({
    question: "Local question?",
    answer: "A synthetic answer.",
    useInBot: false,
    requestId: randomUUID(),
  });
  const list = () =>
    listFaqWorkspace(merchantId, { search: "", status: "all", page: 1 });
  it("stores a disabled draft, replays its unchanged request once, and records one event", async () => {
    const body = input(),
      a = await createWorkspaceFaq(merchantId, body),
      b = await createWorkspaceFaq(merchantId, body);
    expect(a.id).toBe(b.id);
    expect((await list()).items).toMatchObject([
      { isActive: true, useInBot: false, requestId: body.requestId },
    ]);
    expect(
      await query("SELECT id FROM sari_activity_log WHERE merchant_id=?", [
        merchantId,
      ])
    ).toHaveLength(1);
    await expect(
      createWorkspaceFaq(merchantId, { ...body, answer: "Changed answer" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("serializes concurrent creates at the 50-question limit", async () => {
    for (let i = 0; i < 49; i++)
      await query(
        "INSERT INTO extracted_faqs (merchant_id,question,answer) VALUES (?,?,?)",
        [merchantId, `Question ${i}`, "Answer"]
      );
    const results = await Promise.allSettled([
      createWorkspaceFaq(merchantId, input()),
      createWorkspaceFaq(merchantId, input()),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await list()).total).toBe(50);
  });
  it("rejects stale updates and stale deletion without losing newer content", async () => {
    await createWorkspaceFaq(merchantId, input());
    const old = (await list()).items[0];
    await changeWorkspaceFaq(merchantId, {
      id: old.id,
      expectedRevision: old.revision,
      answer: "New approved answer",
    });
    for (const remove of [false, true])
      await expect(
        changeWorkspaceFaq(
          merchantId,
          {
            id: old.id,
            expectedRevision: old.revision,
            answer: "Stale answer",
          },
          remove
        )
      ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await list()).items[0].answer).toBe("New approved answer");
  });
  it("permits exactly one concurrent change from a reviewed revision", async () => {
    await createWorkspaceFaq(merchantId, input());
    const old = (await list()).items[0];
    const results = await Promise.allSettled(
      ["First", "Second"].map(answer =>
        changeWorkspaceFaq(merchantId, {
          id: old.id,
          expectedRevision: old.revision,
          answer,
        })
      )
    );
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("ignores usage counters in the edit revision but includes enable flags and source state", async () => {
    await createWorkspaceFaq(merchantId, input());
    const old = (await list()).items[0];
    await query(
      "UPDATE extracted_faqs SET usage_count=usage_count+1 WHERE id=?",
      [old.id]
    );
    expect((await list()).items[0].revision).toBe(old.revision);
    await changeWorkspaceFaq(merchantId, {
      id: old.id,
      expectedRevision: old.revision,
      useInBot: true,
    });
    expect((await list()).items[0].revision).not.toBe(old.revision);
  });
  it("does not read or mutate another tenant even when the identifier and revision are known", async () => {
    const other = await createDisposableMerchant("faq-other");
    users.push(other.userId);
    await createWorkspaceFaq(other.merchantId, input());
    const foreign = (
      await listFaqWorkspace(other.merchantId, {
        search: "",
        status: "all",
        page: 1,
      })
    ).items[0];
    expect((await list()).total).toBe(0);
    for (const remove of [false, true])
      await expect(
        changeWorkspaceFaq(
          merchantId,
          {
            id: foreign.id,
            expectedRevision: foreign.revision,
            answer: "Intrusion",
          },
          remove
        )
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it.each(["create", "update", "delete"])(
    "invalidates cached replies and durable sessions with %s",
    async operation => {
      await createWorkspaceFaq(merchantId, input());
      const old = (await list()).items[0];
      const c = await query(
        "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000009')",
        [merchantId]
      );
      await query(
        "INSERT INTO session_contexts (merchant_id,conversation_id,session_key,context_json,expires_at,version) VALUES (?,?,?,'{}',TIMESTAMPADD(HOUR,1,UTC_TIMESTAMP()),1)",
        [merchantId, c.insertId, `${merchantId}:${c.insertId}`]
      );
      await query(
        "INSERT INTO sari_response_cache (merchant_id,question_text,response_text) VALUES (?,'Question','Old answer')",
        [merchantId]
      );
      if (operation === "create") await createWorkspaceFaq(merchantId, input());
      else
        await changeWorkspaceFaq(
          merchantId,
          { id: old.id, expectedRevision: old.revision, useInBot: true },
          operation === "delete"
        );
      expect(
        await query("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          merchantId,
        ])
      ).toEqual([]);
      expect(
        await query(
          "SELECT context_json,version FROM session_contexts WHERE merchant_id=?",
          [merchantId]
        )
      ).toEqual([{ context_json: "null", version: 2 }]);
    }
  );
  it("deletes only a reviewed row and records the deletion", async () => {
    await createWorkspaceFaq(merchantId, input());
    const old = (await list()).items[0];
    await changeWorkspaceFaq(
      merchantId,
      { id: old.id, expectedRevision: old.revision },
      true
    );
    expect((await list()).total).toBe(0);
    expect(
      await query(
        "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='faq_deleted'",
        [merchantId]
      )
    ).toHaveLength(1);
  });
  it("searches literal wildcards, filters both flags and clamps a removed final page", async () => {
    for (let i = 0; i < 14; i++)
      await createWorkspaceFaq(merchantId, {
        ...input(),
        question: i === 0 ? "Question 100%_ literal" : "Question " + i,
        useInBot: i % 2 === 0,
        isActive: i !== 0,
      });
    expect(
      (
        await listFaqWorkspace(merchantId, {
          search: "%_",
          status: "all",
          page: 1,
        })
      ).total
    ).toBe(1);
    expect(
      (
        await listFaqWorkspace(merchantId, {
          search: "",
          status: "enabled",
          page: 1,
        })
      ).total
    ).toBe(6);
    expect(
      await listFaqWorkspace(merchantId, {
        search: "",
        status: "paused",
        page: 999,
      })
    ).toMatchObject({ total: 8, page: 1, totalPages: 1 });
    expect(
      (
        await listFaqWorkspace(merchantId, {
          search: "",
          status: "all",
          page: 2,
        })
      ).items
    ).toHaveLength(2);
  });
  it("rejects whitespace content and malformed revisions before writing", async () => {
    await expect(
      createWorkspaceFaq(merchantId, { ...input(), question: "   " })
    ).rejects.toThrow();
    await expect(
      changeWorkspaceFaq(merchantId, {
        id: 1,
        expectedRevision: "bad",
        answer: "Answer",
      })
    ).rejects.toThrow();
    expect((await list()).total).toBe(0);
  });
  it("keeps legacy create/update inputs working through the mounted router", async () => {
    const caller = appRouter.createCaller({
      user: { id: userId, role: "user" },
      req: { headers: { "x-merchant-id": String(merchantId) } },
      res: {},
    } as any);
    const saved = await caller.sariBrain.createFaq({
      question: "Legacy question",
      answer: "Legacy answer",
    });
    await caller.sariBrain.updateFaq({
      id: saved.id,
      answer: "Legacy updated",
    });
    expect((await list()).items[0]).toMatchObject({
      answer: "Legacy updated",
      useInBot: true,
    });
    expect((await caller.sariBrain.faqWorkspace()).canManage).toBe(true);
  });
});
