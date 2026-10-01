import { describe, it, expect } from "vitest";
import { AssistantSettingsPreviewModel } from "../prototypes/tenant-dashboard/src/assistant-settings-preview-model";
const memory = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    map,
  };
};
const payload = (
  model: AssistantSettingsPreviewModel,
  patch: Record<string, unknown> = {}
) => {
  const { merchantId, canManage, formRevision, ...draft } = model.settings();
  return { ...draft, ...patch, expectedRevision: formRevision };
};
describe("actual assistant settings prototype model", () => {
  it("persists every editable setting separately from policy authority and across reload", async () => {
    const storage = memory(),
      model = new AssistantSettingsPreviewModel(181, storage),
      discount = model.policy("discount"),
      margin = model.policy("margin");
    const patch = {
      autoReplyEnabled: false,
      tone: "enthusiastic",
      style: "formal_arabic",
      emojiUsage: "none",
      language: "fr",
      responseDelay: 4,
      brandVoice: "brand",
      personalityInstructions: "personality",
      customInstructions: "operations",
      groupMode: "keyword_only",
      groupKeywords: '["sales","help"]',
      groupRedirectMessage: "private",
      workingHoursEnabled: true,
      workingHoursStart: "22:00",
      workingHoursEnd: "02:00",
      workingDays: "",
    };
    await model.save(payload(model, patch));
    const restored = new AssistantSettingsPreviewModel(181, storage);
    expect(restored.settings()).toMatchObject(patch);
    expect(restored.policy("discount")).toEqual(discount);
    expect(restored.policy("margin")).toEqual(margin);
    expect(
      new AssistantSettingsPreviewModel(182, storage).settings().brandVoice
    ).toBe("");
  });
  it.each([
    { workingHoursEnabled: true, workingHoursEnd: "09:00" },
    { responseDelay: null },
    { responseDelay: 20 },
    { maxResponseLength: NaN },
    { autoDiscountEnabled: true },
    { takeoverTimeoutMinutes: 15 },
  ])("rejects invalid or unrelated settings: %j", async patch => {
    const model = new AssistantSettingsPreviewModel(181, memory());
    await expect(model.save(payload(model, patch))).rejects.toBeTruthy();
    expect(model.writes).toBe(0);
  });
  it("requires a new review after conflict and retains unrelated concurrent fields", async () => {
    const model = new AssistantSettingsPreviewModel(181, memory());
    model.reset("conflict");
    const input = payload(model, { welcomeMessage: "mine" });
    await expect(model.save(input)).rejects.toMatchObject({
      data: { code: "CONFLICT" },
    });
    const latest = await model.review();
    expect(latest.data).toMatchObject({
      brandVoice: "تعديل من زميل · Another editor",
      language: "en",
    });
    await model.save(payload(model, { welcomeMessage: "mine" }));
    expect(model.settings()).toMatchObject({
      welcomeMessage: "mine",
      language: "en",
    });
  });
  it.each(["offline-before", "lost-after"] as const)(
    "distinguishes durable changes for %s",
    async mode => {
      const storage = memory(),
        model = new AssistantSettingsPreviewModel(181, storage);
      model.reset(mode);
      await expect(
        model.save(payload(model, { welcomeMessage: "attempt" }))
      ).rejects.toBeTruthy();
      expect(
        new AssistantSettingsPreviewModel(181, storage).settings()
          .welcomeMessage
      ).toBe(mode === "lost-after" ? "attempt" : "مرحبًا بك · Welcome");
    }
  );
  it("returns foreign evidence only in the rejection scenario", async () => {
    const model = new AssistantSettingsPreviewModel(181, memory());
    model.reset("foreign-result");
    expect((await model.save(payload(model))).merchantId).toBe(281);
    expect(model.settings().merchantId).toBe(181);
  });
  it("keeps stale review data explicitly failed after a lost response", async () => {
    const model = new AssistantSettingsPreviewModel(181, memory());
    model.reset("review-error");
    await expect(model.save(payload(model))).rejects.toBeTruthy();
    expect(await model.review()).toMatchObject({
      isError: true,
      error: expect.any(Error),
    });
  });
  it.each(["discount", "margin"] as const)(
    "requires reviewed scoped policy proof for %s and stores only that policy",
    async kind => {
      const storage = memory(),
        model = new AssistantSettingsPreviewModel(181, storage),
        before = model.policy(kind),
        settings = model.settings();
      const policy =
        kind === "discount"
          ? { enabled: true, maxPercent: 25, expireHours: 72 }
          : { enabled: true, minPercent: 30 };
      const input = {
        policy,
        expectedRevision: before.revision,
        evidence: before.evidence,
        reviewed: true,
      };
      await expect(
        model.savePolicy(kind, { ...input, reviewed: false })
      ).rejects.toBeTruthy();
      await expect(
        new AssistantSettingsPreviewModel(182, storage).savePolicy(kind, input)
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      await model.savePolicy(kind, input);
      expect(model.settings()).toEqual(settings);
      expect(model.policy(kind)).toMatchObject({
        policy,
        revision: 2,
        history: [{ beforePolicy: before.policy, afterPolicy: policy }],
      });
      expect(
        new AssistantSettingsPreviewModel(181, storage).policy(kind).policy
      ).toEqual(policy);
      await expect(model.savePolicy(kind, input)).rejects.toMatchObject({
        data: { code: "CONFLICT" },
      });
    }
  );
  it("blocks all writes and previews in read-only mode", async () => {
    const model = new AssistantSettingsPreviewModel(181, memory());
    model.reset("viewer");
    await expect(model.save(payload(model))).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    await expect(model.preview({ message: "hello" })).rejects.toBeTruthy();
    await expect(model.sendTest()).rejects.toBeTruthy();
    expect(model.previews + model.sends).toBe(0);
  });
  it("does not overwrite corrupt or foreign stored data", () => {
    const storage = memory();
    storage.setItem("sary:assistant-settings-preview:181:181", "broken");
    const model = new AssistantSettingsPreviewModel(181, storage);
    expect(() => model.settings()).toThrow();
    expect(storage.getItem("sary:assistant-settings-preview:181:181")).toBe(
      "broken"
    );
    model.reset("normal");
    expect(model.storageError).toBe(false);
    const raw = storage.getItem("sary:assistant-settings-preview:181:181")!;
    storage.setItem("sary:assistant-settings-preview:181:182", raw);
    expect(() =>
      new AssistantSettingsPreviewModel(182, storage).settings()
    ).toThrow();
  });
  it("never claims an AI or WhatsApp result and retains the original question safely", async () => {
    const model = new AssistantSettingsPreviewModel(181, memory()),
      message = "<img src=x onerror=alert(1)>";
    expect(await model.preview({ message })).toMatchObject({
      source: "guardrail",
      response: expect.stringContaining(message),
    });
    expect((await model.sendTest()).message).toContain(
      "no WhatsApp message sent"
    );
    model.reset("preview-error");
    await expect(model.preview({ message })).rejects.toBeTruthy();
    model.reset("send-error");
    await expect(model.sendTest()).rejects.toBeTruthy();
  });
  it("reports saved schedule restrictions and timestamp without a connection claim", async () => {
    const model = new AssistantSettingsPreviewModel(181, memory());
    expect(model.status().shouldRespond).toBe(true);
    await model.save(payload(model, { autoReplyEnabled: false }));
    expect(model.status().reason).toBe("Auto-reply is disabled");
    await model.save(
      payload(model, {
        autoReplyEnabled: true,
        workingHoursEnabled: true,
        workingDays: "",
      })
    );
    expect(model.status().shouldRespond).toBe(false);
    expect(Number.isFinite(Date.parse(model.status().checkedAt))).toBe(true);
    model.reset("status-error");
    expect(() => model.status()).toThrow();
    await model.refreshStatus();
    expect(model.status().shouldRespond).toBe(true);
  });
  it("recovers explicit read failures without writing settings", async () => {
    const model = new AssistantSettingsPreviewModel(181, memory());
    model.reset("load-error");
    expect(() => model.settings()).toThrow();
    expect(await model.review()).toMatchObject({ isError: false });
    model.reset("policy-load-error");
    expect(() => model.policy("discount")).toThrow();
    expect(await model.reviewPolicy("discount")).toMatchObject({
      isError: false,
    });
    expect(model.writes).toBe(0);
  });
});
