import { describe, expect, it } from "vitest";
import { botSettingsFormRevision } from "./bot-settings-version";
describe("assistant form revision", () => {
  it("includes tenant and every form field, normalizes boolean storage and excludes independent sales policy", () => {
    const initial = {
      merchantId: 20,
      autoReplyEnabled: 1,
      workingHoursEnabled: 0,
      welcomeMessage: "saved",
      autoDiscountEnabled: 0,
    };
    const revision = botSettingsFormRevision(initial);
    expect(
      botSettingsFormRevision({
        ...initial,
        autoReplyEnabled: true,
        workingHoursEnabled: false,
      })
    ).toBe(revision);
    expect(
      botSettingsFormRevision({
        ...initial,
        autoDiscountEnabled: 1,
        autoDiscountRevision: 9,
      })
    ).toBe(revision);
    expect(botSettingsFormRevision({ ...initial, merchantId: 21 })).not.toBe(
      revision
    );
    expect(
      botSettingsFormRevision({ ...initial, welcomeMessage: "changed" })
    ).not.toBe(revision);
    expect(
      botSettingsFormRevision({ ...initial, groupKeywords: '["سعر"]' })
    ).not.toBe(revision);
  });
});
