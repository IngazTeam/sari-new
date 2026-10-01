import { randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import { emptyVirtualAgent } from "../shared/virtual-agent-form";
import { PersonaPreviewModel } from "../prototypes/tenant-dashboard/src/persona-preview-model";
let storage: Pick<Storage, "getItem" | "setItem">, model: PersonaPreviewModel;
beforeEach(() => {
  const values = new Map<string, string>();
  storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  model = new PersonaPreviewModel(174, storage);
});
const input = (editing: number | null = null) => ({
  merchantId: 174,
  requestId: randomUUID(),
  editing,
  expectedRevision: model.revision(),
  draft: {
    ...emptyVirtualAgent,
    name: "Test",
    role: "Sales",
    personalityPrompt: "Approved knowledge",
    isDefault: true,
  },
});
it("recovers an acknowledged-lost save across reload without duplicating creation", async () => {
  model.reset("lost-after");
  const request = input();
  await expect(model.save(request)).rejects.toMatchObject({
    data: { code: "INTERNAL_SERVER_ERROR" },
  });
  expect(model.list().agents).toHaveLength(3);
  const fresh = new PersonaPreviewModel(174, storage);
  const receipt = await fresh.receipt(request);
  expect(receipt?.personaId).toBe(3);
  expect(await fresh.save(request)).toEqual(receipt);
  expect(fresh.list().agents).toHaveLength(3);
});
it("retries the unchanged request after a failure before save", async () => {
  model.reset("offline-before");
  const request = input();
  await expect(model.save(request)).rejects.toBeTruthy();
  expect(await model.receipt(request)).toBeNull();
  expect(model.list().agents).toHaveLength(2);
  expect((await model.save(request)).operation).toBe("create");
  expect(model.list().agents).toHaveLength(3);
});
it("requires explicit review after conflict and then allows the separately reviewed save", async () => {
  model.reset("conflict");
  const request = input(1);
  await expect(model.save(request)).rejects.toMatchObject({
    data: { code: "CONFLICT" },
  });
  expect(model.list().agents[0].name).toBe("اسم من نافذة أخرى");
  await model.save(input(1));
  expect(model.list().agents[0].name).toBe("Test");
});
it("preserves hidden intents, validates ordering, and clears shifts through a full draft", async () => {
  await model.save(input(1));
  expect(model.list().agents[0].triggerIntents).toBe('["greeting"]');
  await model.action("reorder", {
    expectedRevision: model.revision(),
    orderedIds: [2, 1],
  });
  expect(model.list().agents.map(a => a.id)).toEqual([2, 1]);
  await expect(
    model.action("reorder", {
      expectedRevision: model.revision(),
      orderedIds: [1, 1],
    })
  ).rejects.toBeTruthy();
  await model.save(input(2));
  expect(model.list().agents[0]).toMatchObject({
    shiftStart: "",
    shiftEnd: "",
  });
  expect(model.list().agents.filter(a => a.isDefault)).toHaveLength(1);
});
it("keeps receipts after deletion and isolates the second tenant", async () => {
  const request = input(),
    result = await model.save(request);
  await model.action("delete", {
    expectedRevision: model.revision(),
    id: result.personaId,
  });
  expect(await model.receipt(request)).toEqual(result);
  expect(await model.save(request)).toEqual(result);
  expect(model.list().agents).toHaveLength(2);
  const other = new PersonaPreviewModel(175, storage);
  await expect(other.receipt(request)).rejects.toMatchObject({
    data: { code: "FORBIDDEN" },
  });
  await expect(other.save(request)).rejects.toMatchObject({
    data: { code: "FORBIDDEN" },
  });
});
it("covers empty templates, the limit, and read-only permissions", async () => {
  model.reset("empty");
  expect(model.list().agents).toHaveLength(0);
  await model.action("seedTemplates", { expectedRevision: model.revision() });
  expect(model.list().agents).toHaveLength(2);
  model.reset("limit");
  await expect(model.save(input())).rejects.toMatchObject({
    data: { code: "BAD_REQUEST" },
  });
  model.reset("viewer");
  expect(model.list().canManage).toBe(false);
  await expect(model.save(input())).rejects.toMatchObject({
    data: { code: "FORBIDDEN" },
  });
});
it("exposes read failure and foreign receipt scenarios without claiming a valid result", async () => {
  for (const mode of ["receipt-failed", "foreign-receipt"] as const) {
    model.reset(mode);
    const request = input();
    await expect(model.save(request)).rejects.toBeTruthy();
    if (mode === "receipt-failed")
      await expect(model.receipt(request)).rejects.toBeTruthy();
    else expect((await model.receipt(request))?.merchantId).toBe(999);
  }
});
it("fails closed on corrupt storage and does not overwrite it until reset", () => {
  storage.setItem("sary:persona-preview:174:174", "broken");
  const damaged = new PersonaPreviewModel(174, storage);
  expect(() => damaged.list()).toThrow();
  expect(storage.getItem("sary:persona-preview:174:174")).toBe("broken");
  damaged.reset();
  expect(damaged.list().agents).toHaveLength(2);
});
it("does not claim a saved fixture when browser storage fails", async () => {
  storage.setItem = () => {
    throw Error("quota");
  };
  await expect(model.save(input())).rejects.toThrow("quota");
  expect(model.list().agents).toHaveLength(2);
});
