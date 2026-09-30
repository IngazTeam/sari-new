import { beforeEach, describe, it, expect, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const mocks=vi.hoisted(()=>({db:vi.fn(),execute:vi.fn()}));
vi.mock("./db/connection",()=>({getDb:mocks.db}));
import { getScheduledReports,createScheduledReport,updateScheduledReport,deleteScheduledReport } from "./db-notifications";
const example={merchantId:20,name:"Synthetic report",reportType:"daily" as const};
beforeEach(()=>{vi.clearAllMocks();mocks.db.mockResolvedValue({execute:mocks.execute});mocks.execute.mockResolvedValue([[],[]]);});
describe("scheduled report storage failures and tenant identity",()=>{
  it("returns a real empty query without turning missing storage into empty success",async()=>{
    expect(await getScheduledReports(20)).toEqual([]);mocks.db.mockResolvedValue(null);
    await expect(getScheduledReports(20)).rejects.toThrow("unavailable");
    await expect(createScheduledReport(example)).rejects.toThrow("unavailable");
    await expect(updateScheduledReport(1,{name:"Changed"},20)).rejects.toThrow("unavailable");
    await expect(deleteScheduledReport(1,20)).rejects.toThrow("unavailable");
  });
  it.each([undefined,null,{},[{count:1}],[null]])("rejects malformed list packet %#",async packet=>{
    mocks.execute.mockResolvedValue(packet);await expect(getScheduledReports(20)).rejects.toThrow();
  });
  it.each([undefined,0,-1,1.5,Number.MAX_SAFE_INTEGER+1,"9"])("does not acknowledge an invalid insertion identity %s",async insertId=>{
    mocks.execute.mockResolvedValue([{insertId}]);await expect(createScheduledReport(example)).rejects.toThrow();
  });
  it("acknowledges a real positive insertion and preserves explicit false flags",async()=>{
    mocks.execute.mockResolvedValue([{insertId:19}]);
    expect(await createScheduledReport({...example,includeOrders:false,includeRevenue:false})).toBe(19);
    const q=new MySqlDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);expect(q.params).toContain(20);expect(q.params.filter(v=>v===false)).toHaveLength(2);
  });
  it.each([undefined,null,0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1])("rejects missing or unsafe tenant identity %s before database access",async merchant=>{
    await expect(getScheduledReports(merchant as any)).rejects.toThrow();
    await expect(createScheduledReport({...example,merchantId:merchant as any})).rejects.toThrow();
    await expect(updateScheduledReport(1,{isActive:false},merchant as any)).rejects.toThrow();
    await expect(deleteScheduledReport(1,merchant as any)).rejects.toThrow();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("always places both record and merchant identities in write predicates",async()=>{
    await updateScheduledReport(31,{isActive:false},20);await deleteScheduledReport(31,20);
    for(const [query] of mocks.execute.mock.calls){const q=new MySqlDialect().sqlToQuery(query);expect(q.sql).toMatch(/WHERE id = \? AND merchant_id = \?/);expect(q.params.slice(-2)).toEqual([31,20]);}
  });
  it("propagates a write failure without acknowledging a saved or deleted record",async()=>{
    mocks.execute.mockRejectedValue(new Error("Simulated storage failure"));
    await expect(createScheduledReport(example)).rejects.toThrow("Simulated");await expect(updateScheduledReport(1,{isActive:false},20)).rejects.toThrow("Simulated");await expect(deleteScheduledReport(1,20)).rejects.toThrow("Simulated");
  });
});
