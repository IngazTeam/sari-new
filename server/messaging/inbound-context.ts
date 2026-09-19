import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

export type InboundExecution = {
  id: number;
  merchantId: number;
  instanceId: number;
  token: string;
  eventKey: string;
  partitionKey: string;
  assertOwned: () => Promise<void>;
  sendOrdinal: number;
  uncertainEffect?: boolean;
};
const execution = new AsyncLocalStorage<InboundExecution>();
export const currentInboundExecution = () => execution.getStore();
export function withInboundExecution<T>(context: InboundExecution, operation: () => Promise<T>): Promise<T> {
  return execution.run(context, operation);
}
export function inboundEffectKey(): string | undefined {
  const context = execution.getStore();
  if (!context) return undefined;
  // Ordinal applies only within this durable execution. Interrupted planning is
  // never replayed automatically; persisted reply plans retain their own keys.
  return `inbound:${createHash('sha256').update(`${context.eventKey}:${context.sendOrdinal++}`).digest('hex')}`;
}
