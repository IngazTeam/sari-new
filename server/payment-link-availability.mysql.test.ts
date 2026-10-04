import { randomBytes } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { appRouter } from "./routers";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import * as tap from "./payment/tap-client";
describe.skipIf(!process.env.DATABASE_URL)(
  "payment link availability with stored MySQL values",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    beforeEach(async () => {
      owner = await createDisposableMerchant("pay-link469");
      vi.spyOn(tap, "postTapCharge").mockImplementation(async () => {
        throw Error("unavailable link reached provider");
      });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId]);
    });
    afterAll(closeDb);
    it.each([
      {
        status: "expired",
        expires: null,
        active: 1,
        usage: 0,
        max: null,
        reason: "expired",
      },
      {
        status: "expired",
        expires: "2030-01-01 00:00:00",
        active: 1,
        usage: 0,
        max: null,
        reason: "expired",
      },
      {
        status: "active",
        expires: null,
        active: 2,
        usage: 0,
        max: null,
        reason: "invalid",
      },
      {
        status: "active",
        expires: null,
        active: 1,
        usage: -1,
        max: null,
        reason: "invalid",
      },
      {
        status: "active",
        expires: null,
        active: 1,
        usage: 0,
        max: 0,
        reason: "invalid",
      },
    ])(
      "blocks a stored unavailable record %j without changing it",
      async value => {
        const token = "link_" + randomBytes(16).toString("hex");
        const result = await q(
          "INSERT INTO payment_links(merchant_id,link_id,title,amount,currency,tap_payment_url,is_active,status,usage_count,max_usage_count,expires_at,metadata) VALUES (?,?, 'Synthetic local',12550,'SAR','https://example.test/pay',?,?,?,?,?,'private')",
          [
            owner.merchantId,
            token,
            value.active,
            value.status,
            value.usage,
            value.max,
            value.expires,
          ]
        );
        const before = await q("SELECT * FROM payment_links WHERE id=?", [
          result.insertId,
        ]);
        const api = appRouter.createCaller({
          user: null,
          req: { headers: {} },
          res: {},
        } as any).payments;
        const view = await api.getPublicLink({ linkId: token });
        expect(view).toMatchObject({
          available: false,
          unavailableReason: value.reason,
        });
        expect(JSON.stringify(view)).not.toContain("private");
        await expect(
          api.checkoutLink({
            linkId: token,
            customerName: "Local customer",
            customerPhone: "0501234567",
            checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          })
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "رابط الدفع غير متاح أو منتهي",
        });
        expect(tap.postTapCharge).not.toHaveBeenCalled();
        expect(
          await q("SELECT * FROM payment_links WHERE id=?", [result.insertId])
        ).toEqual(before);
      }
    );
  }
);
