import { afterEach, describe, expect, it, vi } from "vitest";

const connectorMock = vi.hoisted(() => ({
  getActive: vi.fn(),
}));

vi.mock("../integrations/zahypi-connector/repository", () => ({
  getActiveConnectorCredential: connectorMock.getActive,
}));

import { getZahyPiRuntimeConfig } from "../db_ai_settings";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  connectorMock.getActive.mockReset();
});

describe("getZahyPiRuntimeConfig connector precedence", () => {
  it("uses the active one-click credential before database and environment settings", async () => {
    process.env.ZAHYPI_API_KEY = "environment-key-that-must-not-win";
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKeyPrefix: "zk_sari_",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
      activatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });

    await expect(getZahyPiRuntimeConfig()).resolves.toMatchObject({
      provider: "zahypi",
      apiKey: "zk_sari_connector_key",
      baseUrl: "https://connector.zahypi.test/v1",
      projectId: "sari",
      model: "qwen-local",
      source: "connector",
      generation: 4,
      taskTypesHash: "a".repeat(64),
    });
  });

  it("fails closed when the active connector credential cannot be decrypted", async () => {
    connectorMock.getActive.mockRejectedValue(new Error("Unable to decrypt stored credential"));

    await expect(getZahyPiRuntimeConfig()).rejects.toThrow(
      "Unable to decrypt stored credential",
    );
  });
});
