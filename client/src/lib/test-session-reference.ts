import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";

// Persist only an opaque ID, scoped to identities confirmed by the API.
export const testSessionPrefix = "sary:test-session:v1:";
export function readTestSessionReference(scope: string): number | null {
  try {
    const value = sessionStorage.getItem(testSessionPrefix + scope);
    return value &&
      /^[1-9]\d*$/.test(value) &&
      Number.isSafeInteger(Number(value))
      ? Number(value)
      : null;
  } catch {
    return null;
  }
}
export function rememberTestSessionReference(
  scope: string,
  id: number,
  epoch: number
): boolean {
  if (epoch !== knowledgeCacheEpoch() || !Number.isSafeInteger(id) || id < 1)
    return false;
  try {
    sessionStorage.setItem(testSessionPrefix + scope, String(id));
    return readTestSessionReference(scope) === id;
  } catch {
    return false;
  }
}
