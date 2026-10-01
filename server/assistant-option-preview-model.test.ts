import { describe, expect, it } from "vitest";
import {
  AssistantOptionPreviewModel,
  optionModes,
} from "../prototypes/tenant-dashboard/src/assistant-option-preview-model";
const setup = () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  return {
    values,
    storage,
    model: new AssistantOptionPreviewModel(177, storage),
  };
};
const language = (model: AssistantOptionPreviewModel, value = "fr") => ({
  kind: "language",
  language: value,
  expectedRevision: model.settings().optionRevisions.language,
});
describe("actual assistant option preview model", () => {
  it("retains settings across reloads and isolates tenants and independently saved option groups", async () => {
    const { model, storage } = setup();
    const base = model.settings();
    await model.save(language(model));
    const next = new AssistantOptionPreviewModel(177, storage).settings();
    expect(next.language).toBe("fr");
    expect(next.optionRevisions.takeover).toBe(base.optionRevisions.takeover);
    expect(
      new AssistantOptionPreviewModel(178, storage).settings().language
    ).toBe("ar");
    await model.save({
      kind: "takeover",
      expectedRevision: next.optionRevisions.takeover,
      draft: { takeoverTimeoutMinutes: 120, takeoverCommandsEnabled: false },
    });
    expect(model.settings()).toMatchObject({
      language: "fr",
      takeoverTimeoutMinutes: 120,
      takeoverCommandsEnabled: false,
    });
  });
  it.each(["ar", "en", "fr", "tr", "es", "it", "both"])(
    "supports the real language choice %s",
    async code => {
      const { model } = setup();
      await model.save(language(model, code));
      expect(model.settings().language).toBe(code);
    }
  );
  it("rejects invalid duration, unsupported language and read-only writes", async () => {
    const { model } = setup();
    await expect(model.save(language(model, "invalid"))).rejects.toThrow();
    await expect(
      model.save({
        kind: "takeover",
        expectedRevision: model.settings().optionRevisions.takeover,
        draft: { takeoverTimeoutMinutes: 5.5, takeoverCommandsEnabled: false },
      })
    ).rejects.toThrow();
    model.reset("viewer");
    await expect(model.save(language(model))).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    expect(model.settings().language).toBe("ar");
  });
  it("reports a conflict and requires a newly reviewed revision", async () => {
    const { model } = setup();
    model.reset("conflict");
    const input = language(model);
    await expect(model.save(input)).rejects.toMatchObject({
      data: { code: "CONFLICT" },
    });
    expect(model.settings().language).toBe("en");
    await expect(model.save(input)).rejects.toMatchObject({
      data: { code: "CONFLICT" },
    });
    const current = await model.review();
    expect(current.data?.language).toBe("en");
    await model.save(language(model));
    expect(model.settings().language).toBe("fr");
  });
  it("distinguishes interruption before persistence from a lost acknowledgement after persistence", async () => {
    const { model, storage } = setup();
    model.reset("offline-before");
    await expect(model.save(language(model))).rejects.toBeDefined();
    expect(
      new AssistantOptionPreviewModel(177, storage).settings().language
    ).toBe("ar");
    model.reset("lost-after");
    await expect(model.save(language(model))).rejects.toBeDefined();
    const recovered = new AssistantOptionPreviewModel(177, storage);
    expect((await recovered.review()).data?.language).toBe("fr");
    expect(recovered.writes).toBe(0);
  });
  it("returns stale data with an error for a failed review, rather than claiming current truth", async () => {
    const { model } = setup();
    model.reset("review-error");
    await expect(model.save(language(model))).rejects.toBeDefined();
    const response = await model.review();
    expect(response.error).toBeDefined();
    expect(response.data?.language).toBe("fr");
  });
  it("exposes wrong-store results without treating them as the current tenant", async () => {
    const { model } = setup();
    model.reset("foreign-result");
    const result = await model.save(language(model));
    expect(result.merchantId).not.toBe(model.merchantId);
    expect(model.settings().merchantId).toBe(177);
  });
  it("paginates twelve conversations and includes permanent, timed, expired, unknown and manual states", () => {
    const { model } = setup();
    const first = model.listing(1),
      second = model.listing(2);
    expect(first.rows).toHaveLength(10);
    expect(second.rows).toHaveLength(2);
    expect(first.total).toBe(12);
    expect(
      new Set([...first.rows, ...second.rows].map(row => row.id)).size
    ).toBe(12);
    expect(
      first.rows
        .slice(0, 5)
        .map(row => [row.permanentSilence, row.humanExpiresAt === null])
    ).toEqual([
      [true, true],
      [false, false],
      [false, false],
      [false, false],
      [false, true],
    ]);
    model.reset("empty");
    expect(model.listing(1)).toMatchObject({ rows: [], total: 0 });
    model.reset("list-error");
    expect(() => model.listing(1)).toThrow();
  });
  it("fails closed on corrupt stored data until an explicit reset", () => {
    const { model, storage, values } = setup();
    model.reset("normal");
    values.set("sary:assistant-options-preview:177:177", "bad JSON");
    const corrupt = new AssistantOptionPreviewModel(177, storage);
    expect(() => corrupt.settings()).toThrow();
    corrupt.reset("normal");
    expect(corrupt.settings().language).toBe("ar");
  });
  it("has ten reviewable states and recovers a failed initial read explicitly", async () => {
    expect(optionModes).toHaveLength(10);
    const { model } = setup();
    model.reset("load-error");
    expect(() => model.settings()).toThrow();
    expect((await model.review()).data?.language).toBe("ar");
  });
});
