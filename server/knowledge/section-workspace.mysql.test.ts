import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  createWorkspaceSection,
  changeWorkspaceSection,
  readSectionWorkspace,
  listSectionWorkspace,
  sectionReadiness,
} from "./section-workspace";
describe.skipIf(!process.env.DATABASE_URL)("section workspace on MySQL", () => {
  const users: number[] = [];
  let merchantId: number;
  const q = async (sql: string, args: unknown[] = []) =>
    (await (await getPool())!.execute<any>(sql, args))[0];
  beforeEach(async () => {
    const m = await createDisposableMerchant("sections");
    users.push(m.userId);
    merchantId = m.merchantId;
  });
  afterEach(async () => {
    await cleanupDisposableMerchants(users);
    users.length = 0;
  });
  afterAll(closeDb);
  const input = (patch: Record<string, unknown> = {}) => ({
    title: "Synthetic identity",
    content: "Full reviewed fictional content",
    sectionType: "identity",
    parentId: null,
    useInBot: false,
    requestId: randomUUID(),
    acknowledged: true,
    ...patch,
  });
  const create = async (patch: Record<string, unknown> = {}) =>
    (await createWorkspaceSection(merchantId, input(patch))).id;
  it("rejects oversized multi-byte content before storing any row", async () => {
    await expect(create({ content: "😀".repeat(16384) })).rejects.toThrow();
    expect((await list()).total).toBe(0);
  });
  it("preserves long Arabic text within storage capacity", async () => {
    const content = "ع".repeat(30000),
      id = await create({ content });
    expect((await readSectionWorkspace(merchantId, id)).section.content).toBe(
      content
    );
  });
  const list = (patch: Record<string, unknown> = {}) =>
    listSectionWorkspace(merchantId, {
      search: "",
      type: "all",
      state: "all",
      page: 1,
      ...patch,
    } as any);
  const change = async (id: number, patch: Record<string, unknown> = {}) => {
    const r = await readSectionWorkspace(merchantId, id);
    return changeWorkspaceSection(merchantId, {
      id,
      title: r.section.title,
      content: r.section.content,
      useInBot: r.section.useInBot,
      expectedRevision: r.revision,
      acknowledged: true,
      ...patch,
    });
  };
  it("retries an identical creation once under concurrent requests", async () => {
    const data = input();
    const a = await Promise.all([
      createWorkspaceSection(merchantId, data),
      createWorkspaceSection(merchantId, data),
    ]);
    expect(a[0].id).toBe(a[1].id);
    expect((await list()).total).toBe(1);
    expect(
      await q(
        "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='section_created'",
        [merchantId]
      )
    ).toHaveLength(1);
  });
  it("refuses reuse of a creation request with different text", async () => {
    const data = input();
    await createWorkspaceSection(merchantId, data);
    await expect(
      createWorkspaceSection(merchantId, { ...data, content: "Changed" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("returns full text and omits internal provenance and embedding fields", async () => {
    const id = await create({ content: "A".repeat(9000) }),
      r = await readSectionWorkspace(merchantId, id);
    expect(r.section.content).toHaveLength(9000);
    for (const k of [
      "provenance",
      "embedding",
      "merchantId",
      "embeddingContentHash",
    ])
      expect(r.section).not.toHaveProperty(k);
  });
  it("shows nested and orphan rows, sales intelligence and opportunities through pagination", async () => {
    const root = await create(),
      child = await create({ parentId: root }),
      leaf = await create({ parentId: child });
    for (let i = 0; i < 7; i++) await create({ title: "Extra " + i });
    await q(
      "UPDATE knowledge_sections SET parent_id=999999, section_type='opportunities',inject_as='none' WHERE id=?",
      [leaf]
    );
    expect((await list()).items).toHaveLength(8);
    expect((await list({ page: 99 })).page).toBe(2);
    expect((await list({ type: "opportunities" })).items[0].id).toBe(leaf);
  });
  it("searches literal wildcards and ids without wildcard expansion", async () => {
    const id = await create({ title: "Literal % policy" });
    await create();
    expect((await list({ search: "%" })).total).toBe(1);
    expect((await list({ search: String(id) })).items[0].id).toBe(id);
  });
  it("computes coverage from eligible areas only, not row quantity", async () => {
    for (let i = 0; i < 3; i++) await create({ useInBot: true });
    await create({ sectionType: "policies" });
    const r = await sectionReadiness(merchantId);
    expect(r).toMatchObject({
      total: 17,
      covered: 1,
      areas: 6,
      saved: 4,
      counts: { eligible: 3, paused: 1 },
    });
  });
  it.each(["pending", "paused", "expired", "excluded"])(
    "excludes %s knowledge from coverage",
    async state => {
      const id = await create({ useInBot: true });
      const changes = {
        pending: "status='pending_review'",
        paused: "use_in_bot=0",
        expired: "valid_until='2020-01-01'",
        excluded: "inject_as='none'",
      };
      await q(
        `UPDATE knowledge_sections SET ${changes[state as keyof typeof changes]} WHERE id=?`,
        [id]
      );
      expect((await list({ state })).total).toBe(1);
      expect((await sectionReadiness(merchantId)).total).toBe(0);
    }
  );
  it("clears stale summaries and embeddings when text is edited", async () => {
    const id = await create();
    await q(
      "UPDATE knowledge_sections SET summary='Old',embedding_content_hash=? WHERE id=?",
      ["a".repeat(64), id]
    );
    await change(id, { content: "New text" });
    expect(
      await q(
        "SELECT content,summary,embedding_content_hash FROM knowledge_sections WHERE id=?",
        [id]
      )
    ).toEqual([
      { content: "New text", summary: null, embedding_content_hash: null },
    ]);
  });
  it("rejects a stale edit without overwriting the current content", async () => {
    const id = await create(),
      r = await readSectionWorkspace(merchantId, id);
    await change(id, { content: "Concurrent" });
    await expect(
      changeWorkspaceSection(merchantId, {
        id,
        title: "Attempt",
        content: "Old draft",
        useInBot: false,
        expectedRevision: r.revision,
        acknowledged: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await readSectionWorkspace(merchantId, id)).section.content).toBe(
      "Concurrent"
    );
  });
  it("does not allow pending proposals to bypass conflict review", async () => {
    const id = await create();
    await q(
      "UPDATE knowledge_sections SET status='pending_review' WHERE id=?",
      [id]
    );
    await expect(change(id, { useInBot: true })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it.each([
    "inject_as='none'",
    "inject_as=NULL",
    "status=NULL",
    "valid_until='2020-01-01'",
  ])("does not enable ineligible settings %s", async setting => {
    const id = await create();
    await q(`UPDATE knowledge_sections SET ${setting} WHERE id=?`, [id]);
    await expect(change(id, { useInBot: true })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it("does not invalidate a reviewed edit for indexing alone", async () => {
    const id = await create(),
      r = await readSectionWorkspace(merchantId, id);
    await q(
      "UPDATE knowledge_sections SET embedding_content_hash=? WHERE id=?",
      ["c".repeat(64), id]
    );
    expect((await readSectionWorkspace(merchantId, id)).revision).toBe(
      r.revision
    );
  });
  it("previews and deletes all descendants, preserving other branches", async () => {
    const id = await create(),
      child = await create({ parentId: id }),
      leaf = await create({ parentId: child }),
      other = await create();
    const r = await readSectionWorkspace(merchantId, id);
    expect(r.descendants.map(r => r.id)).toEqual([child, leaf]);
    await changeWorkspaceSection(
      merchantId,
      { id, expectedRevision: r.deleteRevision, acknowledged: true },
      true
    );
    expect((await list()).items.map(r => r.id)).toEqual([other]);
  });
  it("refuses deletion when a new descendant appears after review", async () => {
    const id = await create(),
      r = await readSectionWorkspace(merchantId, id);
    await create({ parentId: id });
    await expect(
      changeWorkspaceSection(
        merchantId,
        { id, expectedRevision: r.deleteRevision, acknowledged: true },
        true
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await list()).total).toBe(2);
  });
  it("refuses deletion when descendant content changes", async () => {
    const id = await create(),
      child = await create({ parentId: id }),
      r = await readSectionWorkspace(merchantId, id);
    await change(child, { content: "Changed child" });
    await expect(
      changeWorkspaceSection(
        merchantId,
        { id, expectedRevision: r.deleteRevision, acknowledged: true },
        true
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("scopes reads, parents, writes and deletion traversal to the tenant", async () => {
    const id = await create(),
      other = await createDisposableMerchant("foreign-sections");
    users.push(other.userId);
    const foreign = (await createWorkspaceSection(other.merchantId, input()))
      .id;
    await expect(
      readSectionWorkspace(other.merchantId, id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(create({ parentId: foreign })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await q("UPDATE knowledge_sections SET parent_id=? WHERE id=?", [
      id,
      foreign,
    ]);
    const r = await readSectionWorkspace(merchantId, id);
    expect(r.descendants).toEqual([]);
    await changeWorkspaceSection(
      merchantId,
      { id, expectedRevision: r.deleteRevision, acknowledged: true },
      true
    );
    expect(
      (await readSectionWorkspace(other.merchantId, foreign)).section.id
    ).toBe(foreign);
  });
  it("invalidates cached answers on edit in the same transaction", async () => {
    const id = await create();
    await q(
      "INSERT INTO sari_response_cache (merchant_id,question_text,response_text) VALUES (?,'Q','Old')",
      [merchantId]
    );
    await change(id, { content: "Changed" });
    expect(
      await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
        merchantId,
      ])
    ).toEqual([]);
  });
  it("requires the reviewed revision and acknowledgement before a write", async () => {
    const id = await create();
    await expect(
      changeWorkspaceSection(merchantId, {
        id,
        title: "X",
        content: "Y",
        useInBot: false,
      })
    ).rejects.toThrow();
    await expect(
      changeWorkspaceSection(merchantId, { id }, true)
    ).rejects.toThrow();
  });
});
