import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRuntime } from './check-runtime.mjs';

const valid = { nodeVersion: 'v22.23.2', expectedNode: '22.23.2', userAgent: 'pnpm/10.4.1 npm/? node/v22.23.2',
  requirePnpm: true, manifest: { engines: { node: '22.23.2', pnpm: '10.4.1' }, packageManager: 'pnpm@10.4.1+sha512.fixture' } };
test('accepts matching explicit runtime and package-manager pins', () => {
  assert.deepEqual(checkRuntime(valid), { node: '22.23.2', pnpm: '10.4.1' });
});
test('rejects wrong runtimes, package managers, missing identity and inconsistent pins', () => {
  for (const override of [
    { nodeVersion: 'v24.19.0' }, { userAgent: 'pnpm/11.0.0' }, { userAgent: 'npm/10.4.1' },
    { userAgent: undefined }, { expectedNode: '22.x' },
    { manifest: { ...valid.manifest, engines: { node: '22.23.2', pnpm: '10.5.0' } } },
    { manifest: { ...valid.manifest, packageManager: 'npm@10.4.1' } },
  ]) assert.throws(() => checkRuntime({ ...valid, ...override }));
});
