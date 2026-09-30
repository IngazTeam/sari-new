import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  writeQuotationTemplate,
  readTemplateDetail,
  readTemplateWorkspace,
  readTemplateReceipt,
  QuotationTemplateLimit,
} from "./quotation-template-workspace";
import { QuotationConflict, QuotationUnavailable } from "./quotation-mutations";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed template writes in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const query = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const fields = (name = "Local", isDefault = false) => ({
      name,
      headerImageUrl: "https://example.test/logo.png",
      footerText: "Footer\nfull",
      termsText: "Terms\nfull",
      isDefault,
    });
    const create = (name = "Local", isDefault = false) => ({
      action: "create" as const,
      requestId: randomUUID(),
      fields: fields(name, isDefault),
    });
    const write = (input: unknown) =>
      writeQuotationTemplate(owner.merchantId, owner.userId, input);
    beforeEach(async () => {
      owner = await createDisposableMerchant("template-write");
      other = await createDisposableMerchant("template-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("creates complete content once and recovers the identical receipt", async () => {
      const input = create(),
        a = await write(input),
        b = await write(input);
      expect(b).toEqual(a);
      expect(
        await readTemplateReceipt(owner.merchantId, owner.userId, {
          requestId: input.requestId,
        })
      ).toEqual(a);
      expect(
        await readTemplateDetail(owner.merchantId, a.recordId)
      ).toMatchObject({
        ...fields(),
        digest: a.digest,
        editable: true,
        truncated: false,
      });
      expect(
        await query("SELECT id FROM quotation_templates WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      expect(
        await query(
          "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='quotation_template_saved'",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("serializes simultaneous copies of one request", async () => {
      const v = create();
      const [a, b] = await Promise.all([write(v), write(v)]);
      expect(a).toEqual(b);
      expect((await readTemplateWorkspace(owner.merchantId, {})).total).toBe(1);
    });
    it("rejects reuse with different content or action", async () => {
      const v = create(),
        a = await write(v);
      await expect(
        write({ ...v, fields: fields("Other") })
      ).rejects.toBeInstanceOf(QuotationConflict);
      await expect(
        write({
          action: "delete",
          requestId: v.requestId,
          id: a.recordId,
          expectedDigest: a.digest,
        })
      ).rejects.toBeInstanceOf(QuotationConflict);
    });
    it("rejects foreign update before clearing the existing default", async () => {
      const a = await write(create("Mine", true)),
        b = await writeQuotationTemplate(
          other.merchantId,
          other.userId,
          create("Other", true)
        );
      await expect(
        write({
          action: "update",
          requestId: randomUUID(),
          id: b.recordId,
          expectedDigest: b.digest,
          fields: fields("Hack", true),
        })
      ).rejects.toBeInstanceOf(QuotationUnavailable);
      expect(
        (await readTemplateDetail(owner.merchantId, a.recordId))?.isDefault
      ).toBe(true);
    });
    it("checks reviewed content before update and delete", async () => {
      const a = await write(create());
      await query(
        "UPDATE quotation_templates SET terms_text='Changed elsewhere' WHERE id=?",
        [a.recordId]
      );
      for (const action of ["update", "delete"]) {
        await expect(
          write({
            action,
            requestId: randomUUID(),
            id: a.recordId,
            expectedDigest: a.digest,
            ...(action === "update" ? { fields: fields() } : {}),
          })
        ).rejects.toBeInstanceOf(QuotationConflict);
      }
      expect(
        (await readTemplateDetail(owner.merchantId, a.recordId))?.termsText
      ).toBe("Changed elsewhere");
    });
    it("updates full content and recovers the first outcome even after another edit", async () => {
      const a = await write(create()),
        v = {
          action: "update",
          requestId: randomUUID(),
          id: a.recordId,
          expectedDigest: a.digest,
          fields: fields("Updated", true),
        },
        b = await write(v);
      await write({
        action: "update",
        requestId: randomUUID(),
        id: a.recordId,
        expectedDigest: b.digest,
        fields: fields("Third"),
      });
      expect(await write(v)).toEqual(b);
      expect(
        (await readTemplateDetail(owner.merchantId, a.recordId))?.name
      ).toBe("Third");
    });
    it("has at most one default after simultaneous reviewed requests", async () => {
      await Promise.all([write(create("A", true)), write(create("B", true))]);
      expect(
        (
          await query(
            "SELECT id FROM quotation_templates WHERE merchant_id=? AND is_default=1",
            [owner.merchantId]
          )
        ).length
      ).toBe(1);
    });
    it("enforces the20 limit under concurrent creation", async () => {
      for (let i = 0; i < 19; i++) await write(create(`Existing ${i}`));
      const results = await Promise.allSettled([
        write(create("A")),
        write(create("B")),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find(
        r => r.status === "rejected"
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(QuotationTemplateLimit);
      expect((await readTemplateWorkspace(owner.merchantId, {})).total).toBe(
        20
      );
    });
    it("deletes only the reviewed row and preserves its retrievable receipt", async () => {
      const a = await write(create("A", true)),
        b = await write(create("B")),
        v = {
          action: "delete",
          requestId: randomUUID(),
          id: a.recordId,
          expectedDigest: a.digest,
        };
      const r = await write(v);
      expect(r.digest).toBeNull();
      expect(await write(v)).toEqual(r);
      expect(await readTemplateDetail(owner.merchantId, a.recordId)).toBeNull();
      expect(
        await readTemplateDetail(owner.merchantId, b.recordId)
      ).not.toBeNull();
    });
    it("denies an inactive owner and read-only member inside the transaction", async () => {
      await query(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(write(create())).rejects.toBeInstanceOf(QuotationConflict);
      await query(
        "UPDATE merchant_members SET role='viewer',is_active=1 WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(write(create())).rejects.toBeInstanceOf(QuotationConflict);
    });
    it("does not expose another actor's receipt or allow reuse of its request", async () => {
      const v = create(),
        a = await write(v);
      await query(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'sales_supervisor',1)",
        [owner.merchantId, other.userId]
      );
      expect(
        await readTemplateReceipt(owner.merchantId, other.userId, {
          requestId: v.requestId,
        })
      ).toBeNull();
      await expect(
        writeQuotationTemplate(owner.merchantId, other.userId, v)
      ).rejects.toBeInstanceOf(QuotationConflict);
      expect(await readTemplateDetail(other.merchantId, a.recordId)).toBeNull();
    });
    it("paginates legacy lists and treats wildcard text literally", async () => {
      for (let i = 0; i < 23; i++)
        await query(
          "INSERT INTO quotation_templates (merchant_id,name,terms_text) VALUES (?,?,?)",
          [owner.merchantId, i === 22 ? "Literal %_" : "Old " + i, "Legacy"]
        );
      const a = await readTemplateWorkspace(owner.merchantId, { page: 1 }),
        b = await readTemplateWorkspace(owner.merchantId, { page: 2 });
      expect(a).toMatchObject({ total: 23, filtered: 23, pages: 2 });
      expect(a.items).toHaveLength(20);
      expect(b.items).toHaveLength(3);
      expect(new Set([...a.items, ...b.items].map(r => r.id)).size).toBe(23);
      expect(
        (await readTemplateWorkspace(owner.merchantId, { search: "%_" }))
          .filtered
      ).toBe(1);
      expect((await readTemplateWorkspace(other.merchantId, {})).total).toBe(0);
    });
    it("labels oversized legacy content and blocks destructive use of its clipped preview", async () => {
      const a = await write(create());
      await query("UPDATE quotation_templates SET terms_text=? WHERE id=?", [
        "x".repeat(6000),
        a.recordId,
      ]);
      const row = (await readTemplateDetail(owner.merchantId, a.recordId))!;
      expect(row).toMatchObject({ editable: false, truncated: true });
      expect(row.termsText?.length).toBe(5001);
      await expect(
        write({
          action: "delete",
          requestId: randomUUID(),
          id: a.recordId,
          expectedDigest: row.digest,
        })
      ).rejects.toBeInstanceOf(QuotationConflict);
      expect(
        (
          await query(
            "SELECT CHAR_LENGTH(terms_text) n FROM quotation_templates WHERE id=?",
            [a.recordId]
          )
        )[0].n
      ).toBe(6000);
    });
  }
);
