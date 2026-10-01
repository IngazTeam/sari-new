import { describe, expect, it } from "vitest";
import { emptyVirtualAgent } from "../shared/virtual-agent-form";
import { virtualTeamSaveInput } from "../shared/virtual-team-save";

const input = {
  merchantId: 7,
  requestId: "30000000-0000-4000-8000-000000000001",
  editing: null,
  expectedRevision: "a".repeat(64),
  draft: {
    ...emptyVirtualAgent,
    name: " سارة ",
    role: " دعم ",
    personalityPrompt: " ساعد العميل ",
    triggerKeywords: [" سعر ", "سعر"],
  },
};
describe("reviewed persona save contract", () => {
  it("normalizes a complete draft without dropping routing fields", () => {
    expect(virtualTeamSaveInput.parse(input).draft).toEqual({
      ...input.draft,
      name: "سارة",
      role: "دعم",
      personalityPrompt: "ساعد العميل",
      triggerKeywords: ["سعر"],
    });
  });
  it.each([
    { merchantId: 0 },
    { merchantId: 2147483648 },
    { editing: -1 },
    { requestId: "unsafe" },
    { expectedRevision: "stale" },
    { extra: true },
  ])("rejects an invalid identity or revision %j", change => {
    expect(
      virtualTeamSaveInput.safeParse({ ...input, ...change }).success
    ).toBe(false);
  });
  it.each([
    { name: " " },
    { shiftStart: "12:00" },
    { shiftStart: "12:00", shiftEnd: "12:00" },
    { shiftStart: "24:00", shiftEnd: "06:00" },
    { triggerKeywords: ["x".repeat(1999)] },
    { triggerIntents: [] },
  ])("rejects an invalid or unknown form field %j", change => {
    expect(
      virtualTeamSaveInput.safeParse({
        ...input,
        draft: { ...input.draft, ...change },
      }).success
    ).toBe(false);
  });
  it("accepts overnight routing and explicit inactive creation", () => {
    expect(
      virtualTeamSaveInput.parse({
        ...input,
        draft: {
          ...input.draft,
          isActive: false,
          shiftStart: "22:00",
          shiftEnd: "06:00",
        },
      }).draft.isActive
    ).toBe(false);
  });
});
