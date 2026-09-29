import { describe, expect, it } from "vitest";
import { virtualTeamRevision } from "./virtual-team-version";
import { compareAgentDraft } from "../shared/virtual-agent-review";
import { emptyVirtualAgent } from "../shared/virtual-agent-form";

describe("virtual team review", () => {
  const base = {
    ...emptyVirtualAgent,
    name: "Sara",
    role: "Support",
    triggerKeywords: ["help"],
  };
  it("merges disjoint edits and retains explicit conflicts without silently choosing the saved value", () => {
    const draft = { ...base, name: "My name", triggerKeywords: ["my keyword"] };
    const latest = {
      ...base,
      role: "Sales",
      name: "Saved name",
      triggerKeywords: ["saved keyword"],
    };
    expect(compareAgentDraft(base, draft, latest)).toMatchObject({
      merged: {
        name: "My name",
        role: "Sales",
        triggerKeywords: ["my keyword"],
      },
      conflicts: ["name", "triggerKeywords"],
      changed: ["name", "role", "triggerKeywords"],
    });
  });
  it("does not conflict when both windows made the same change", () => {
    const latest = { ...base, triggerKeywords: ["same"] };
    expect(compareAgentDraft(base, latest, latest).conflicts).toEqual([]);
  });
  it("does not mutate any input or confuse false with an untouched boolean", () => {
    const latest = { ...base, isDefault: true, isActive: false };
    const result = compareAgentDraft(
      base,
      { ...base, role: "Changed" },
      latest
    );
    expect(result.merged).toMatchObject({
      isDefault: true,
      isActive: false,
      role: "Changed",
    });
    expect(base.role).toBe("Support");
    expect(latest.role).toBe("Support");
  });
  it("ignores timestamps and row fetch order but binds tenant, priority and every persisted field", () => {
    const a: any = {
      ...base,
      id: 1,
      sortOrder: 0,
      triggerIntents: "[]",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const b: any = { ...a, id: 2, name: "Nora", sortOrder: 1 };
    const revision = virtualTeamRevision(20, [a, b]);
    expect(virtualTeamRevision(20, [{ ...b, updatedAt: new Date() }, a])).toBe(
      revision
    );
    expect(virtualTeamRevision(21, [a, b])).not.toBe(revision);
    for (const [field, value] of Object.entries({
      name: "Other",
      role: "Other",
      department: "Other",
      personalityPrompt: "Other",
      tone: "casual",
      avatarEmoji: "sales",
      isDefault: true,
      isActive: false,
      triggerKeywords: "new",
      triggerIntents: "new",
      shiftStart: "09:00",
      shiftEnd: "17:00",
      sortOrder: 4,
    }))
      expect(
        virtualTeamRevision(20, [{ ...a, [field]: value }, b]),
        field
      ).not.toBe(revision);
    expect(virtualTeamRevision(20, [a])).not.toBe(revision);
  });
});
