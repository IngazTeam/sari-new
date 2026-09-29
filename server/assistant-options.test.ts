import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantOptionInput,
  takeoverDraft,
  takeoverExpiry,
} from "../shared/assistant-options";
import { assistantOptionRevision } from "./bot-settings-version";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  updateBotSettings: m.write,
}));
vi.mock("./takeover-workspace", () => ({ readTakeoverWorkspace: m.read }));
import { botSettingsRouter } from "./routers-bot-settings";
import { AssistantSettingsConflictError } from "./bot-settings-version";
const caller = () =>
  botSettingsRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
const revision = "a".repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 3 });
  m.write.mockResolvedValue({
    merchantId: 20,
    language: "both",
    takeoverTimeoutMinutes: 90,
    takeoverCommandsEnabled: 0,
  });
  m.read.mockResolvedValue({ rows: [], total: 0 });
});
describe("reviewed assistant option boundary", () => {
  it("writes only the selected option with the tenant and version from verified scope", async () => {
    const result = await caller().updateOption({
      kind: "language",
      language: "both",
      expectedRevision: revision,
    });
    expect(result.optionRevisions.language).toMatch(/^[a-f0-9]{64}$/);
    expect(m.write).toHaveBeenLastCalledWith(
      20,
      { language: "both" },
      { option: "language", expectedOptionRevision: revision }
    );
    await caller().updateOption({
      kind: "takeover",
      draft: { takeoverTimeoutMinutes: 90, takeoverCommandsEnabled: false },
      expectedRevision: revision,
    });
    expect(m.write).toHaveBeenLastCalledWith(
      20,
      { takeoverTimeoutMinutes: 90, takeoverCommandsEnabled: false },
      { option: "takeover", expectedOptionRevision: revision }
    );
  });
  it.each(["viewer", "sales_supervisor"])(
    "prevents %s from modifying either option",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      for (const input of [
        { kind: "language", language: "en", expectedRevision: revision },
        {
          kind: "takeover",
          expectedRevision: revision,
          draft: { takeoverTimeoutMinutes: 30, takeoverCommandsEnabled: false },
        },
      ])
        await expect(caller().updateOption(input as any)).rejects.toMatchObject(
          { code: "FORBIDDEN" }
        );
      expect(m.write).not.toHaveBeenCalled();
    }
  );
  it.each([
    { merchantId: 30 },
    { expectedRevision: "" },
    { language: "unknown" },
    { takeoverResumeMessage: "send" },
    { autoReplyEnabled: true },
  ])("rejects forged or additional fields %j", async attack => {
    await expect(
      caller().updateOption({
        kind: "language",
        language: "ar",
        expectedRevision: revision,
        ...attack,
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each([4, 121, 5.5, NaN, "30"])("rejects invalid timeout %s", value =>
    expect(
      assistantOptionInput.safeParse({
        kind: "takeover",
        expectedRevision: revision,
        draft: { takeoverTimeoutMinutes: value, takeoverCommandsEnabled: true },
      }).success
    ).toBe(false)
  );
  it("reports conflicts and hides private failure details", async () => {
    m.write.mockRejectedValueOnce(new AssistantSettingsConflictError());
    await expect(
      caller().updateOption({
        kind: "language",
        language: "en",
        expectedRevision: revision,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    m.write.mockRejectedValueOnce(Error("SQL private"));
    await expect(
      caller().updateOption({
        kind: "language",
        language: "en",
        expectedRevision: revision,
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to save assistant option",
    });
    m.read.mockRejectedValueOnce(Error("DB private"));
    await expect(caller().takeoverWorkspace({ page: 1 })).rejects.toMatchObject(
      {
        code: "INTERNAL_SERVER_ERROR",
        message: "Takeover conversations unavailable",
      }
    );
  });
  it("scopes pagination and rejects revoked membership before reading", async () => {
    await caller().takeoverWorkspace({ page: 2 });
    expect(m.read).toHaveBeenCalledWith(20, 2);
    m.access.mockResolvedValue(null);
    await expect(caller().takeoverWorkspace({ page: 1 })).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    expect(m.read).toHaveBeenCalledTimes(1);
  });
});
describe("option versions and takeover status", () => {
  it("separates fields and tenants while normalizing persisted flags", () => {
    const a = {
      merchantId: 1,
      language: "ar",
      takeoverTimeoutMinutes: 90,
      takeoverCommandsEnabled: 0,
    };
    expect(takeoverDraft(a)).toEqual({
      takeoverTimeoutMinutes: 90,
      takeoverCommandsEnabled: false,
    });
    expect(assistantOptionRevision(a, "takeover")).toBe(
      assistantOptionRevision(
        { ...a, language: "en", takeoverCommandsEnabled: false },
        "takeover"
      )
    );
    expect(assistantOptionRevision(a, "language")).toBe(
      assistantOptionRevision({ ...a, takeoverTimeoutMinutes: 60 }, "language")
    );
    expect(assistantOptionRevision(a, "language")).not.toBe(
      assistantOptionRevision({ ...a, merchantId: 2 }, "language")
    );
  });
  it("parses MySQL UTC consistently and separates expired, unknown and manual states", () => {
    const now = Date.parse("2026-09-29T10:00:00Z");
    expect(takeoverExpiry("2026-09-29 10:01:01", now)).toEqual({
      state: "timed",
      minutes: 2,
    });
    expect(takeoverExpiry("2026-09-29T13:01:01+03:00", now)).toEqual({
      state: "timed",
      minutes: 2,
    });
    expect(takeoverExpiry("2026-09-29 09:59:00", now).state).toBe("waiting");
    expect(takeoverExpiry("malformed", now).state).toBe("unknown");
    expect(takeoverExpiry(null, now).state).toBe("manual");
  });
});
