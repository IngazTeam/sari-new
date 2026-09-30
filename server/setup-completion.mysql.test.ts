import { randomUUID } from "node:crypto";
import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  reviewSetupCompletion,
  completeReviewedSetup,
  readSetupCompletionReceipt,
} from "./setup-completion";
import {
  SetupConflict,
  SetupForbidden,
  SetupReviewRequired,
} from "./setup-store";
import {
  setupCompletionFields,
  type SetupCompletionFields,
} from "../shared/setup-completion";

describe.skipIf(!process.env.DATABASE_URL)(
  "setup completion MySQL transaction",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      templateId: number,
      fields: SetupCompletionFields;
    const q = async (text: string, params: any[] = []) =>
      (await (await getPool())!.execute<any>(text, params))[0];
    const review = () =>
      reviewSetupCompletion(owner.merchantId, owner.userId, { fields });
    const request = async () => ({
      fields,
      reviewed: true as const,
      requestId: randomUUID(),
      expectedDigest: (await review()).digest,
    });
    const complete = async (input: unknown) =>
      completeReviewedSetup(owner.merchantId, owner.userId, input);
    const receipt = (requestId: string) =>
      readSetupCompletionReceipt(owner.merchantId, owner.userId, { requestId });
    beforeEach(async () => {
      owner = await createDisposableMerchant("setup143");
      other = await createDisposableMerchant("setup-other");
      templateId = (
        await q(
          "INSERT INTO business_templates (business_type,template_name,is_active,usage_count) VALUES ('both','Disposable setup test',1,0)"
        )
      ).insertId;
      fields = setupCompletionFields.parse({
        businessType: "both",
        businessName: "متجر اختبار",
        phone: "+966500000001",
        address: "الرياض",
        description: "مراجعة",
        workingHoursType: "custom",
        workingHours: {
          sunday: { open: "09:00", close: "18:00", isOpen: true },
        },
        botTone: "professional",
        botLanguage: "ar",
        welcomeMessage: "",
        templateId,
        products: [
          {
            name: "منتج",
            priceMinor: 1234,
            currency: "USD",
            category: "تجربة",
          },
        ],
        services: [
          {
            name: "خدمة",
            priceMinor: 0,
            durationMinutes: 90,
            category: "تجربة",
          },
        ],
        websiteAnalysis: {
          websiteUrl: "https://example.test",
          platform: "custom",
        },
      });
      await q(
        "INSERT INTO setup_wizard_progress (merchant_id,current_step,wizard_data) VALUES (?,10,?)",
        [owner.merchantId, JSON.stringify({ draft: "preserved" })]
      );
      await q(
        "INSERT INTO bot_settings (merchant_id,auto_reply_enabled,welcome_message) VALUES (?,0,'old')",
        [owner.merchantId]
      );
      await q(
        "INSERT INTO sari_response_cache (merchant_id,question_text,response_text) VALUES (?,'Test','Old answer')",
        [owner.merchantId]
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
      if (templateId)
        await q("DELETE FROM business_templates WHERE id=?", [templateId]);
    });
    afterAll(closeDb);
    it("reads a review without writing or requiring a legacy website analysis record", async () => {
      const initial = await q("SELECT * FROM merchants WHERE id=?", [
        owner.merchantId,
      ]);
      const a = await review();
      expect(a.canComplete).toBe(true);
      expect(a.fields.websiteAnalysis?.websiteUrl).toBe("https://example.test");
      expect(
        await q("SELECT * FROM merchants WHERE id=?", [owner.merchantId])
      ).toEqual(initial);
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
      expect(
        (
          await q("SELECT usage_count FROM business_templates WHERE id=?", [
            templateId,
          ])
        )[0].usage_count
      ).toBe(0);
    });
    it("commits profile, assistant, exact catalog, flags, usage and receipt together without promoting website knowledge", async () => {
      const input = await request(),
        saved = await complete(input);
      expect(saved.products[0]).toMatchObject({
        priceMinor: 1234,
        currency: "USD",
      });
      expect(saved.services[0]).toMatchObject({
        priceMinor: 0,
        durationMinutes: 90,
      });
      const [merchant] = await q("SELECT * FROM merchants WHERE id=?", [
        owner.merchantId,
      ]);
      expect(merchant).toMatchObject({
        businessName: fields.businessName,
        phone: fields.phone,
        setupCompleted: 1,
        onboardingCompleted: 1,
        onboardingStep: 4,
        analysis_status: "pending",
        website_url: null,
      });
      expect(
        (
          await q("SELECT * FROM products WHERE merchantId=?", [
            owner.merchantId,
          ])
        )[0]
      ).toMatchObject({
        price: 1234,
        price_unit: "minor",
        currency: "USD",
        category: "تجربة",
        stock: null,
      });
      expect(
        (
          await q("SELECT * FROM services WHERE merchant_id=?", [
            owner.merchantId,
          ])
        )[0]
      ).toMatchObject({
        base_price: 0,
        duration_minutes: 90,
        category: "تجربة",
      });
      expect(
        (
          await q("SELECT * FROM bot_settings WHERE merchant_id=?", [
            owner.merchantId,
          ])
        )[0]
      ).toMatchObject({
        tone: "professional",
        welcome_message: "",
        auto_reply_enabled: 0,
      });
      expect(
        (
          await q("SELECT * FROM setup_wizard_progress WHERE merchant_id=?", [
            owner.merchantId,
          ])
        )[0]
      ).toMatchObject({
        is_completed: 1,
        revision: 1,
        wizard_data: JSON.stringify({ draft: "preserved" }),
      });
      expect(
        (
          await q("SELECT usage_count FROM business_templates WHERE id=?", [
            templateId,
          ])
        )[0].usage_count
      ).toBe(1);
      expect(
        await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
      expect(await receipt(input.requestId)).toEqual(saved);
    });
    it("replays concurrent requests once, preserves the original receipt and rejects UUID reuse with different fields", async () => {
      const input = await request();
      const [a, b] = await Promise.all([complete(input), complete(input)]);
      expect(a).toEqual(b);
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      expect(
        (
          await q("SELECT usage_count FROM business_templates WHERE id=?", [
            templateId,
          ])
        )[0].usage_count
      ).toBe(1);
      await expect(
        complete({ ...input, fields: { ...fields, businessName: "Changed" } })
      ).rejects.toBeInstanceOf(SetupConflict);
      expect(await receipt(input.requestId)).toEqual(a);
    });
    it("preserves the existing reply schedule when confirming different business hours", async () => {
      await q(
        "UPDATE bot_settings SET auto_reply_enabled=1,working_hours_enabled=1,working_hours_start='22:00',working_hours_end='02:00',working_days='6' WHERE merchant_id=?",
        [owner.merchantId]
      );
      const saved = await complete(await request());
      expect(saved.requestId).toBeTruthy();
      const [merchant] = await q(
        "SELECT workingHoursType,workingHours FROM merchants WHERE id=?",
        [owner.merchantId]
      );
      expect(merchant.workingHoursType).toBe("custom");
      expect(
        typeof merchant.workingHours === "string"
          ? JSON.parse(merchant.workingHours)
          : merchant.workingHours
      ).toEqual(fields.workingHours);
      const [settings] = await q(
        "SELECT auto_reply_enabled,working_hours_enabled,working_hours_start,working_hours_end,working_days FROM bot_settings WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(settings).toMatchObject({
        auto_reply_enabled: 1,
        working_hours_enabled: 1,
        working_hours_start: "22:00",
        working_hours_end: "02:00",
        working_days: "6",
      });
    });
    it("rejects a second request that reviewed the same incomplete setup", async () => {
      const input = await request();
      const results = await Promise.allSettled([
        complete(input),
        complete({ ...input, requestId: randomUUID() }),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await q(
          "SELECT id FROM setup_completion_receipts WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it.each([
      ["UPDATE merchants SET phone='500000002' WHERE id=?"],
      ["UPDATE merchants SET currency='USD' WHERE id=?"],
      ["UPDATE merchants SET integration_source='salla' WHERE id=?"],
      [
        "UPDATE setup_wizard_progress SET revision=revision+1 WHERE merchant_id=?",
      ],
      ["UPDATE setup_wizard_progress SET wizard_data='{}' WHERE merchant_id=?"],
      ["UPDATE bot_settings SET tone='casual' WHERE merchant_id=?"],
      ["INSERT INTO products (merchantId,name,price) VALUES (?,'Other',100)"],
      [
        "INSERT INTO services (merchant_id,name,duration_minutes) VALUES (?,'Other',30)",
      ],
    ])("rejects stale reviewed source: %s", async sql => {
      const input = await request();
      await q(sql, [owner.merchantId]);
      await expect(complete(input)).rejects.toBeInstanceOf(SetupConflict);
      expect(await receipt(input.requestId)).toBeNull();
      expect(
        (
          await q("SELECT setupCompleted FROM merchants WHERE id=?", [
            owner.merchantId,
          ])
        )[0].setupCompleted
      ).toBe(0);
    });
    it("binds the digest to the exact reviewed fields", async () => {
      const input = await request();
      await expect(
        complete({
          ...input,
          fields: { ...fields, welcomeMessage: "Changed after review" },
        })
      ).rejects.toBeInstanceOf(SetupConflict);
    });
    it("requires a fresh review after template retirement", async () => {
      const input = await request();
      await q("UPDATE business_templates SET is_active=0 WHERE id=?", [
        templateId,
      ]);
      await expect(complete(input)).rejects.toBeInstanceOf(SetupConflict);
      expect((await review()).templateAvailable).toBe(false);
      await expect(complete(await request())).rejects.toBeInstanceOf(
        SetupReviewRequired
      );
    });
    it("reports conflicting rows and never silently drops same-named items", async () => {
      fields.products.push({ ...fields.products[0] });
      await q(
        "INSERT INTO services (merchant_id,name,duration_minutes) VALUES (?,'خدمة',30)",
        [owner.merchantId]
      );
      const current = await review();
      expect(current.conflicts).toHaveLength(3);
      expect(current.canComplete).toBe(false);
      await expect(complete(await request())).rejects.toBeInstanceOf(
        SetupReviewRequired
      );
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
    });
    it("prevents writing a manual catalog into an external product source", async () => {
      await q("UPDATE merchants SET integration_source='salla' WHERE id=?", [
        owner.merchantId,
      ]);
      expect((await review()).catalogLocked).toBe(true);
      await expect(complete(await request())).rejects.toBeInstanceOf(
        SetupReviewRequired
      );
      fields.products = [];
      expect((await review()).canComplete).toBe(true);
    });
    it("fails closed on duplicate legacy assistant settings", async () => {
      await q("INSERT INTO bot_settings (merchant_id) VALUES (?)", [
        owner.merchantId,
      ]);
      await expect(review()).rejects.toThrow("SETUP_REPAIR_REQUIRED");
    });
    it("creates absent draft and assistant rows with automatic reply disabled", async () => {
      await q("DELETE FROM bot_settings WHERE merchant_id=?", [
        owner.merchantId,
      ]);
      await q("DELETE FROM setup_wizard_progress WHERE merchant_id=?", [
        owner.merchantId,
      ]);
      await complete(await request());
      expect(
        (
          await q(
            "SELECT auto_reply_enabled FROM bot_settings WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].auto_reply_enabled
      ).toBe(0);
      expect(
        (
          await q(
            "SELECT is_completed,revision FROM setup_wizard_progress WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0]
      ).toMatchObject({ is_completed: 1, revision: 1 });
    });
    it("isolates another tenant and does not reveal another actor's receipt", async () => {
      const input = await request();
      await complete(input);
      await expect(
        readSetupCompletionReceipt(owner.merchantId, other.userId, {
          requestId: input.requestId,
        })
      ).rejects.toBeInstanceOf(SetupForbidden);
      expect(
        await readSetupCompletionReceipt(other.merchantId, other.userId, {
          requestId: input.requestId,
        })
      ).toBeNull();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readSetupCompletionReceipt(owner.merchantId, other.userId, {
          requestId: input.requestId,
        })
      ).rejects.toBeInstanceOf(SetupConflict);
    });
    it.each(["viewer", "manager", "owner"])(
      "rechecks member revocation or non-owner role at commit: %s",
      async role => {
        const input = await request();
        await q(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,?)",
          [owner.merchantId, owner.userId, role, role === "owner" ? 0 : 1]
        );
        await expect(complete(input)).rejects.toBeInstanceOf(SetupForbidden);
      }
    );
    it.each([
      "UPDATE users SET account_status='deletion_pending' WHERE id=?",
      "UPDATE merchants SET status='suspended' WHERE id=?",
    ])("rejects inactive scope: %s", async sql => {
      const input = await request();
      await q(sql, [sql.includes("users") ? owner.userId : owner.merchantId]);
      await expect(complete(input)).rejects.toBeInstanceOf(SetupForbidden);
    });
    it("rolls back every write, usage and cache removal when receipt insertion fails", async () => {
      const input = await request(),
        before = await q("SELECT * FROM merchants WHERE id=?", [
          owner.merchantId,
        ]);
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await original(),
          execute = c.execute.bind(c);
        vi.spyOn(c, "execute").mockImplementation((...args: any[]) => {
          if (
            String(args[0]).startsWith("INSERT INTO setup_completion_receipts")
          )
            throw Error("Receipt failure");
          return (execute as any)(...args);
        });
        return c;
      });
      await expect(complete(input)).rejects.toThrow("Receipt failure");
      vi.restoreAllMocks();
      expect(
        await q("SELECT * FROM merchants WHERE id=?", [owner.merchantId])
      ).toEqual(before);
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
      expect(
        await q("SELECT id FROM services WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
      expect(
        (
          await q(
            "SELECT tone,welcome_message FROM bot_settings WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0]
      ).toMatchObject({ tone: "friendly", welcome_message: "old" });
      expect(
        (
          await q("SELECT usage_count FROM business_templates WHERE id=?", [
            templateId,
          ])
        )[0].usage_count
      ).toBe(0);
      expect(
        await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      expect(await receipt(input.requestId)).toBeNull();
    });
    it("recovers an uncertain commit by receipt and replays the same request without a second write", async () => {
      const input = await request(),
        pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await original(),
          commit = c.commit.bind(c);
        vi.spyOn(c, "commit").mockImplementation(async () => {
          await commit();
          throw Error("Lost commit acknowledgement");
        });
        return c;
      });
      await expect(complete(input)).rejects.toThrow(
        "Lost commit acknowledgement"
      );
      vi.restoreAllMocks();
      const saved = await receipt(input.requestId);
      expect(saved?.requestId).toBe(input.requestId);
      expect(await complete(input)).toEqual(saved);
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
    });
  }
);
