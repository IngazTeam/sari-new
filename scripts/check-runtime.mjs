import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkRuntime({ nodeVersion, userAgent, expectedNode, manifest, requirePnpm = false }) {
  const expectedPnpm = /^pnpm@([0-9]+\.[0-9]+\.[0-9]+)(?:\+|$)/.exec(manifest.packageManager)?.[1];
  if (!/^\d+\.\d+\.\d+$/.test(expectedNode) || manifest.engines.node !== expectedNode
      || !expectedPnpm || manifest.engines.pnpm !== expectedPnpm) {
    throw new Error('Runtime pins disagree: .node-version, engines and packageManager must match');
  }
  if (nodeVersion.replace(/^v/, '') !== expectedNode) {
    throw new Error(`Node ${expectedNode} is required; received ${nodeVersion}`);
  }
  const pnpmVersion = /(?:^|\s)pnpm\/([^\s]+)/.exec(userAgent || '')?.[1];
  if ((requirePnpm || userAgent) && pnpmVersion !== expectedPnpm) {
    throw new Error(`Run this command using repository-pinned pnpm ${expectedPnpm}`);
  }
  return { node: expectedNode, pnpm: expectedPnpm };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = checkRuntime({
      nodeVersion: process.version,
      userAgent: process.env.npm_config_user_agent,
      expectedNode: readFileSync(new URL('../.node-version', import.meta.url), 'utf8').trim(),
      manifest: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')),
      requirePnpm: process.argv.includes('--require-pnpm'),
    });
    console.log(`[runtime] Node ${result.node}; pnpm ${result.pnpm}`);
  } catch (error) {
    console.error(`[runtime] ${error.message}`);
    process.exitCode = 1;
  }
}
