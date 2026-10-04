import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  update: vi.fn(),
  settings: vi.fn(),
  integration: vi.fn(),
}));
vi.mock("./db", () => ({
  getGoogleIntegration: m.integration,
  getGoogleOAuthSettings: m.settings,
  updateGoogleIntegration: vi.fn(),
}));
vi.mock("./_core/google-api-clients", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    sheets: () => ({ spreadsheets: { values: { update: m.update } } }),
  },
}));
import { writeToSheet } from "./_core/googleSheets";
beforeEach(() => {
  vi.resetAllMocks();
  m.settings.mockResolvedValue({
    clientId: "local",
    clientSecret: "local",
    isEnabled: 1,
  });
  m.integration.mockResolvedValue({
    id: 8,
    credentials: '{"access_token":"local"}',
  });
  m.update.mockResolvedValue({ data: {} });
});
it("writes untrusted report cells literally when RAW is requested", async () => {
  expect(
    await writeToSheet(
      7,
      "local",
      "A1",
      [['=IMPORTXML("https://example.test")']],
      { raw: true }
    )
  ).toMatchObject({ success: true });
  expect(m.update.mock.calls[0][0].valueInputOption).toBe("RAW");
});
it("preserves existing callers that have not opted into literal writing", async () => {
  await writeToSheet(7, "local", "A1", [["1"]]);
  expect(m.update.mock.calls[0][0].valueInputOption).toBe("USER_ENTERED");
});
it("redacts provider errors from the literal writer result and logs", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    m.update.mockRejectedValue(Error("PRIVATE_TOKEN"));
    const result = await writeToSheet(7, "local", "A1", [["1"]], { raw: true });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TOKEN");
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_TOKEN");
  } finally {
    log.mockRestore();
  }
});
