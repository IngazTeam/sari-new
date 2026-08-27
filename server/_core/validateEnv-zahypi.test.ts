import { afterEach, describe, expect, it, vi } from "vitest";

import { validateEnv } from "./validateEnv";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("validateEnv with ZahyPi", () => {
  it("still requires OpenAI while Whisper and embeddings use it directly", () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "mysql://local/test";
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.ZAHYPI_ENABLED = "true";
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.com/v1";
    process.env.ZAHYPI_API_KEY = "gateway-key";
    delete process.env.OPENAI_API_KEY;
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = validateEnv();

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("OPENAI_API_KEY"),
    ]));
  });

  it("rejects a ZahyPi origin outside the configured allowlist", () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "mysql://local/test";
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.ZAHYPI_ENABLED = "true";
    process.env.ZAHYPI_BASE_URL = "https://attacker.example/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.com";
    process.env.ZAHYPI_API_KEY = "gateway-key";
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = validateEnv();

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("approved origin"),
    ]));
  });

  it("keeps OpenAI as a valid production provider when ZahyPi is disabled", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mysql://local/test";
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.FIELD_ENCRYPTION_KEY = "y".repeat(32);
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.ZAHYPI_ENABLED = "false";
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const result = validateEnv();

    expect(result.valid).toBe(true);
    expect(result.errors).not.toEqual(expect.arrayContaining([
      expect.stringContaining("ZAHYPI_ENABLED"),
    ]));
    expect(process.exit).not.toHaveBeenCalled();
  });
});
