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
import { sariPersonalitySettings } from "../drizzle/schema";
import { getDb, closeDb } from "./db/connection";
import {
  getAssistantSettings,
  getBotSettings,
  getOrCreatePersonalitySettings,
  updateBotSettings,
  updateSariPersonalitySettings,
} from "./db";
import {
  botSettingsFormRevision,
  AssistantSettingsConflictError,
} from "./bot-settings-version";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";

describe.skipIf(!process.env.DATABASE_URL)(
  "unified assistant personality MySQL store",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    beforeEach(async () => {
      owner = await createDisposableMerchant("personality");
      other = await createDisposableMerchant("personality-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("retains all personality fields and keeps operating instructions independent", async () => {
      await updateSariPersonalitySettings(owner.merchantId, {
        tone: "enthusiastic",
        style: "formal_arabic",
        emojiUsage: "none",
        brandVoice: "صوت العلامة",
        customInstructions: "تعليمات الشخصية",
      });
      await updateBotSettings(owner.merchantId, {
        customInstructions: "تعليمات التشغيل",
      });
      const saved = await getAssistantSettings(owner.merchantId);
      expect(saved).toMatchObject({
        tone: "enthusiastic",
        style: "formal_arabic",
        emojiUsage: "none",
        brandVoice: "صوت العلامة",
        personalityInstructions: "تعليمات الشخصية",
        customInstructions: "تعليمات التشغيل",
      });
      expect(await getBotSettings(owner.merchantId)).toMatchObject({
        tone: "friendly",
      });
      expect(await getAssistantSettings(other.merchantId)).toMatchObject({
        tone: "friendly",
        brandVoice: "",
        personalityInstructions: "",
      });
      await updateBotSettings(owner.merchantId, {
        brandVoice: "",
        personalityInstructions: "",
      });
      expect(await getAssistantSettings(owner.merchantId)).toMatchObject({
        brandVoice: "",
        personalityInstructions: "",
        customInstructions: "تعليمات التشغيل",
      });
    });
    it("detects legacy personality edits before overwriting a modern draft", async () => {
      const expectedRevision = botSettingsFormRevision(
        await getAssistantSettings(owner.merchantId)
      );
      await updateSariPersonalitySettings(owner.merchantId, {
        emojiUsage: "frequent",
      });
      await expect(
        updateBotSettings(
          owner.merchantId,
          { welcomeMessage: "stale", brandVoice: "stale" },
          { expectedRevision }
        )
      ).rejects.toBeInstanceOf(AssistantSettingsConflictError);
      expect(await getAssistantSettings(owner.merchantId)).toMatchObject({
        emojiUsage: "frequent",
        brandVoice: "",
      });
    });
    it("only accepts one complete bot/personality pair from simultaneous saves", async () => {
      const expectedRevision = botSettingsFormRevision(
        await getAssistantSettings(owner.merchantId)
      );
      const outcomes = await Promise.allSettled([
        updateBotSettings(
          owner.merchantId,
          { welcomeMessage: "A", tone: "enthusiastic", brandVoice: "A" },
          { expectedRevision }
        ),
        updateBotSettings(
          owner.merchantId,
          { welcomeMessage: "B", tone: "professional", brandVoice: "B" },
          { expectedRevision }
        ),
      ]);
      expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.find(x => x.status === "rejected")).toMatchObject({
        reason: { name: "AssistantSettingsConflictError" },
      });
      const saved = await getAssistantSettings(owner.merchantId);
      expect(saved.welcomeMessage).toBe(saved.brandVoice);
      expect(saved.tone).toBe(
        saved.brandVoice === "A" ? "enthusiastic" : "professional"
      );
    });
    it("rolls back bot changes when the personality write fails", async () => {
      const original = await getAssistantSettings(owner.merchantId),
        db = (await getDb())!,
        transaction = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementationOnce((async (write: any) =>
        transaction(async tx =>
          write(
            new Proxy(tx, {
              get(target, key) {
                if (key === "update")
                  return (table: any) => {
                    if (table === sariPersonalitySettings)
                      throw Error("injected personality failure");
                    return target.update(table);
                  };
                const value = Reflect.get(target, key);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
          )
        )) as any);
      await expect(
        updateBotSettings(owner.merchantId, {
          welcomeMessage: "must rollback",
          tone: "enthusiastic",
          brandVoice: "must rollback",
        })
      ).rejects.toThrow("injected");
      expect(await getAssistantSettings(owner.merchantId)).toMatchObject({
        welcomeMessage: original.welcomeMessage,
        tone: original.tone,
        brandVoice: original.brandVoice,
      });
    });
    it("creates exactly one personality row on concurrent first reads", async () => {
      await Promise.all(
        Array.from({ length: 6 }, () =>
          getOrCreatePersonalitySettings(owner.merchantId)
        )
      );
      const rows = await (await getDb())!
        .select()
        .from(sariPersonalitySettings)
        .where(eq(sariPersonalitySettings.merchantId, owner.merchantId));
      expect(rows).toHaveLength(1);
    });
    it("rejects ambiguous legacy personality rows before changing either store", async () => {
      const old = await getAssistantSettings(owner.merchantId);
      await (await getDb())!
        .insert(sariPersonalitySettings)
        .values({ merchantId: owner.merchantId });
      await expect(
        updateBotSettings(owner.merchantId, {
          welcomeMessage: "ambiguous",
          tone: "professional",
        })
      ).rejects.toThrow("Personality settings unavailable");
      expect((await getBotSettings(owner.merchantId)).welcomeMessage).toBe(
        old.welcomeMessage
      );
    });
  }
);
