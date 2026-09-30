import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { appRouter } from "../routers";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "Orders management through the reviewed API",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, id: number;
    const query = async (q: string, p: any[] = []) =>
      (await (await getPool())!.execute<any>(q, p))[0];
    const caller = () =>
      appRouter.createCaller({
        user: { id: owner.userId, role: "user" },
        req: { headers: { "x-merchant-id": String(owner.merchantId) } },
        res: {},
      } as any);
    beforeEach(async () => {
      owner = await createDisposableMerchant("order-route");
      id = (
        await query(
          "INSERT INTO orders (merchantId,customerName,customerPhone,items,totalAmount,currency,status,notes) VALUES (?,'Integration fixture','+12025550162','[]',100,'USD','pending','Keep notes')",
          [owner.merchantId]
        )
      ).insertId;
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("lists a scoped page with exact counts and currency", async () => {
      const r = await caller().orders.workspace.list({
        search: "Integration",
        status: "pending",
      });
      expect(r).toMatchObject({
        merchantId: owner.merchantId,
        total: 1,
        filtered: 1,
        page: 1,
        pages: 1,
      });
      expect(r.items[0]).toMatchObject({
        id,
        totalMinor: 100,
        currency: "USD",
      });
    });
    it("rejects browser tenant injection and malformed identifiers", async () => {
      await expect(
        caller().orders.workspace.list({ merchantId: owner.merchantId } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller().orders.workspace.detail({ id: 0 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
    it("reviews cancellation then saves once without removing notes", async () => {
      const intent = {
        id,
        status: "cancelled" as const,
        reason: "Reviewed by operator",
        notify: false,
      };
      const r = await caller().orders.workspace.statusReview(intent);
      const v = {
        requestId: randomUUID(),
        intent,
        expectedDigest: r.digest,
        reviewed: true as const,
      };
      const receipt = await caller().orders.workspace.statusWrite(v);
      expect(await caller().orders.workspace.statusWrite(v)).toEqual(receipt);
      expect(
        await caller().orders.workspace.statusReceipt({
          requestId: v.requestId,
        })
      ).toEqual(receipt);
      expect(
        (await query("SELECT status,notes FROM orders WHERE id=?", [id]))[0]
      ).toEqual({ status: "cancelled", notes: "Keep notes" });
    });
    it("rejects manual paid status and terminal cancellation", async () => {
      await expect(
        caller().orders.workspace.statusReview({
          id,
          status: "paid",
          notify: false,
        } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await query("UPDATE orders SET status='delivered' WHERE id=?", [id]);
      await expect(
        caller().orders.workspace.statusReview({
          id,
          status: "cancelled",
          reason: "Too late",
          notify: false,
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });
    it("does not expose the retired unreviewed mutations", () => {
      expect(appRouter._def.procedures).not.toHaveProperty("orders.cancel");
      expect(appRouter._def.procedures).not.toHaveProperty(
        "orders.updateStatus"
      );
      expect(
        appRouter._def.procedures["orders.workspace.statusWrite"]
      ).toBeDefined();
    });
    it("exposes only the scoped workspace reads for the tenant order page", () => {
      for(const key of ["listByMerchant","getById","getWithFilters","getStats"])
        expect(appRouter._def.procedures[`orders.${key}`]).toBeUndefined();
      for(const key of ["list","detail","statusHistory"])
        expect(appRouter._def.procedures[`orders.workspace.${key}`]).toBeDefined();
    });
  }
);
