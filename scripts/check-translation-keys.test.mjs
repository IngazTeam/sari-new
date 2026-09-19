import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function audit(source) {
  const directory = mkdtempSync(join(tmpdir(), 'sari-translation-audit-'));
  try {
    writeFileSync(join(directory, 'fixture.tsx'), source);
    const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/check-translation-keys.ts'), '--root', directory], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.error, undefined);
    return { status: result.status, report: JSON.parse(result.stdout) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test('translation gate accepts real keys and literal template documentation', () => {
  const result = audit("t('aiBudget.title'); t('whatsAppAutoNotifications.auto_5', {skipInterpolation: true});");
  assert.equal(result.status, 0);
  assert.equal(result.report.callsChecked, 2);
});
test('translation gate refuses missing keys even with a fallback', () => {
  const result = audit("t('deliberatelyMissing.translationProbe', 'fallback');");
  assert.equal(result.status, 1);
  assert.equal(result.report.missing[0].key, 'deliberatelyMissing.translationProbe');
});
test('translation gate refuses unknown dynamic keys and missing interpolation values', () => {
  const result = audit("t(arbitraryKey); t('whatsAppAutoNotifications.auto_5');");
  assert.equal(result.status, 1);
  assert.equal(result.report.unresolvedDynamicCalls.length, 1);
  assert.ok(result.report.interpolationErrors[0].missing.includes('customerName'));
});
