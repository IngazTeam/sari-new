import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
  tokenInfo: vi.fn(),
  refresh: vi.fn(),
  request: vi.fn(),
  setCredentials: vi.fn(),
  settings: vi.fn(),
  free: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        transporter = { request: mocks.request };
        setCredentials = mocks.setCredentials;
        getTokenInfo = mocks.tokenInfo;
        refreshAccessToken = mocks.refresh;
      },
    },
    calendar: () => ({
      freebusy: { query: mocks.free },
      events: {
        insert: mocks.insert,
        get: mocks.get,
        patch: mocks.patch,
        delete: mocks.remove,
      },
    }),
  },
}));
vi.mock("./db", () => ({
  getGoogleOAuthSettings: mocks.settings,
}));
import {
  createCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  validateAndRefreshCredentials,
  createOAuth2Client,
  assertCalendarTimeFree,
} from "./_core/googleCalendar";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.free.mockResolvedValue({
    data: { calendars: { primary: { busy: [] } } },
  });
  mocks.settings.mockResolvedValue({
    enabled: true,
    clientId: "synthetic-client",
    clientSecret: "synthetic-secret",
  });
  mocks.tokenInfo.mockResolvedValue({ expiry_date: Date.now() + 3600000 });
  mocks.refresh.mockResolvedValue({
    credentials: { access_token: "renewed", expiry_date: Date.now() + 3600000 },
  });
  mocks.patch.mockResolvedValue({ data: { id: "updated" } });
  mocks.remove.mockResolvedValue({});
  mocks.insert.mockResolvedValue({ data: { id: "sariappt" + "a".repeat(32) } });
  mocks.get.mockResolvedValue({
    data: { id: "known-event", status: "cancelled" },
  });
});
describe("Google calendar provider contract", () => {
  it("sends the durable ID and private correlation with explicitly offset event times", async () => {
    const reference = "sariappt" + "a".repeat(32);
    await createCalendarEvent({}, "primary", {
      id: reference,
      privateProperties: { sariAppointment: reference },
      summary: "Test",
      start: new Date("2026-12-20T10:00:00+03:00"),
      end: new Date("2026-12-20T11:00:00+03:00"),
    });
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(
      {
        calendarId: "primary",
        requestBody: expect.objectContaining({
          id: reference,
          extendedProperties: { private: { sariAppointment: reference } },
          start: {
            dateTime: "2026-12-20T07:00:00.000Z",
            timeZone: "Asia/Riyadh",
          },
          end: {
            dateTime: "2026-12-20T08:00:00.000Z",
            timeZone: "Asia/Riyadh",
          },
        }),
      },
      { timeout: 15000, retry: false }
    );
  });
  it("uses one bounded GET without requesting provider mutation", async () => {
    expect(
      await getCalendarEvent({}, "original-calendar", "known-event")
    ).toEqual({ id: "known-event", status: "cancelled" });
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
      { calendarId: "original-calendar", eventId: "known-event" },
      { timeout: 15000, retry: false }
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("awaits asynchronous OAuth settings before validating the token", async () => {
    let done!: (v: any) => void;
    mocks.settings.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          done = resolve;
        })
    );
    const input = Object.freeze({
        access_token: "current",
        refresh_token: "original",
      }),
      operation = validateAndRefreshCredentials(input);
    await Promise.resolve();
    expect(mocks.setCredentials).not.toHaveBeenCalled();
    done({ enabled: true, clientId: "fixture", clientSecret: "fixture" });
    const result = await operation;
    expect(result).toMatchObject(input);
    expect(result.expiry_date).toBeGreaterThan(Date.now());
    expect(result).not.toBe(input);
    expect(mocks.tokenInfo).toHaveBeenCalledExactlyOnceWith("current");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it.each([400, 401])(
    "renews invalid token after OAuth %s preserving binding",
    async status => {
      mocks.tokenInfo.mockRejectedValueOnce({ response: { status } });
      expect(
        await validateAndRefreshCredentials({
          access_token: "expired",
          refresh_token: "original",
        })
      ).toMatchObject({ access_token: "renewed", refresh_token: "original" });
      expect(mocks.refresh).toHaveBeenCalledOnce();
    }
  );
  it("renews refresh-only authorization without inspecting an absent access token", async () => {
    expect(
      await validateAndRefreshCredentials({ refresh_token: "original" })
    ).toMatchObject({ access_token: "renewed", refresh_token: "original" });
    expect(mocks.tokenInfo).not.toHaveBeenCalled();
  });
  it.each([403, 429, 500, 503, "timeout"])(
    "does not amplify or leak inspection failure %s",
    async status => {
      mocks.tokenInfo.mockRejectedValueOnce({
        response: { status },
        message: "private refresh_token",
      });
      await expect(
        validateAndRefreshCredentials({
          access_token: "current",
          refresh_token: "original",
        })
      ).rejects.toThrow("Calendar authorization unavailable");
      expect(mocks.refresh).not.toHaveBeenCalled();
    }
  );
  it.each([null, [], {}, { access_token: "" }, { access_token: 3 }])(
    "rejects unusable credentials before opening OAuth (case %#)",
    async input => {
      await expect(validateAndRefreshCredentials(input)).rejects.toThrow(
        "Calendar authorization unavailable"
      );
      expect(mocks.settings).not.toHaveBeenCalled();
    }
  );
  it.each([
    { access_token: "" },
    { access_token: "new", expiry_date: 1 },
    { access_token: "new" },
  ])("rejects incomplete renewed tokens (case %#)", async credentials => {
    mocks.refresh.mockResolvedValueOnce({ credentials });
    await expect(
      validateAndRefreshCredentials({ refresh_token: "old" })
    ).rejects.toThrow("Calendar authorization unavailable");
  });
  it("refreshes an access token whose inspected expiry has passed", async () => {
    mocks.tokenInfo.mockResolvedValueOnce({ expiry_date: 1 });
    expect(
      await validateAndRefreshCredentials({
        access_token: "old",
        refresh_token: "original",
      })
    ).toMatchObject({ access_token: "renewed", refresh_token: "original" });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("redacts refresh failures and does not retry them", async () => {
    mocks.refresh.mockRejectedValueOnce(Error("private token"));
    await expect(
      validateAndRefreshCredentials({ refresh_token: "original" })
    ).rejects.toThrow("Calendar authorization unavailable");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("bounds OAuth transporter even when SDK requests retries", async () => {
    const client = await createOAuth2Client();
    await client.transporter.request({
      url: "https://example.test/token",
      retry: true,
      timeout: 90000,
    });
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith({
      url: "https://example.test/token",
      retry: false,
      timeout: 15000,
    });
  });
  it("requires complete free/busy evidence for the exact interval", async () => {
    await assertCalendarTimeFree(
      {},
      "primary",
      new Date("2026-12-20T10:00:00+03:00"),
      new Date("2026-12-20T11:00:00+03:00")
    );
    expect(mocks.free).toHaveBeenCalledExactlyOnceWith(
      {
        requestBody: {
          timeMin: "2026-12-20T07:00:00.000Z",
          timeMax: "2026-12-20T08:00:00.000Z",
          timeZone: "Asia/Riyadh",
          items: [{ id: "primary" }],
        },
      },
      { timeout: 15000, retry: false }
    );
  });
  it.each([
    null,
    {},
    { errors: [{ reason: "notFound" }], busy: [] },
    { busy: [{ start: "invalid", end: "invalid" }] },
    { busy: [{ start: "2026-12-20T07:00:00Z", end: "2026-12-20T08:00:00Z" }] },
    { busy: [{ start: "2026-12-20T10:00:00", end: "2026-12-20T11:00:00" }] },
  ])(
    "rejects unavailable, malformed or occupied free/busy response (case %#)",
    async entry => {
      mocks.free.mockResolvedValueOnce({
        data: { calendars: { primary: entry } },
      });
      await expect(
        assertCalendarTimeFree(
          {},
          "primary",
          new Date("2026-12-20T10:00:00+03:00"),
          new Date("2026-12-20T11:00:00+03:00")
        )
      ).rejects.toThrow();
    }
  );
  it("allows adjacent intervals without counting their shared endpoint as occupied", async () => {
    mocks.free.mockResolvedValueOnce({
      data: {
        calendars: {
          primary: {
            busy: [
              { start: "2026-12-20T06:00:00Z", end: "2026-12-20T07:00:00Z" },
              { start: "2026-12-20T08:00:00Z", end: "2026-12-20T09:00:00Z" },
            ],
          },
        },
      },
    });
    await expect(
      assertCalendarTimeFree(
        {},
        "primary",
        new Date("2026-12-20T10:00:00+03:00"),
        new Date("2026-12-20T11:00:00+03:00")
      )
    ).resolves.toBeUndefined();
  });
  it("bounds update and delete calls without transport retry", async () => {
    await updateCalendarEvent({}, "primary", "event", { summary: "new" });
    await deleteCalendarEvent({}, "primary", "event");
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith(
      {
        calendarId: "primary",
        eventId: "event",
        requestBody: { summary: "new" },
      },
      { timeout: 15000, retry: false }
    );
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
      { calendarId: "primary", eventId: "event" },
      { timeout: 15000, retry: false }
    );
  });
});
