import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readPaymentLinksWorkspace } from "./payment/payment-links-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "scoped payment link workspace on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const add = async (p: any = {}) =>
      Number(
        (
          await q(
            "INSERT INTO payment_links(merchant_id,link_id,title,amount,currency,tap_payment_url,is_active,status,usage_count,max_usage_count,expires_at,metadata,order_id,booking_id,created_at) VALUES (?,?,?,12550,'SAR','https://private.invalid',?,?,?,?,?,'private metadata',?,?,'2026-10-04 00:00:00')",
            [
              p.merchant ?? owner.merchantId,
              p.token ?? "link_" + randomBytes(16).toString("hex"),
              p.title ?? "Local link",
              p.active ?? 1,
              p.status ?? "active",
              p.usage ?? 0,
              p.max ?? null,
              p.expires ?? null,
              p.order ?? null,
              p.booking ?? null,
            ]
          )
        ).insertId
      );
    const api = (actor = owner.userId, merchant = owner.merchantId) =>
      appRouter.createCaller({
        user: { id: actor, role: "user" },
        req: { headers: { "x-merchant-id": String(merchant) } },
        res: {},
      } as any).payments.linksWorkspace;
    beforeEach(async () => {
      owner = await createDisposableMerchant("paylinks470");
      other = await createDisposableMerchant("paylinks470-alt");
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    it("disables a reviewed link without erasing its history and resolves a fresh repeated review", async () => {
      const id = await add({ usage: 1, max: 3 }),
        before = await api().detail({ id });
      const original = (
        await q("SELECT * FROM payment_links WHERE id=?", [id])
      )[0];
      const input = {
        id,
        expectedRevision: before.link!.revision,
        reviewed: true as const,
      };
      const result = await api().disableReviewed(input);
      expect(result).toMatchObject({
        outcome: "disabled",
        workspace: {
          link: {
            id,
            enabled: false,
            storedStatus: "disabled",
            usageCount: 1,
            maxUsageCount: 3,
          },
        },
      });
      const saved = (
        await q("SELECT * FROM payment_links WHERE id=?", [id])
      )[0];
      for (const key of [
        "amount",
        "currency",
        "usage_count",
        "max_usage_count",
        "metadata",
        "tap_payment_url",
        "order_id",
        "booking_id",
        "total_collected",
      ])
        expect(saved[key]).toEqual(original[key]);
      await expect(api().disableReviewed(input)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "payment_links:stale",
      });
      expect(
        await api().disableReviewed({
          ...input,
          expectedRevision: result.workspace.link!.revision,
        })
      ).toMatchObject({ outcome: "already_disabled" });
    });
    it("rejects a concurrent metadata change without disabling the changed link", async () => {
      const id = await add(),
        before = await api().detail({ id });
      await q("UPDATE payment_links SET metadata='changed' WHERE id=?", [id]);
      await expect(
        api().disableReviewed({
          id,
          expectedRevision: before.link!.revision,
          reviewed: true,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        (
          await q("SELECT is_active,status FROM payment_links WHERE id=?", [id])
        )[0]
      ).toEqual({ is_active: 1, status: "active" });
    });
    it("admits exactly one of two concurrent actions based on the same revision", async () => {
      const id = await add(),
        before = await api().detail({ id }),
        input = {
          id,
          expectedRevision: before.link!.revision,
          reviewed: true as const,
        };
      const results = await Promise.allSettled([
        api().disableReviewed(input),
        api().disableReviewed(input),
      ]);
      expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
      expect(
        results.filter(x => x.status === "rejected").map(x => x.reason.code)
      ).toEqual(["CONFLICT"]);
    });
    it("refuses foreign records and member/pending-owner writes", async () => {
      const id = await add(),
        foreign = await add({ merchant: other.merchantId }),
        before = await api().detail({ id }),
        input = {
          id,
          expectedRevision: before.link!.revision,
          reviewed: true as const,
        };
      await expect(
        api().disableReviewed({ ...input, id: foreign })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        api(other.userId).disableReviewed(input)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await q("UPDATE merchants SET status='pending' WHERE id=?", [
        owner.merchantId,
      ]);
      await expect(api().disableReviewed(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(
        (await q("SELECT is_active FROM payment_links WHERE id=?", [id]))[0]
          .is_active
      ).toBe(1);
    });
    it("allows explicit disabling of a malformed active flag without pretending it was valid", async () => {
      const id = await add({ active: 2 }),
        before = await api().detail({ id });
      expect(before.link?.availability).toBe("invalid");
      expect(
        await api().disableReviewed({
          id,
          expectedRevision: before.link!.revision,
          reviewed: true,
        })
      ).toMatchObject({
        outcome: "disabled",
        workspace: { link: { enabled: false, availability: "disabled" } },
      });
    });
    it("matches shared availability for all SQL filters and totals", async () => {
      const cases = [
        { status: "active", state: "available" },
        { active: 0, state: "disabled" },
        { status: "expired", state: "expired" },
        { expires: "2020-01-01 00:00:00", state: "expired" },
        { status: "completed", state: "exhausted" },
        { max: 1, usage: 1, state: "exhausted" },
        { active: 2, state: "invalid" },
        { usage: -1, state: "invalid" },
        { max: 0, state: "invalid" },
      ];
      const ids = [];
      for (const p of cases) ids.push(await add(p));
      await add({ merchant: other.merchantId });
      const all = await api().list({});
      expect(all.totals).toEqual({
        total: 9,
        states: {
          available: 1,
          disabled: 1,
          expired: 2,
          exhausted: 2,
          invalid: 3,
        },
      });
      expect(JSON.stringify(all)).not.toContain("private");
      for (const state of [
        "available",
        "disabled",
        "expired",
        "exhausted",
        "invalid",
      ] as const) {
        const d = await api().list({ availability: state });
        expect(d.items.map(x => x.id).sort((a, b) => a - b)).toEqual(
          ids.filter((_id, i) => cases[i].state === state)
        );
        expect(d.totals?.total).toBe(d.items.length);
        expect(d.items.every(x => x.availability === state)).toBe(true);
      }
    });
    it("paginates every link and searches literal special characters without truncation", async () => {
      const ids = [];
      for (let n = 0; n < 51; n++)
        ids.push(
          await add({ title: n === 50 ? "100%_! special" : "Local link" })
        );
      const pages = [];
      for (let page = 1; page <= 3; page++)
        pages.push(await api().list({ page }));
      expect(pages.flatMap(x => x.items).map(x => x.id)).toEqual(ids.reverse());
      expect(pages[2].items).toHaveLength(1);
      expect(pages[2].hasNext).toBe(false);
      const found = await api().list({ search: "100%_!" });
      expect(found.items).toHaveLength(1);
      expect(found.items[0].title).toBe("100%_! special");
      expect((await api().list({ search: "' OR 1=1 --" })).totals?.total).toBe(
        0
      );
    });
    it("hides foreign details and validates input scope", async () => {
      const id = await add(),
        foreign = await add({ merchant: other.merchantId });
      expect(await api().detail({ id })).toMatchObject({
        state: "found",
        link: { id, amountMinor: 12550 },
      });
      expect(await api().detail({ id: foreign })).toMatchObject({
        state: "missing",
        link: null,
      });
      await expect(
        api(owner.userId, other.merchantId).detail({ id: foreign })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        api().list({ merchantId: other.merchantId } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
    it.each(["manager", "viewer", "sales_supervisor"])(
      "does not grant owner financial links to %s",
      async role => {
        const id = await add();
        await q(
          "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
          [owner.merchantId, other.userId, role]
        );
        expect(await api(other.userId).list({})).toMatchObject({
          state: "restricted",
          canManage: false,
          items: [],
          totals: null,
        });
        expect(await api(other.userId).detail({ id })).toMatchObject({
          state: "restricted",
          link: null,
        });
      }
    );
    it("checks live account and membership state with an authenticated context", async () => {
      await add();
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(
        readPaymentLinksWorkspace(owner.userId, owner.merchantId, {})
      ).rejects.toThrow("forbidden");
      await q("UPDATE users SET account_status='active' WHERE id=?", [
        owner.userId,
      ]);
      await q(
        "INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(
        readPaymentLinksWorkspace(owner.userId, owner.merchantId, {})
      ).rejects.toThrow("forbidden");
    });
    it("binds detail revision to stored metadata without revealing it", async () => {
      const id = await add();
      const before = await api().detail({ id });
      await q(
        "UPDATE payment_links SET metadata='private changed' WHERE id=?",
        [id]
      );
      const after = await api().detail({ id });
      expect(after.link?.revision).not.toBe(before.link?.revision);
      expect(JSON.stringify(after)).not.toContain("private");
    });
    it("hides foreign order identity and sharing link", async () => {
      const order = Number(
        (
          await q(
            "INSERT INTO orders(merchantId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,'synthetic','Local','[]',12550,'SAR')",
            [other.merchantId]
          )
        ).insertId
      );
      const id = await add({ order });
      const d = await api().detail({ id });
      expect(d.link).toMatchObject({
        related: { kind: "unavailable" },
        publicUrl: null,
        warnings: expect.arrayContaining(["target"]),
      });
      expect(d.link?.related).not.toHaveProperty("id");
    });
    it("checks the entire booking/service tenant chain", async () => {
      const service = Number(
        (
          await q(
            "INSERT INTO services(merchant_id,name,duration_minutes,is_active) VALUES (?,'Foreign service',60,1)",
            [other.merchantId]
          )
        ).insertId
      );
      const booking = Number(
        (
          await q(
            "INSERT INTO bookings(merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price) VALUES (?,?,'synthetic','2026-10-04','10:00','11:00',60,12550,12550)",
            [owner.merchantId, service]
          )
        ).insertId
      );
      expect(
        (await api().detail({ id: await add({ booking }) })).link
      ).toMatchObject({ related: { kind: "unavailable" }, publicUrl: null });
    });
    it("separates missing and out-of-range pages without inventing rows", async () => {
      expect(await api().list({})).toMatchObject({
        state: "ready",
        items: [],
        totals: { total: 0 },
      });
      await add();
      expect(await api().list({ page: 9999 })).toMatchObject({
        state: "ready",
        items: [],
        totals: { total: 1 },
        hasNext: false,
      });
    });
  }
);
