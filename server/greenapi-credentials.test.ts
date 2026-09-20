import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { GreenApiWhatsAppProvider } from "./channels/whatsapp/providers";
vi.mock("axios", () => ({ default: { get: vi.fn() } }));
const provider = new GreenApiWhatsAppProvider();
const config = {
  provider: "green_api" as const,
  instanceId: "12345",
  token: "synthetic-test-token",
  apiUrl: "https://api.green-api.com",
};
beforeEach(() => vi.resetAllMocks());
describe("Green API production health adapter (isolated transport)", () => {
  it("uses the production URL shape and bounds the credential request", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: { stateInstance: "authorized" },
    });
    expect(await provider.health(config)).toEqual({
      healthy: true,
      detail: "authorized",
    });
    expect(axios.get).toHaveBeenCalledWith(
      "https://api.green-api.com/waInstance12345/getStateInstance/synthetic-test-token",
      expect.objectContaining({ timeout: 8000, maxRedirects: 0 })
    );
  });
  it.each(["notAuthorized", "blocked", "sleepMode"])(
    "does not report %s as healthy",
    async state => {
      vi.mocked(axios.get).mockResolvedValue({
        status: 200,
        data: { stateInstance: state },
      });
      expect((await provider.health(config)).healthy).toBe(false);
    }
  );
  it.each([401, 429, 500])("does not accept HTTP %s", async status => {
    vi.mocked(axios.get).mockResolvedValue({
      status,
      data: { stateInstance: "authorized" },
    });
    expect((await provider.health(config)).healthy).toBe(false);
  });
  it("rejects missing credentials before contacting the provider", async () => {
    expect(await provider.health({ ...config, token: "" })).toEqual({
      healthy: false,
      detail: "configuration_missing",
    });
    expect(axios.get).not.toHaveBeenCalled();
  });
  it.each([
    "http://api.green-api.com",
    "https://api.green-api.com.evil.test",
    "https://127.0.0.1",
  ])("does not send credentials to %s", async apiUrl => {
    expect((await provider.health({ ...config, apiUrl })).healthy).toBe(false);
    expect(axios.get).not.toHaveBeenCalled();
  });
  it("does not return secrets from transport errors", async () => {
    vi.mocked(axios.get).mockRejectedValue(
      new Error("failed URL containing synthetic-test-token")
    );
    expect(await provider.health(config)).toEqual({
      healthy: false,
      detail: "provider_unreachable",
    });
  });
});
