import { websiteAnalysisAttempt } from "@shared/website-analysis-tracking";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";

// Store only an opaque reference. Result text and execution tokens stay on the server.
const prefix = "sary:website-analysis:v1:";
function key(scope: string) {
  if (!/^[1-9]\d*:[1-9]\d*:brain-page$/.test(scope))
    throw Error("Invalid analysis scope");
  return prefix + scope;
}
export function readWebsiteAttempt(scope: string): string | null {
  const value = sessionStorage.getItem(key(scope));
  if (value !== null)
    websiteAnalysisAttempt.parse({
      merchantId: Number(scope.split(":")[1]),
      jobId: value,
    });
  return value;
}
export function saveWebsiteAttempt(
  scope: string,
  jobId: string,
  expected: string | null,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  websiteAnalysisAttempt.parse({
    merchantId: Number(scope.split(":")[1]),
    jobId,
  });
  if (readWebsiteAttempt(scope) !== expected)
    throw Error("Analysis reference changed");
  sessionStorage.setItem(key(scope), jobId);
  if (readWebsiteAttempt(scope) !== jobId)
    throw Error("Analysis reference unavailable");
}
