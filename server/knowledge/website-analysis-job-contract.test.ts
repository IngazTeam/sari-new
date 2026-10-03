import { expect, it } from "vitest";
import {
  websiteJobResult,
  websiteJobExecution,
} from "../../shared/website-analysis-job";
const result = {
  success: true,
  title: "Store",
  score: 0,
  knowledgeEvolution: null,
  salesIntelSummary: null,
  knowledgeError: null,
  indexingOutcome: { status: "failed", indexedSections: null },
  crawlStats: null,
};
it("preserves missing knowledge and actual zero without manufacturing coverage", () =>
  expect(websiteJobResult.parse(result)).toEqual(result));
it.each([
  { secret: "private" },
  { knowledgeError: "PRIVATE_PROVIDER_ERROR" },
  { score: 101 },
  { score: "3" },
  { knowledgeEvolution: { added: 1 } },
  { indexingOutcome: { status: "returned", indexedSections: -1 } },
  { crawlStats: { pagesSuccess: 1, rawText: "private" } },
])("refuses unsafe or incoherent results %j", patch =>
  expect(websiteJobResult.safeParse({ ...result, ...patch }).success).toBe(
    false
  )
);
it.each([
  { merchantId: 0, jobId: crypto.randomUUID(), token: crypto.randomUUID() },
  { merchantId: 1, jobId: "foreign", token: crypto.randomUUID() },
  { merchantId: 1, jobId: crypto.randomUUID(), token: "token" },
  {
    merchantId: 1,
    jobId: crypto.randomUUID(),
    token: crypto.randomUUID(),
    actorId: 2,
  },
])("rejects invalid execution scopes %j", input =>
  expect(websiteJobExecution.safeParse(input).success).toBe(false)
);
