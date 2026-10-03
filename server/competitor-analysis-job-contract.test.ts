import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  competitorAnalysisStart,
  competitorAnalysisExecution,
  competitorAnalysisResult,
  competitorAnalysisReceipt,
} from "../shared/competitor-analysis-job";
const receipt={actorId:7,merchantId:20,requestId:randomUUID(),state:'closed',competitorId:null,reportAvailable:false};
it.each([{competitorId:3},{reportAvailable:true},{state:'running'},{token:'PRIVATE'},{actorId:0}])('rejects inconsistent receipt %j',patch=>expect(competitorAnalysisReceipt.safeParse({...receipt,...patch}).success).toBe(false));
const command = {
  requestId: randomUUID(),
  name: "Example",
  url: "https://example.test/",
};
it.each([
  { merchantId: 7 },
  { actorId: 8 },
  { requestId: "bad" },
  { name: "" },
  { name: "x".repeat(256) },
  { url: "bad" },
])("rejects forged or invalid commands %j", patch =>
  expect(
    competitorAnalysisStart.safeParse({ ...command, ...patch }).success
  ).toBe(false)
);
const execution = {
  merchantId: 7,
  requestId: randomUUID(),
  token: randomUUID(),
};
it.each([
  { merchantId: 0 },
  { merchantId: 2147483648 },
  { token: "bad" },
  { actorId: 3 },
])("rejects invalid execution identity %j", patch =>
  expect(
    competitorAnalysisExecution.safeParse({ ...execution, ...patch }).success
  ).toBe(false)
);
const result = {
  scores: { overall: 0, seo: 50, performance: 50, ux: 50, content: 50 },
  industry: null,
  products: [],
};
it("accepts real zero and genuinely empty extraction", () =>
  expect(competitorAnalysisResult.parse(result)).toEqual(result));
it.each([NaN, Infinity, -1, 101, 1.5, "75"])(
  "rejects invalid provider score %s",
  overall =>
    expect(
      competitorAnalysisResult.safeParse({
        ...result,
        scores: { ...result.scores, overall },
      }).success
    ).toBe(false)
);
it("rejects provider payload fields outside the documented result", () =>
  expect(
    competitorAnalysisResult.safeParse({ ...result, rawPrompt: "private" })
      .success
  ).toBe(false));
