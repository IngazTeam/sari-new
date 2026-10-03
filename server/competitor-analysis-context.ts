import { AsyncLocalStorage } from "node:async_hooks";
// A transport checkpoint is injected by the durable worker. No database dependency in transport modules.
const active = new AsyncLocalStorage<{
  merchantId: number;
  checkpoint: () => Promise<void>;
}>();
export function runCompetitorAnalysisContext<T>(
  merchantId: number,
  checkpoint: () => Promise<void>,
  work: () => Promise<T>
) {
  return active.run({ merchantId, checkpoint }, work);
}
export async function assertActiveCompetitorAnalysis(merchantId?: number) {
  const context = active.getStore();
  if (!context) return;
  if (merchantId !== undefined && merchantId !== context.merchantId)
    throw Error("competitor_job:forbidden");
  await context.checkpoint();
}
