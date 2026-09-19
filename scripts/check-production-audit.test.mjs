import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProductionAudit } from './check-production-audit.mjs';

function result(severities = []) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  const advisories = {};
  severities.forEach((severity, id) => {
    counts[severity]++;
    advisories[id] = { severity, module_name: 'fixture', url: `https://example.test/advisory/${id}` };
  });
  return { status: severities.length ? 1 : 0, signal: null,
    stdout: JSON.stringify({ advisories, metadata: { vulnerabilities: counts } }) };
}

test('accepts a complete clean report and supported lower severity debt', () => {
  assert.deepEqual(evaluateProductionAudit(result()), { info: 0, low: 0, moderate: 0, high: 0, critical: 0 });
  assert.equal(evaluateProductionAudit(result(['moderate', 'low'])).moderate, 1);
});
for (const severity of ['high', 'critical']) {
  test(`blocks ${severity} findings`, () => {
    assert.throws(() => evaluateProductionAudit(result([severity])), new RegExp(severity));
  });
}
for (const status of [0, 1]) {
  test(`fails closed for a JSON registry error even with exit ${status}`, () => {
    assert.throws(() => evaluateProductionAudit({ status, stdout: JSON.stringify({ error: { code: 'ERR_REGISTRY' } }) }));
    const conflicting = JSON.parse(result().stdout);
    conflicting.error = { code: 'ERR_REGISTRY' };
    assert.throws(() => evaluateProductionAudit({ status, stdout: JSON.stringify(conflicting) }));
  });
}
for (const stdout of ['', '{', '{}', 'null', '[]', '{"advisories":{}}']) {
  test(`rejects incomplete/unparseable output ${JSON.stringify(stdout)}`, () => {
    assert.throws(() => evaluateProductionAudit({ status: 0, stdout }));
  });
}
for (const failure of [{ status: null, error: new Error('spawn') }, { signal: 'SIGTERM' },
  { error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) }, { status: 2 }, { status: 1 }]) {
  test(`rejects unsuccessful process ${JSON.stringify(failure)}`, () => {
    assert.throws(() => evaluateProductionAudit({ ...result(), ...failure }));
  });
}
test('rejects mismatched totals and invalid severity/counts instead of trusting either half', () => {
  for (const tamper of [
    report => { report.metadata.vulnerabilities.high = 1; },
    report => { delete report.metadata.vulnerabilities.low; },
    report => { report.metadata.vulnerabilities.moderate = -1; },
    report => { report.metadata.vulnerabilities.low = '0'; },
    report => { report.advisories.x = { severity: 'unknown', module_name: 'fixture', url: 'https://example.test' }; },
    report => { report.advisories = []; },
  ]) {
    const report = JSON.parse(result().stdout);
    tamper(report);
    assert.throws(() => evaluateProductionAudit({ status: 0, stdout: JSON.stringify(report) }));
  }
});
test('does not expose registry secrets in diagnostics', () => {
  assert.throws(() => evaluateProductionAudit({ status: 0, stdout: 'private-token', stderr: 'private-token' }),
    error => !error.message.includes('private-token'));
});
