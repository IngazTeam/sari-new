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
  readCalendarStats,
} from "./calendar-workspace";
beforeEach(() => {
  vi.resetAllMocks();
  m.db.mockResolvedValue({ transaction: m.transaction });
  m.transaction.mockImplementation(async callback =>
    callback({ execute: m.execute })
  );
});
describe("calendar workspace source failures", () => {
  it.each([undefined,{},[{status:'pending',total:-1}],[{status:'pending',total:1},{status:'pending',total:2}],[{status:'invalid',total:1}],[{status:'pending',total:null}]])('rejects malformed stats groups %j',async rows=>{
    m.execute.mockResolvedValueOnce([[{id:20}]]).mockResolvedValueOnce([rows]);
    await expect(readCalendarStats(7,20,{})).rejects.toThrow('Calendar data unavailable');
  });
  it('sums complete stats groups without selecting appointment contents',async()=>{
    m.execute.mockResolvedValueOnce([[{id:20}]]).mockResolvedValueOnce([[{status:'pending',total:501},{status:'unknown',total:2},{status:'no_show',total:1}]]);
    expect(await readCalendarStats(7,20,{})).toMatchObject({actorId:7,merchantId:20,total:504,pending:501,unknown:2,noShow:1,confirmed:0});
  });
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
