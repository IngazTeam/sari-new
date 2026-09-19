import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLegacyInboundRollbackSafe } from './check-inbound-rollback.mjs';

test('allows rollback before any durable ingress has been used', async () => {
  await assertLegacyInboundRollbackSafe({ query: async () => [[]] });
});
test('allows a pre-migration database without an inbound table', async () => {
  await assertLegacyInboundRollbackSafe({ query: async () => { throw { code: 'ER_NO_SUCH_TABLE' }; } });
});
test('retains the queue and refuses legacy rollback even for completed history', async () => {
  let calls = 0;
  await assert.rejects(assertLegacyInboundRollbackSafe({ query: async sql => {
    calls++; assert.equal(sql, 'SELECT id FROM whatsapp_inbound_jobs LIMIT 1'); return [[{ id: 1 }]];
  } }), /Legacy rollback blocked/);
  assert.equal(calls, 1);
});
test('fails closed on an unavailable database or malformed result', async () => {
  await assert.rejects(assertLegacyInboundRollbackSafe({ query: async () => { throw new Error('credentials'); } }), /Unable to verify/);
  await assert.rejects(assertLegacyInboundRollbackSafe({ query: async () => [undefined] }), /Invalid/);
});
