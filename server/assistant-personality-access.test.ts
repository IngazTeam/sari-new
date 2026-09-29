import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantSettingsDraft,
  compareAssistantDraft,
} from "../shared/assistant-settings-draft";
import { effectiveAssistantTone } from "../shared/assistant-personality";
import { buildSystemPrompt } from "./ai/sari-personality";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  bot: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: vi.fn(async () => ({ id: 20, status: "active" })),
  getOrCreatePersonalitySettings: m.read,
  updateSariPersonalitySettings: m.update,
  updateBotSettings: m.bot,
  getAssistantSettings: m.settings,
}));
import { appRouter } from "./routers";
const caller = () =>
  appRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 3 });
  m.read.mockResolvedValue({ tone: "enthusiastic" });
  m.update.mockResolvedValue({ tone: "enthusiastic" });
  m.bot.mockResolvedValue({ merchantId: 20, tone: "enthusiastic" });
  m.settings.mockResolvedValue({ merchantId: 20, tone: "friendly" });
});
describe("mounted personality compatibility and unified settings", () => {
  it.each([
    ["owner", true],
    ["manager", true],
    ["viewer", false],
    ["sales_supervisor", false],
  ])(
    "reports %s management capability from verified membership",
    async (role, canManage) => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      expect(await caller().botSettings.get()).toMatchObject({
        merchantId: 20,
        canManage,
      });
      expect(m.settings).toHaveBeenCalledWith(20);
    }
  );
  it("uses the saved personality options and the full permitted brand voice in the prompt", () => {
    const prompt = buildSystemPrompt({
      tone: "enthusiastic",
      style: "formal_arabic",
      emojiUsage: "none",
      customInstructions: "تعليمات مميزة",
      brandVoice: "أ".repeat(1100) + " نهاية الصوت",
    });
    expect(prompt).toContain("متحمس وإيجابي");
    expect(prompt).toContain("العربية الفصحى");
    expect(prompt).toContain("لا تستخدم الإيموجي");
    expect(prompt).toContain("تعليمات مميزة");
    expect(prompt).toContain("نهاية الصوت");
  });
  it.each(["owner", "manager"])(
    "lets %s save the selected tenant only",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await caller().personality.update({ tone: "enthusiastic" });
      expect(m.update).toHaveBeenCalledWith(20, { tone: "enthusiastic" });
    }
  );
  it.each(["viewer", "sales_supervisor", "agent"])(
    "blocks %s writes before storage",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await expect(
        caller().personality.update({ brandVoice: "change" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(m.update).not.toHaveBeenCalled();
    }
  );
  it("rejects revoked membership before reading another tenant", async () => {
    m.access.mockResolvedValue(null);
    await expect(caller().personality.get()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    { brandVoice: "x".repeat(2001) },
    { customInstructions: "x".repeat(2001) },
    { merchantId: 99 },
    { style: "unknown" },
  ])("validates legacy fields %j", async input => {
    await expect(
      caller().personality.update(input as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("preserves enthusiastic tone and all new fields through the modern endpoint", async () => {
    const patch = {
      tone: "enthusiastic" as const,
      style: "formal_arabic" as const,
      emojiUsage: "none" as const,
      brandVoice: "brand",
      personalityInstructions: "personality",
      customInstructions: "operating",
    };
    await caller().botSettings.update(patch);
    expect(m.bot).toHaveBeenCalledWith(20, patch);
  });
  it("returns a safe error when the legacy write fails", async () => {
    m.update.mockRejectedValue(Error("password=secret"));
    await expect(
      caller().personality.update({ brandVoice: "x" })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to save personality settings",
    });
  });
  it("merges personality fields independently and preserves the fourth tone at runtime", () => {
    const base = assistantSettingsDraft({}),
      mine = { ...base, brandVoice: "mine", personalityInstructions: "mine" },
      latest = { ...base, brandVoice: "remote", emojiUsage: "none" as const };
    expect(compareAssistantDraft(base, mine, latest)).toMatchObject({
      conflicts: ["brandVoice"],
      merged: { emojiUsage: "none", personalityInstructions: "mine" },
    });
    expect(effectiveAssistantTone("friendly", "enthusiastic")).toBe(
      "enthusiastic"
    );
    expect(effectiveAssistantTone("professional", "friendly")).toBe(
      "professional"
    );
  });
});
