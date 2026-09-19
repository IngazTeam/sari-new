import { AsyncLocalStorage } from 'node:async_hooks';
const scope = new AsyncLocalStorage<{ userId: number; selectedMerchantId?: number }>();
export const currentMerchantRequest = () => scope.getStore();
export const withMerchantRequest = <T>(request: { userId: number; selectedMerchantId?: number }, callback: () => Promise<T>) => scope.run(request, callback);

/** A selector is a request, never authority; membership is rechecked in SQL. */
export function parseMerchantSelection(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) throw new Error('Invalid merchant selection');
  const selected = Number(value);
  if (!Number.isSafeInteger(selected) || selected > 2_147_483_647) throw new Error('Invalid merchant selection');
  return selected;
}
