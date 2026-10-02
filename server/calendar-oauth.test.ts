import { describe, it, expect, vi } from "vitest";
import {
  exchangeCalendarCode,
  CALENDAR_SCOPE,
  CalendarOAuthError,
} from "./calendar-oauth";
const payload = {
  access_token: "new-access",
  refresh_token: "new-refresh",
  token_type: "Bearer",
  expires_in: 3600,
  scope: "https://www.googleapis.com/auth/calendar",
};
describe("Calendar OAuth provider boundary", () => {
  it("requests the Google Calendar permission", () => {
    expect(CALENDAR_SCOPE).toBe("https://www.googleapis.com/auth/calendar");
  });
  it("uses one bounded fixed-origin exchange and projects only credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...payload, id_token: "unused-secret" }))
      );
    const result = await exchangeCalendarCode(
      { clientId: "client", clientSecret: "secret" },
      "https://sary.live/api/auth/oauth/google/calendar/callback",
      "code",
      fetcher
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(options).toMatchObject({ method: "POST", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(new URLSearchParams(options.body).get("redirect_uri")).toBe(
      "https://sary.live/api/auth/oauth/google/calendar/callback"
    );
    expect(result).toMatchObject({
      access_token: "new-access",
      refresh_token: "new-refresh",
      token_type: "Bearer",
    });
    expect(result.expiry_date).toBeGreaterThan(Date.now());
    expect(JSON.stringify(result)).not.toContain("unused-secret");
  });
  it.each([
    { ...payload, refresh_token: undefined },
    { ...payload, access_token: "bad\nvalue" },
    { ...payload, scope: "https://example.test/other" },
    { ...payload, token_type: "other" },
    { ...payload, expires_in: -1 },
    { ...payload, expires_in: 99999999 },
  ])("redacts invalid provider credentials %j", async value => {
    await expect(
      exchangeCalendarCode(
        { clientId: "c", clientSecret: "s" },
        "https://sary.live/cb",
        "x",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))
      )
    ).rejects.toMatchObject({ reason: "exchange", message: "exchange" });
  });
  it.each(["unauthorized", "badJSON", "huge", "network"])(
    "rejects %s without retry or leaking the code",
    async kind => {
      const fetcher =
        kind === "network"
          ? vi.fn().mockRejectedValue(Error("secret-code"))
          : vi
              .fn()
              .mockResolvedValue(
                kind === "unauthorized"
                  ? new Response("secret-code", { status: 401 })
                  : new Response(
                      kind === "huge" ? "x".repeat(65537) : "not-json"
                    )
              );
      await expect(
        exchangeCalendarCode(
          { clientId: "c", clientSecret: "s" },
          "https://sary.live/cb",
          "secret-code",
          fetcher
        )
      ).rejects.toEqual(new CalendarOAuthError("exchange"));
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );
});
