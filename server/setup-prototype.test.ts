import { describe, it, expect } from "vitest";
import {
  SetupModel,
  setupFixture,
  setupScope,
} from "../prototypes/tenant-dashboard/src/setup-model";
import {
  setupFieldsFromDraft,
  checkedSetupReceipt,
} from "../client/src/lib/setup-completion-workspace";
import {
  buildSetupWebsitePreview,
  setupWebsitePatch,
} from "../client/src/lib/setup-website-draft";
import { setupTemplatePatch } from "../shared/setup-template";
const requestId = "00000148-1111-4111-8111-111111111111";
const fields = () => setupFieldsFromDraft(setupFixture());
async function request(model: SetupModel) {
  const review = await model.review({ fields: fields() });
  return {
    fields: review.fields,
    expectedDigest: review.digest,
    requestId,
    reviewed: true as const,
  };
}
describe("actual wizard prototype source", () => {
  it("never completes during review", async () => {
    const model = new SetupModel();
    expect((await model.review({ fields: fields() })).canComplete).toBe(true);
    expect(model.read().isCompleted).toBe(0);
    expect(await model.recover({ requestId })).toBeNull();
  });
  it("produces the actual checked receipt without major/minor conversion drift", async () => {
    const model = new SetupModel(),
      input = await request(model);
    const receipt = await model.complete(input);
    expect(
      checkedSetupReceipt(receipt, { ...setupScope, input })
    ).toMatchObject({
      products: [{ priceMinor: 4950 }],
      services: [{ priceMinor: 2500, durationMinutes: 45 }],
    });
  });
  it("recovers a lost completion response and retries idempotently", async () => {
    const model = new SetupModel(),
      input = await request(model);
    model.setMode("completeLost");
    await expect(model.complete(input)).rejects.toThrow();
    const receipt = await model.recover({ requestId });
    expect(receipt?.requestId).toBe(requestId);
    expect(await model.complete(input)).toEqual(receipt);
    await expect(
      model.complete({
        ...input,
        fields: { ...input.fields, businessName: "changed" },
      })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
  it("does not complete when the mutation fails before writing", async () => {
    const model = new SetupModel(),
      input = await request(model);
    model.setMode("completeError");
    await expect(model.complete(input)).rejects.toThrow();
    expect(await model.recover({ requestId })).toBeNull();
    expect(model.read().isCompleted).toBe(0);
    model.setMode("normal");
    await expect(model.complete(input)).resolves.toHaveProperty(
      "requestId",
      requestId
    );
  });
  it("does not approve a changed remote draft", async () => {
    const model = new SetupModel(),
      input = await request(model);
    model.remoteEdit();
    await expect(model.complete(input)).rejects.toMatchObject({
      data: { code: "CONFLICT" },
    });
  });
  it.each(["duplicate", "locked", "retired"] as const)(
    "blocks %s review",
    async mode => {
      const model = new SetupModel();
      model.setMode(mode);
      const result = await model.review({
        fields: { ...fields(), templateId: 1 },
      });
      expect(result.canComplete).toBe(false);
      await expect(
        model.complete({
          fields: result.fields,
          expectedDigest: result.digest,
          requestId,
          reviewed: true,
        })
      ).rejects.toThrow();
    }
  );
  it("keeps the exact raw invalid draft available to the real field repair screen", () => {
    const model = new SetupModel();
    model.reset("invalid");
    const draft = JSON.parse(model.read().wizardData);
    expect(draft.products[0]).toMatchObject({ price: "", currency: "EUR" });
    expect(draft.welcomeMessage).toEqual({ old: "value" });
    expect(() => setupFieldsFromDraft(draft)).toThrow();
  });
  it("protects remote edits from a stale save", async () => {
    const model = new SetupModel(),
      expectedDigest = model.read().digest;
    model.remoteEdit();
    await expect(
      model.save({
        expectedDigest,
        currentStep: 3,
        completedSteps: [],
        wizardData: setupFixture(),
      })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    expect(JSON.parse(model.read().wizardData).businessName).toBe(
      "نسخة أخرى من النشاط"
    );
  });
  it("recovers identical draft saves after a lost acknowledgement", async () => {
    const model = new SetupModel(),
      input = {
        expectedDigest: model.read().digest,
        currentStep: 5,
        completedSteps: [1, 2, 3, 4],
        wizardData: { ...setupFixture(), address: "saved" },
      };
    model.setMode("saveLost");
    await expect(model.save(input)).rejects.toThrow();
    const saved = model.read();
    await expect(model.save(input)).resolves.toEqual(saved);
    expect(saved.revision).toBe(2);
  });
  it.each([
    "readError",
    "templateError",
    "reviewError",
    "websiteError",
    "websiteLimit",
    "recoveryError",
    "saveError",
  ] as const)("exposes %s and can recover", async mode => {
    const model = new SetupModel();
    model.setMode(mode);
    const run = () =>
      mode === "readError"
        ? model.read()
        : mode === "templateError"
          ? model.templates("ar")
          : mode === "reviewError"
            ? model.review({ fields: fields() })
            : mode === "recoveryError"
              ? model.recover({ requestId })
              : mode === "saveError"
                ? model.save({
                    expectedDigest: model.progress().digest,
                    currentStep: 3,
                    completedSteps: [],
                    wizardData: { ...setupFixture(), address: "new" },
                  })
                : model.website({ websiteUrl: "https://example.test" });
    await expect(Promise.resolve().then(run)).rejects.toThrow();
    model.setMode("normal");
    await expect(Promise.resolve().then(run)).resolves.toBeDefined();
  });
  it("returns a reviewed template with service duration and independent optional choices", () => {
    const model = new SetupModel(),
      template = model.template({ templateId: 1, language: "en" });
    const draft = setupFixture(),
      patch = setupTemplatePatch(draft, template, {
        catalog: "merge",
        assistant: false,
        workingHours: false,
      });
    expect((patch.services as any[])[1]).toMatchObject({
      durationMinutes: 15,
      price: "10.00",
    });
    expect(patch.botLanguage).toBeUndefined();
    expect(patch.workingHours).toBeUndefined();
    expect(model.template({ templateId: 1, language: "ar" }).title).not.toBe(
      template.title
    );
  });
  it("provides 23 website suggestions without changing the draft or treating zero as free", async () => {
    const model = new SetupModel(),
      before = model.read();
    const preview = buildSetupWebsitePreview(
      await model.website({ websiteUrl: "https://example.test" }),
      "https://example.test",
      requestId
    );
    expect(preview.products).toHaveLength(23);
    expect(preview.products[0].price).toBe("");
    expect(preview.products[1].currency).toBe("EUR");
    const patch = setupWebsitePatch(setupFixture(), preview, {
      catalog: "merge",
      productIds: [preview.products[22].id],
      profile: [],
    });
    expect(patch.products as any[]).toHaveLength(2);
    expect(patch.businessName).toBeUndefined();
    expect(model.read()).toEqual(before);
  });
  it("resets only its own in-memory data", async () => {
    const a = new SetupModel(),
      b = new SetupModel(),
      input = await request(a);
    await a.complete(input);
    a.reset("empty");
    expect(a.read().isCompleted).toBe(0);
    expect(await a.recover({ requestId })).toBeNull();
    expect(JSON.parse(a.read().wizardData).products).toEqual([]);
    expect(JSON.parse(b.read().wizardData).products).toHaveLength(1);
  });
});
