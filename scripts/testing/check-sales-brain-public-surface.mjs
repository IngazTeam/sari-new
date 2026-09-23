import { writeFileSync } from 'node:fs';

// A bounded, unauthenticated read-only check. No cookies, credentials, scanning or writes.
// Deliberately explicit: the approved production host cannot be overridden with untrusted input.
const paths = ['/', '/login', '/api/trpc/sariBrain.getLearningDashboard', '/api/trpc/orders.listByMerchant'];
const results = [];
for (const path of paths) {
  const started = Date.now();
  try {
    const response = await fetch(`https://sary.live${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const headers = Object.fromEntries(['content-type', 'strict-transport-security', 'content-security-policy',
      'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'access-control-allow-origin', 'location']
      .map(name => [name, response.headers.get(name)]));
    // Do not persist response bodies, cookie values, customer information or tokens.
    let rpcCode = null;
    if (path.startsWith('/api/trpc/') && response.headers.get('content-type')?.includes('json')) {
      const body = await response.json();
      rpcCode = body?.error?.json?.data?.code ?? body?.error?.data?.code ?? null;
    } else await response.body?.cancel();
    results.push({ path, status: response.status, rpcCode, durationMs: Date.now() - started, headers });
  } catch { results.push({ path, error: 'request_failed', durationMs: Date.now() - started }); }
}
const report = { checkedAt: new Date().toISOString(), host: 'sary.live', method: 'GET', authenticated: false,
  productionMutated: false, localChangesDeployed: false, requests: paths.length, results };
writeFileSync('docs/audits/sales-brain-implementation-2026-09-23/public-surface.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(results.map(({ path, status, rpcCode, error }) => ({ path, status, rpcCode, error }))));
