import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  slots: vi.fn(),
  integration: vi.fn(),
  list: vi.fn(),
  refresh: vi.fn(),
  staff: vi.fn(),
  conflict: vi.fn(),
}));
vi.mock("./db", () => ({
  getServiceById: mocks.service,
  getAvailableTimeSlots: mocks.slots,
  getGoogleIntegration: mocks.integration,
}));
vi.mock("./db/connection", () => ({ getPool: async () => ({}) }));
vi.mock("./booking-capacity", () => ({
  validateBookingStaff: mocks.staff,
  hasBookingConflict: mocks.conflict,
}));
vi.mock("./_core/googleCalendar", () => ({
  validateAndRefreshCredentials: mocks.refresh,
  createCalendarClient: async () => ({ events: { list: mocks.list } }),
}));
import { getCalendarAvailability } from "./calendar-availability";
const input = { serviceId: 11, date: "2026-12-20" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.service.mockResolvedValue({
    id: 11,
    merchantId: 7,
    isActive: 1,
    durationMinutes: 60,
    bufferTimeMinutes: 0,
  });
  mocks.slots.mockResolvedValue([
    { startTime: "10:00", endTime: "11:00" },
    { startTime: "11:00", endTime: "12:00" },
  ]);
  mocks.integration.mockResolvedValue({
    isActive: 1,
    calendarId: "test",
    credentials: "{}",
  });
  mocks.list.mockResolvedValue({ data: { items: [] } });
  mocks.conflict.mockResolvedValue(false);
});
describe("calendar availability evidence", () => {
  afterEach(() => vi.useRealTimers());
  it.each([
    undefined,
    null,
    {},
    { items: null },
    { items: [], error: { code: 503 } },
  ])(
    "never returns free slots from an incomplete response (case %#)",
    async data => {
      mocks.list.mockResolvedValue({ data });
      await expect(getCalendarAvailability(7, input)).rejects.toThrow(
        "INCOMPLETE"
      );
    }
  );
  it("does not return partial availability when a later page fails", async () => {
    mocks.list
      .mockResolvedValueOnce({ data: { items: [], nextPageToken: "two" } })
      .mockRejectedValueOnce(Error("provider unavailable"));
    await expect(getCalendarAvailability(7, input)).rejects.toThrow();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
  it("bounds pages even if every token is new", async () => {
    let page = 0;
    mocks.list.mockImplementation(async () => ({
      data: { items: [], nextPageToken: `page-${++page}` },
    }));
    await expect(getCalendarAvailability(7, input)).rejects.toThrow(
      "INCOMPLETE"
    );
    expect(mocks.list).toHaveBeenCalledTimes(10);
  });
  it("rejects an expired total read deadline and passes the remaining timeout", async () => {
    vi.useFakeTimers();
    mocks.list
      .mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 29000);
        return { data: { items: [], nextPageToken: "two" } };
      })
      .mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 1001);
        return { data: { items: [] } };
      });
    await expect(getCalendarAvailability(7, input)).rejects.toThrow(
      "INCOMPLETE"
    );
    expect(mocks.list.mock.calls[1][1]).toEqual({
      timeout: 1000,
      retry: false,
    });
  });
  it("does not merge unstable duplicate events from different pages", async () => {
    const event = { id: "same", status: "cancelled" };
    mocks.list
      .mockResolvedValueOnce({ data: { items: [event], nextPageToken: "two" } })
      .mockResolvedValueOnce({ data: { items: [event] } });
    await expect(getCalendarAvailability(7, input)).rejects.toThrow(
      "INCOMPLETE"
    );
  });
  it.each([
    { durationMinutes: 0 },
    { durationMinutes: "60" },
    { durationMinutes: NaN },
    { bufferTimeMinutes: -1 },
    { bufferTimeMinutes: "30" },
  ])("rejects invalid configured service intervals (case %#)", async patch => {
    mocks.service.mockResolvedValue({
      id: 11,
      merchantId: 7,
      isActive: 1,
      durationMinutes: 60,
      ...patch,
    });
    await expect(getCalendarAvailability(7, input)).rejects.toThrow(
      "UNAVAILABLE"
    );
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("keeps a foreign-zone all-day event busy until its actual exclusive end", async () => {
    mocks.list.mockResolvedValue({
      data: {
        timeZone: "America/Los_Angeles",
        items: [{ start: { date: "2026-12-19" }, end: { date: "2026-12-20" } }],
      },
    });
    expect(await getCalendarAvailability(7, input)).toEqual({
      slots: ["11:00"],
    });
  });
  it("uses explicit Riyadh day boundaries independent of server timezone", async () => {
    expect(await getCalendarAvailability(7, input)).toEqual({
      slots: ["10:00", "11:00"],
    });
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        timeMin: "2026-12-19T21:00:00.000Z",
        timeMax: "2026-12-20T21:00:00.000Z",
        timeZone: "Asia/Riyadh",
      }),
      expect.objectContaining({ timeout: expect.any(Number), retry: false })
    );
  });
  it("reads every Google page before suggesting an interval", async () => {
    mocks.list
      .mockResolvedValueOnce({ data: { items: [], nextPageToken: "second" } })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              start: { dateTime: "2026-12-20T10:00:00+03:00" },
              end: { dateTime: "2026-12-20T11:00:00+03:00" },
            },
          ],
        },
      });
    expect(await getCalendarAvailability(7, input)).toEqual({
      slots: ["11:00"],
    });
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageToken: "second" }),
      expect.objectContaining({ timeout: expect.any(Number), retry: false })
    );
  });
  it("treats an opaque all-day event as busy", async () => {
    mocks.list.mockResolvedValue({
      data: {
        items: [{ start: { date: "2026-12-20" }, end: { date: "2026-12-21" } }],
      },
    });
    expect(await getCalendarAvailability(7, input)).toEqual({ slots: [] });
  });
  it.each(["cancelled", "transparent"])(
    "does not block with %s events",
    async kind => {
      mocks.list.mockResolvedValue({
        data: {
          items: [
            {
              status: kind === "cancelled" ? kind : "confirmed",
              transparency: kind,
              start: { date: "2026-12-20" },
              end: { date: "2026-12-21" },
            },
          ],
        },
      });
      expect((await getCalendarAvailability(7, input)).slots).toHaveLength(2);
    }
  );
  it("fails closed on malformed event timing or incomplete pagination", async () => {
    mocks.list.mockResolvedValueOnce({ data: { items: [{}] } });
    await expect(getCalendarAvailability(7, input)).rejects.toThrow();
    mocks.list.mockResolvedValue({
      data: { items: [], nextPageToken: "same" },
    });
    await expect(getCalendarAvailability(7, input)).rejects.toThrow(
      "INCOMPLETE"
    );
  });
  it("checks merchant and staff before provider access", async () => {
    mocks.service.mockResolvedValueOnce({ merchantId: 99, isActive: 1 });
    await expect(getCalendarAvailability(7, input)).rejects.toThrow();
    mocks.staff.mockRejectedValueOnce(Error("staff unavailable"));
    await expect(
      getCalendarAvailability(7, { ...input, staffId: 5 })
    ).rejects.toThrow();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("omits mismatched durations and locally conflicting unassigned reservations", async () => {
    mocks.slots.mockResolvedValue([
      { startTime: "09:00", endTime: "09:30" },
      { startTime: "10:00", endTime: "11:00" },
    ]);
    mocks.conflict.mockResolvedValue(true);
    expect(await getCalendarAvailability(7, input)).toEqual({ slots: [] });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("keeps local configured availability without a Google connection", async () => {
    mocks.integration.mockResolvedValue(null);
    expect((await getCalendarAvailability(7, input)).slots).toHaveLength(2);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
