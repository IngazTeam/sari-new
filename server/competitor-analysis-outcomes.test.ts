import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  begin: vi.fn(),
  read: vi.fn(),
  worker: vi.fn(),
  close: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./competitor-analysis-jobs", async original => ({
  ...(await original<typeof import("./competitor-analysis-jobs")>()),
  beginCompetitorAnalysisJob: m.begin,
  readCompetitorAnalysisJob: m.read,
  closeCompetitorAnalysisAttempt: m.close,
}));
vi.mock("./competitor-analysis-worker", () => ({
  runCompetitorAnalysisWorker: m.worker,
}));
import { websiteAnalysisRouter } from "./routers-website-analysis";
import { CompetitorJobError } from "./competitor-analysis-jobs";
const input = {
  requestId: randomUUID(),
  name: "Fixture",
  url: "https://example.test/",
};
const execution = {
  merchantId: 20,
  requestId: input.requestId,
  token: randomUUID(),
};
const caller = () =>
  websiteAnalysisRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: {} },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.begin.mockResolvedValue({
    created: true,
    competitorId: 8,
    requestId: input.requestId,
    execution,
    url: input.url,
  });
  m.worker.mockResolvedValue(undefined);
});
it('closes an absent reference using only authenticated actor and tenant',async()=>{
  m.close.mockResolvedValue({state:'closed'});
  expect(await caller().closeCompetitorAnalysisAttempt({requestId:input.requestId})).toEqual({state:'closed'});
  expect(m.close).toHaveBeenCalledWith(7,20,{requestId:input.requestId});expect(m.worker).not.toHaveBeenCalled();
});
it('denies read-only closure before writing',async()=>{
  m.access.mockResolvedValue({merchantId:20,role:'viewer'});
  await expect(caller().closeCompetitorAnalysisAttempt({requestId:input.requestId})).rejects.toMatchObject({code:'FORBIDDEN'});expect(m.close).not.toHaveBeenCalled();
});
it("starts only the worker identity accepted for the server-selected tenant", async () => {
  expect(await caller().addCompetitor(input)).toEqual({
    competitorId: 8,
    requestId: input.requestId,
    created: true,
  });
  expect(m.begin).toHaveBeenCalledWith(7, 20, input);
  expect(m.worker).toHaveBeenCalledWith(execution, input.url);
});
it("returns a replay without scheduling another provider call", async () => {
  m.begin.mockResolvedValue({
    created: false,
    competitorId: 8,
    requestId: input.requestId,
    execution: null,
    url: null,
  });
  expect(await caller().addCompetitor(input)).toMatchObject({ created: false });
  expect(m.worker).not.toHaveBeenCalled();
});
it("reads the durable receipt using authenticated identity", async () => {
  m.read.mockResolvedValue({ state: "completed" });
  expect(
    await caller().competitorAnalysisAttempt({ requestId: input.requestId })
  ).toEqual({ state: "completed" });
  expect(m.read).toHaveBeenCalledWith(7, 20, { requestId: input.requestId });
});
it.each([
  ["forbidden", "FORBIDDEN"],
  ["website", "BAD_REQUEST"],
  ["stale", "CONFLICT"],
  ["busy", "CONFLICT"],
  ["cooldown", "TOO_MANY_REQUESTS"],
  ["unknown", "INTERNAL_SERVER_ERROR"],
] as const)("maps %s without leaking provider state", async (reason, code) => {
  m.begin.mockRejectedValue(new CompetitorJobError(reason));
  await expect(caller().addCompetitor(input)).rejects.toMatchObject({
    code,
    message: "competitor_job:" + reason,
  });
  expect(m.worker).not.toHaveBeenCalled();
});
it("hides unexpected admission details", async () => {
  m.begin.mockRejectedValue(Error("PRIVATE_SQL"));
  await expect(caller().addCompetitor(input)).rejects.toMatchObject({
    message: "competitor_job:unavailable",
  });
});
it.each(["viewer", "sales_supervisor"])(
  "blocks %s before admission",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    await expect(caller().addCompetitor(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.begin).not.toHaveBeenCalled();
  }
);
it.each([
  { merchantId: 30 },
  { actorId: 8 },
  { requestId: "bad" },
  { requestId: undefined },
  { name: "" },
  { name: "x".repeat(256) },
])("rejects malformed or forged command %j", async patch => {
  await expect(
    caller().addCompetitor({ ...input, ...patch } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.begin).not.toHaveBeenCalled();
});
it.each(["list", "detail", "products", "compare", "delete"])(
  "keeps retired %s closed",
  async method => {
    const api = caller();
    const call =
      method === "list"
        ? api.listCompetitors()
        : method === "detail"
          ? api.getCompetitor({ id: 8 })
          : method === "products"
            ? api.getCompetitorProducts({ competitorId: 8 })
            : method === "compare"
              ? api.compareWithCompetitors({
                  analysisId: 8,
                  competitorIds: [8],
                })
              : api.deleteCompetitor({ id: 8 });
    await expect(call).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(m.worker).not.toHaveBeenCalled();
  }
);
