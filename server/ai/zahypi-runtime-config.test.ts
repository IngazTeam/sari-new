import { afterEach, describe, expect, it, vi } from "vitest";

const connectorMock = vi.hoisted(() => ({
  getActive: vi.fn(),
}));

const databaseMock = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("../integrations/zahypi-connector/repository", () => ({
  getActiveConnectorCredential: connectorMock.getActive,
}));

vi.mock("../db", () => ({
  getDb: databaseMock.getDb,
}));

import { getOpenAiApiKey, getZahyPiRuntimeConfig } from "../db_ai_settings";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  connectorMock.getActive.mockReset();
  databaseMock.getDb.mockReset();
});

function settingsDatabase(record?: Record<string, unknown>) {
  const limit = vi.fn().mockResolvedValue(record ? [record] : []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select };
}

describe("getZahyPiRuntimeConfig provider control", () => {
  it("uses the active one-click credential when no database provider overrides it", async () => {
    process.env.ZAHYPI_API_KEY = "environment-key-that-must-not-win";
    databaseMock.getDb.mockResolvedValue(settingsDatabase());
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
      enabled: true,
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

  it("honors an explicit OpenAI selection instead of forcing the active connector", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase({
      textGenerationProvider: "openai",
      isActive: true,
      zahyPiApiKey: null,
      zahyPiBaseUrl: null,
      zahyPiProjectId: null,
      zahyPiModel: null,
    }));
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
    });

    await expect(getZahyPiRuntimeConfig()).resolves.toMatchObject({
      enabled: true,
      provider: "openai",
      source: "database",
    });
    expect(connectorMock.getActive).not.toHaveBeenCalled();
  });

  it("can resolve the saved connector while validating a switch from OpenAI to ZahyPi", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase({
      textGenerationProvider: "openai",
      isActive: true,
      zahyPiApiKey: null,
      zahyPiBaseUrl: null,
      zahyPiProjectId: null,
      zahyPiModel: null,
    }));
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
    });

    await expect(getZahyPiRuntimeConfig({ provider: "zahypi" })).resolves.toMatchObject({
      enabled: true,
      provider: "zahypi",
      apiKey: "zk_sari_connector_key",
      source: "connector",
    });
  });

  it("can validate re-enabling AI directly onto the saved ZahyPi connector", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase({
      textGenerationProvider: "openai",
      isActive: false,
      zahyPiApiKey: null,
      zahyPiBaseUrl: null,
      zahyPiProjectId: null,
      zahyPiModel: null,
    }));
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
    });

    await expect(getZahyPiRuntimeConfig({
      enabled: true,
      provider: "zahypi",
    })).resolves.toMatchObject({
      enabled: true,
      provider: "zahypi",
      source: "connector",
    });
  });

  it("fails closed when AI is disabled even if connector and environment keys exist", async () => {
    process.env.OPENAI_API_KEY = "sk-environment-key";
    process.env.ZAHYPI_API_KEY = "zk_environment_key";
    databaseMock.getDb.mockResolvedValue(settingsDatabase({
      textGenerationProvider: "zahypi",
      isActive: false,
      zahyPiApiKey: null,
      zahyPiBaseUrl: null,
      zahyPiProjectId: null,
      zahyPiModel: null,
      openaiApiKey: null,
    }));
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
    });

    await expect(getZahyPiRuntimeConfig()).resolves.toMatchObject({
      enabled: false,
      provider: "zahypi",
      source: "database",
    });
    await expect(getOpenAiApiKey()).resolves.toBe("");
    expect(connectorMock.getActive).not.toHaveBeenCalled();
  });

  it("fails closed when the active connector credential cannot be decrypted", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase());
    connectorMock.getActive.mockRejectedValue(new Error("Unable to decrypt stored credential"));

    await expect(getZahyPiRuntimeConfig()).rejects.toThrow(
      "Unable to decrypt stored credential",
    );
  });
});
