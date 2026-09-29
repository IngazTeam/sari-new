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
import { botSettings, virtualAgents } from "../drizzle/schema";
import { closeDb, getDb } from "./db/connection";
import { getBotSettings, updateBotSettings } from "./db";
import { virtualTeamRevision } from "./virtual-team-version";
import { virtualAgentsRouter } from "./routers-virtual-agents";
import {
  cleanupDisposableMerchants,
  createDisposableMerchant,
} from "./tests/helpers/disposable-merchant";
import { InvalidWorkingScheduleError } from "../shared/bot-working-schedule";
import {
  botSettingsFormRevision,
  AssistantSettingsConflictError,
} from "./bot-settings-version";

describe.skipIf(!process.env.DATABASE_URL)(
  "assistant save invariants in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const caller = (tenant = owner) =>
      virtualAgentsRouter.createCaller({
        user: { id: tenant.userId, role: "user" },
        req: { headers: { "x-merchant-id": String(tenant.merchantId) } },
        res: {},
      } as any);
    const base = {
      name: "سارة",
      role: "دعم",
      personalityPrompt: "ساعد العميل من المعرفة المحفوظة",
    };
    const team = async (merchantId = owner.merchantId) =>
      (await getDb())!
        .select()
        .from(virtualAgents)
        .where(eq(virtualAgents.merchantId, merchantId));
    const version = async (tenant = owner) => ({
      expectedRevision: virtualTeamRevision(
        tenant.merchantId,
        await team(tenant.merchantId)
      ),
    });
    beforeEach(async () => {
      owner = await createDisposableMerchant("assistant-save");
      other = await createDisposableMerchant("assistant-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);

    it("rejects one of two saves from the same revision without losing the winning fields", async () => {
      const expectedRevision = botSettingsFormRevision(
        await getBotSettings(owner.merchantId)
      );
      const results = await Promise.allSettled([
        updateBotSettings(
          owner.merchantId,
          { welcomeMessage: "first", language: "en" },
          { expectedRevision }
        ),
        updateBotSettings(
          owner.merchantId,
          { welcomeMessage: "second", language: "fr" },
          { expectedRevision }
        ),
      ]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        results.find(result => result.status === "rejected")
      ).toMatchObject({ reason: { name: "AssistantSettingsConflictError" } });
      const saved = await getBotSettings(owner.merchantId);
      expect([
        { welcomeMessage: "first", language: "en" },
        { welcomeMessage: "second", language: "fr" },
      ]).toContainEqual({
        welcomeMessage: saved.welcomeMessage,
        language: saved.language,
      });
    });
    it("detects writes from other settings pages and rejects another tenant's revision", async () => {
      const original = await getBotSettings(owner.merchantId);
      const expectedRevision = botSettingsFormRevision(original);
      await updateBotSettings(owner.merchantId, { language: "en" });
      await expect(
        updateBotSettings(
          owner.merchantId,
          { welcomeMessage: "stale" },
          { expectedRevision }
        )
      ).rejects.toBeInstanceOf(AssistantSettingsConflictError);
      const foreign = botSettingsFormRevision(
        await getBotSettings(other.merchantId)
      );
      await expect(
        updateBotSettings(
          owner.merchantId,
          { welcomeMessage: "foreign" },
          { expectedRevision: foreign }
        )
      ).rejects.toBeInstanceOf(AssistantSettingsConflictError);
      expect(await getBotSettings(owner.merchantId)).toMatchObject({
        language: "en",
        welcomeMessage: original.welcomeMessage,
      });
    });

    it("serializes competing creates at the ten-persona boundary and keeps unique priority", async () => {
      for (let i = 0; i < 9; i++)
        await caller().create({
          ...(await version()),
          ...base,
          isDefault: i === 0,
        });
      const reviewed = await version();
      const results = await Promise.allSettled([
        caller().create({ ...base, ...reviewed }),
        caller().create({ ...reviewed, ...base, isDefault: true }),
      ]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        results.find(result => result.status === "rejected")
      ).toMatchObject({ reason: { code: "CONFLICT" } });
      const rows = await team();
      expect(rows).toHaveLength(10);
      expect(new Set(rows.map(row => row.sortOrder)).size).toBe(10);
      expect(rows.filter(row => row.isDefault)).toHaveLength(1);
    });
    it("rejects a stale save even when another persona, the default, or team priority changed", async () => {
      const a = await caller().create({
        ...base,
        ...(await version()),
        isDefault: true,
      });
      const b = await caller().create({
        ...base,
        ...(await version()),
        name: "Other",
      });
      const reviewed = await caller().listReview();
      expect(reviewed.canManage).toBe(true);
      await caller().update({
        id: b.id,
        ...(await version()),
        role: "Sales",
        isDefault: true,
      });
      for (const change of [
        () =>
          caller().update({
            id: a.id,
            expectedRevision: reviewed.revision,
            personalityPrompt: "stale instructions",
            isDefault: true,
          }),
        () =>
          caller().delete({ id: a.id, expectedRevision: reviewed.revision }),
        () =>
          caller().reorder({
            orderedIds: [b.id, a.id],
            expectedRevision: reviewed.revision,
          }),
      ])
        await expect(change()).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await team()).find(row => row.id === a.id)).toMatchObject({
        personalityPrompt: base.personalityPrompt,
        isDefault: 0,
        sortOrder: 0,
      });
      expect((await team()).find(row => row.id === b.id)).toMatchObject({
        role: "Sales",
        isDefault: 1,
        sortOrder: 1,
      });
      const beforeOrder = await version();
      await caller().reorder({ ...beforeOrder, orderedIds: [b.id, a.id] });
      await expect(
        caller().update({ ...beforeOrder, id: a.id, name: "stale" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
    it("keeps a deleted persona deleted and rejects a foreign or omitted revision", async () => {
      const own = await caller().create({ ...base, ...(await version()) });
      const reviewed = await version();
      await caller().delete({ ...reviewed, id: own.id });
      await expect(
        caller().update({ ...reviewed, id: own.id, name: "revive" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        caller().create({ ...base, ...(await version(other)) })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(caller().create(base as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(await team()).toEqual([]);
    });
    it("keeps exactly one default after concurrent changes", async () => {
      const a = await caller().create({
        ...(await version()),
        ...base,
        isDefault: true,
      });
      const b = await caller().create({ ...base, ...(await version()) });
      const reviewed = await version();
      const results = await Promise.allSettled([
        caller().update({
          ...reviewed,
          id: a.id,
          name: "changed",
          isDefault: true,
        }),
        caller().update({ ...reviewed, id: b.id, isDefault: true }),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find(r => r.status === "rejected")).toMatchObject({
        reason: { code: "CONFLICT" },
      });
      expect((await team()).filter(row => row.isDefault)).toHaveLength(1);
    });
    it("seeds an empty team only once during competing requests", async () => {
      const reviewed = await version();
      const results = await Promise.allSettled([
        caller().seedTemplates(reviewed),
        caller().seedTemplates(reviewed),
      ]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        results.find(result => result.status === "rejected")
      ).toMatchObject({ reason: { code: "CONFLICT" } });
      expect(await team()).toHaveLength(3);
      expect((await team()).filter(row => row.isDefault)).toHaveLength(1);
    });
    it("rolls back the cleared default when insertion fails", async () => {
      const saved = await caller().create({
        ...(await version()),
        ...base,
        isDefault: true,
      });
      const db = (await getDb())!;
      const original = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementationOnce((async (write: any) =>
        original(async tx => {
          const proxy = new Proxy(tx, {
            get(target, key) {
              if (key === "insert")
                return () => ({
                  values: async () => {
                    throw Error("injected insert failure");
                  },
                });
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          return write(proxy);
        })) as any);
      await expect(
        caller().create({ ...(await version()), ...base, isDefault: true })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      expect(await team()).toMatchObject([{ id: saved.id, isDefault: 1 }]);
    });
    it("rejects foreign mutations and stale reorder lists without altering either tenant", async () => {
      const own = await caller().create({ ...base, ...(await version()) });
      const foreign = await caller(other).create({
        ...(await version(other)),
        ...base,
        isDefault: true,
      });
      for (const mutation of [
        async () =>
          caller().update({
            ...(await version()),
            id: foreign.id,
            isDefault: true,
          }),
        async () => caller().delete({ ...(await version()), id: foreign.id }),
      ])
        await expect(mutation()).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        caller().reorder({
          ...(await version()),
          orderedIds: [own.id, foreign.id],
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const later = await caller().create({ ...base, ...(await version()) });
      await expect(
        caller().reorder({ ...(await version()), orderedIds: [own.id] })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await caller().reorder({
        ...(await version()),
        orderedIds: [later.id, own.id],
      });
      expect(
        (await team())
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(row => row.id)
      ).toEqual([later.id, own.id]);
      expect(await team(other.merchantId)).toMatchObject([
        { id: foreign.id, isDefault: 1, sortOrder: 0 },
      ]);
    });
    it("validates partial schedules against the locked saved row and rolls back all submitted fields", async () => {
      await updateBotSettings(owner.merchantId, {
        workingHoursEnabled: 1,
        workingHoursStart: "09:00",
        workingHoursEnd: "18:00",
      });
      await expect(
        updateBotSettings(owner.merchantId, {
          workingHoursEnd: "09:00",
          welcomeMessage: "must not save",
        })
      ).rejects.toBeInstanceOf(InvalidWorkingScheduleError);
      expect(await getBotSettings(owner.merchantId)).toMatchObject({
        workingHoursEnd: "18:00",
      });
      expect((await getBotSettings(owner.merchantId)).welcomeMessage).not.toBe(
        "must not save"
      );
    });
    it("rejects one of two individually valid changes if their merged result would have equal endpoints", async () => {
      await updateBotSettings(owner.merchantId, {
        workingHoursEnabled: 1,
        workingHoursStart: "09:00",
        workingHoursEnd: "18:00",
      });
      const results = await Promise.allSettled([
        updateBotSettings(owner.merchantId, { workingHoursStart: "12:00" }),
        updateBotSettings(owner.merchantId, { workingHoursEnd: "12:00" }),
      ]);
      expect(
        results.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        results.find(result => result.status === "rejected")
      ).toMatchObject({ reason: { name: "InvalidWorkingScheduleError" } });
      const saved = await getBotSettings(owner.merchantId);
      expect(saved.workingHoursStart).not.toBe(saved.workingHoursEnd);
    });
    it("accepts overnight hours and empty days, permits disabling legacy invalid hours, and isolates settings", async () => {
      await updateBotSettings(owner.merchantId, {
        workingHoursEnabled: 1,
        workingHoursStart: "22:00",
        workingHoursEnd: "02:00",
        workingDays: "",
      });
      expect(await getBotSettings(owner.merchantId)).toMatchObject({
        workingHoursStart: "22:00",
        workingHoursEnd: "02:00",
        workingDays: "",
      });
      expect(await getBotSettings(other.merchantId)).toMatchObject({
        workingHoursStart: "09:00",
        workingHoursEnd: "18:00",
        workingDays: "1,2,3,4,5",
      });
      const db = (await getDb())!;
      await db
        .update(botSettings)
        .set({ workingHoursStart: "99:99" })
        .where(eq(botSettings.merchantId, owner.merchantId));
      await updateBotSettings(owner.merchantId, { workingHoursEnabled: 0 });
      await updateBotSettings(owner.merchantId, {
        welcomeMessage: "saved independently",
      });
      await expect(
        updateBotSettings(owner.merchantId, { workingHoursEnabled: 1 })
      ).rejects.toBeInstanceOf(InvalidWorkingScheduleError);
    });
    it("fails closed for duplicate legacy settings instead of updating ambiguous rows", async () => {
      await getBotSettings(owner.merchantId);
      await (await getDb())!
        .insert(botSettings)
        .values({ merchantId: owner.merchantId });
      await expect(
        updateBotSettings(owner.merchantId, { welcomeMessage: "must not save" })
      ).rejects.toThrow("Bot settings unavailable");
      const rows = await (await getDb())!
        .select()
        .from(botSettings)
        .where(eq(botSettings.merchantId, owner.merchantId));
      expect(rows.every(row => row.welcomeMessage !== "must not save")).toBe(
        true
      );
    });
  }
);
