import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { conversations } from "../drizzle/schema";
import { closeDb, getDb } from "./db/connection";
import { getAssistantSettings, updateBotSettings } from "./db";
import {
  assistantOptionRevision,
  botSettingsFormRevision,
} from "./bot-settings-version";
import { readTakeoverWorkspace } from "./takeover-workspace";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed assistant options in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    beforeEach(async () => {
      owner = await createDisposableMerchant("options");
      other = await createDisposableMerchant("other-options");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("serializes two language writes from the same review and leaves unrelated settings intact", async () => {
      const before = await getAssistantSettings(owner.merchantId);
      const options = {
        option: "language" as const,
        expectedOptionRevision: assistantOptionRevision(before, "language"),
      };
      const results = await Promise.allSettled([
        updateBotSettings(owner.merchantId, { language: "en" }, options),
        updateBotSettings(owner.merchantId, { language: "fr" }, options),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find(r => r.status === "rejected")).toMatchObject({
        reason: { name: "AssistantSettingsConflictError" },
      });
      expect(await getAssistantSettings(owner.merchantId)).toMatchObject({
        autoReplyEnabled: before.autoReplyEnabled,
        takeoverTimeoutMinutes: before.takeoverTimeoutMinutes,
        takeoverResumeMessage: before.takeoverResumeMessage,
      });
    });
    it("permits disjoint reviewed options but invalidates stale full-form language and foreign reviews", async () => {
      const before = await getAssistantSettings(owner.merchantId),
        foreign = await getAssistantSettings(other.merchantId);
      await Promise.all([
        updateBotSettings(
          owner.merchantId,
          { language: "both" },
          {
            option: "language",
            expectedOptionRevision: assistantOptionRevision(before, "language"),
          }
        ),
        updateBotSettings(
          owner.merchantId,
          { takeoverTimeoutMinutes: 90, takeoverCommandsEnabled: 0 },
          {
            option: "takeover",
            expectedOptionRevision: assistantOptionRevision(before, "takeover"),
          }
        ),
      ]);
      expect(await getAssistantSettings(owner.merchantId)).toMatchObject({
        language: "both",
        takeoverTimeoutMinutes: 90,
        takeoverCommandsEnabled: 0,
      });
      await expect(
        updateBotSettings(
          owner.merchantId,
          { language: "ar" },
          { expectedRevision: botSettingsFormRevision(before) }
        )
      ).rejects.toMatchObject({ name: "AssistantSettingsConflictError" });
      await expect(
        updateBotSettings(
          owner.merchantId,
          { language: "en" },
          {
            option: "language",
            expectedOptionRevision: assistantOptionRevision(
              foreign,
              "language"
            ),
          }
        )
      ).rejects.toMatchObject({ name: "AssistantSettingsConflictError" });
    });
    it("rejects a stale takeover save without changing the winning fields or legacy text", async () => {
      await updateBotSettings(owner.merchantId, {
        takeoverResumeMessage: "legacy preserved",
      });
      const options = {
        option: "takeover" as const,
        expectedOptionRevision: assistantOptionRevision(
          await getAssistantSettings(owner.merchantId),
          "takeover"
        ),
      };
      await updateBotSettings(
        owner.merchantId,
        { takeoverTimeoutMinutes: 60, takeoverCommandsEnabled: 0 },
        options
      );
      await expect(
        updateBotSettings(
          owner.merchantId,
          { takeoverTimeoutMinutes: 30, takeoverCommandsEnabled: 1 },
          options
        )
      ).rejects.toMatchObject({ name: "AssistantSettingsConflictError" });
      expect(await getAssistantSettings(owner.merchantId)).toMatchObject({
        takeoverTimeoutMinutes: 60,
        takeoverCommandsEnabled: 0,
        takeoverResumeMessage: "legacy preserved",
      });
    });
    it("includes old human-owned conversations beyond 500 newer rows, paginates and hides foreign metadata", async () => {
      const db = (await getDb())!;
      await db
        .insert(conversations)
        .values(
          Array.from({ length: 12 }, (_, i) => ({
            merchantId: owner.merchantId,
            customerPhone: "human-" + i,
            humanTakeover: 1,
            agentHistory:
              i === 11
                ? JSON.stringify({
                    permanentSilence: true,
                    private: "never return",
                  })
                : "malformed",
          }))
        );
      await db
        .insert(conversations)
        .values(
          Array.from({ length: 501 }, (_, i) => ({
            merchantId: owner.merchantId,
            customerPhone: "auto-" + i,
            humanTakeover: 0,
          }))
        );
      await db
        .insert(conversations)
        .values({
          merchantId: other.merchantId,
          customerPhone: "foreign",
          humanTakeover: 1,
        });
      const first = await readTakeoverWorkspace(owner.merchantId, 1),
        second = await readTakeoverWorkspace(owner.merchantId, 2);
      expect(first).toMatchObject({
        total: 12,
        pageSize: 10,
        directReplyHours: 24,
        manualMaxHours: 24,
      });
      expect(first.rows).toHaveLength(10);
      expect(second.rows).toHaveLength(2);
      expect(first.rows[0]).toMatchObject({
        customerPhone: "human-11",
        permanentSilence: true,
      });
      expect(new Set([...first.rows, ...second.rows].map(r => r.id)).size).toBe(
        12
      );
      expect(JSON.stringify(first)).not.toContain("agentHistory");
      expect(JSON.stringify(first)).not.toContain("foreign");
      expect((await readTakeoverWorkspace(owner.merchantId, 3)).rows).toEqual(
        []
      );
    });
  }
);
