import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ insert: vi.fn(), get: vi.fn() }));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    calendar: () => ({ events: { insert: mocks.insert, get: mocks.get } }),
  },
}));
vi.mock("./db", () => ({
  getGoogleOAuthSettings: async () => ({
    enabled: true,
    clientId: "synthetic-client",
    clientSecret: "synthetic-secret",
  }),
}));
import { createCalendarEvent, getCalendarEvent } from "./_core/googleCalendar";
beforeEach(() => {
  vi.clearAllMocks();
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
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
      calendarId: "primary",
      requestBody: expect.objectContaining({
        id: reference,
        extendedProperties: { private: { sariAppointment: reference } },
        start: {
          dateTime: "2026-12-20T07:00:00.000Z",
          timeZone: "Asia/Riyadh",
        },
        end: { dateTime: "2026-12-20T08:00:00.000Z", timeZone: "Asia/Riyadh" },
      }),
    });
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
});
