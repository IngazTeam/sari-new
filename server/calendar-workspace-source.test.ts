import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  db: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("./db/connection", () => ({ getDb: m.db }));
import {
  readCalendarWorkspace,
  readCalendarDetails,
} from "./calendar-workspace";
beforeEach(() => {
  vi.resetAllMocks();
  m.db.mockResolvedValue({ transaction: m.transaction });
  m.transaction.mockImplementation(async callback =>
    callback({ execute: m.execute })
  );
});
describe("calendar workspace source failures", () => {
  for (const detail of [false, true]) {
    const read = () =>
      detail
        ? readCalendarDetails(7, 20, { appointmentId: 31 })
        : readCalendarWorkspace(7, 20, {
            startDate: "2026-10-01",
            endDate: "2026-10-31",
          });
    it(`does not return empty data for unavailable storage ${detail}`, async () => {
      m.db.mockResolvedValue(null);
      await expect(read()).rejects.toThrow("Calendar data unavailable");
      m.db.mockRejectedValue(Error("private database credentials"));
      await expect(read()).rejects.toThrow("Calendar data unavailable");
    });
    it.each([undefined, {}, [[]], [[{ id: 21 }]]])(
      `rejects malformed scope ${detail} %j`,
      async result => {
        m.execute.mockResolvedValue(result);
        await expect(read()).rejects.toThrow("Calendar data unavailable");
      }
    );
    it(`uses a read-only consistent transaction and redacts failure ${detail}`, async () => {
      m.execute
        .mockResolvedValueOnce([[{ id: 20 }]])
        .mockRejectedValueOnce(Error("SQL credentials"));
      await expect(read()).rejects.toThrow("Calendar data unavailable");
      expect(m.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    });
  }
});
