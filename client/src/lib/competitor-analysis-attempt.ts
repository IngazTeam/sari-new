import {
  competitorAnalysisAttempt,
  competitorAnalysisReceipt,
} from "@shared/competitor-analysis-job";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
const prefix = "sary:competitor-analysis:v1:";
const key = (scope: string) => {
  if (!/^[1-9]\d*:[1-9]\d*$/.test(scope)) throw Error("Invalid attempt scope");
  return prefix + scope;
};
export function readCompetitorAttempt(scope: string) {
  const value = sessionStorage.getItem(key(scope));
  if (value !== null) competitorAnalysisAttempt.parse({ requestId: value });
  return value;
}
export function rememberCompetitorAttempt(
  scope: string,
  requestId: string,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch() || readCompetitorAttempt(scope) !== null)
    throw Error("Existing reference or session change");
  competitorAnalysisAttempt.parse({ requestId });
  sessionStorage.setItem(key(scope), requestId);
  if (readCompetitorAttempt(scope) !== requestId)
    throw Error("Reference unavailable");
}
export function forgetCompetitorAttempt(
  scope: string,
  requestId: string,
  epoch: number
) {
  if (
    epoch !== knowledgeCacheEpoch() ||
    readCompetitorAttempt(scope) !== requestId
  )
    throw Error("Reference changed");
  sessionStorage.removeItem(key(scope));
  if (readCompetitorAttempt(scope) !== null)
    throw Error("Reference unavailable");
}
export function scopedCompetitorReceipt(
  value: unknown,
  actorId: number,
  merchantId: number,
  requestId: string | null
) {
  const parsed = competitorAnalysisReceipt.safeParse(value);
  return parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId &&
    parsed.data.requestId === requestId
    ? parsed.data
    : null;
}
