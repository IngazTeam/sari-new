import { byaanResyncRequest } from '@shared/byaan-resync';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (actorId: number, merchantId: number) => `sari:byaan:resync:${actorId}:${merchantId}`;
export function pendingByaanResync(storage: Storage, actorId: number, merchantId: number) {
  const value = storage.getItem(key(actorId, merchantId)); if (!value) return null;
  return byaanResyncRequest.parse(JSON.parse(value));
}
export function saveByaanResync(storage: Storage, actorId: number, merchantId: number, value: unknown) {
  const request = byaanResyncRequest.parse(value); storage.setItem(key(actorId, merchantId), JSON.stringify(request));
  if (storage.getItem(key(actorId, merchantId)) !== JSON.stringify(request)) throw Error('Request storage unavailable'); return request;
}
export function clearByaanResync(storage: Storage, actorId: number, merchantId: number, requestId: string) {
  const pending = pendingByaanResync(storage, actorId, merchantId); if (pending?.requestId === requestId) storage.removeItem(key(actorId, merchantId));
}
