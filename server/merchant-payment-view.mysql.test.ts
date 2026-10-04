import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { merchantPaymentsRouter } from "./routers-merchant-payments";
import {
  upsertMerchantPaymentSettings,
  getMerchantPaymentSettings,
} from "./db";
import { closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "bounded merchant payment view with MySQL",
  () => {
    let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
    beforeEach(async () => {
      fixture = await createDisposableMerchant("payment-view461");
    });
    afterEach(() => cleanupDisposableMerchants([fixture.userId]));
    afterAll(closeDb);
    it("does not serialize decrypted Tap or webhook secrets from either route", async () => {
      await upsertMerchantPaymentSettings(fixture.merchantId, {
        tapPublicKey: "pk_test_fixture",
        tapSecretKey: "sk_test_private-fixture",
        tapWebhookSecret: "whsec_private-fixture",
        webhookUrl: "https://private.example.test/callback",
        tapEnabled: 0,
        tapTestMode: 1,
        autoSendPaymentLink: 0,
        paymentLinkMessage: "Saved fixture",
        defaultCurrency: "SAR",
      });
      const raw = await getMerchantPaymentSettings(fixture.merchantId);
      expect(raw).toMatchObject({
        tapSecretKey: "sk_test_private-fixture",
        tapWebhookSecret: "whsec_private-fixture",
      });
      const ctx = {
        user: { id: fixture.userId, role: "user" },
        req: { headers: { "x-merchant-id": String(fixture.merchantId) } },
        res: {},
      } as any;
      for (const api of [
        appRouter.createCaller(ctx).merchantPayments,
        merchantPaymentsRouter.createCaller(ctx),
      ]) {
        for (const request of [
          () => api.getSettings(),
          () => api.testConnection(),
          () =>
            api.saveSettings({
              tapEnabled: true,
              tapSecretKey: "sk_test_replacement",
            }),
        ])
          await expect(request()).rejects.toMatchObject({
            code: "PRECONDITION_FAILED",
          });
      }
      expect(await getMerchantPaymentSettings(fixture.merchantId)).toEqual(raw);
      for (const view of [
        await appRouter.createCaller(ctx).merchantPayments.workspace(),
        await merchantPaymentsRouter.createCaller(ctx).workspace(),
      ]) {
        expect(view).toMatchObject({
          actorId: fixture.userId,
          merchantId: fixture.merchantId,
          secretState: "stored",
          ready: false,
          values: {
            tapPublicKey: "pk_test_fixture",
            paymentLinkMessage: "Saved fixture",
          },
        });
        expect(JSON.stringify(view)).not.toContain("private");
        for (const field of [
          "tapSecretKey",
          "tapWebhookSecret",
          "webhookUrl",
          "id",
        ])
          expect(view).not.toHaveProperty(field);
      }
    });
  }
);
