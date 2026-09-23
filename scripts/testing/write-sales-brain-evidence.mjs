import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const destination = resolve('docs/audits/sales-brain-implementation-2026-09-23');
mkdirSync(destination, { recursive: true });
const reports = ['unit', 'database', 'regression', 'legacy-sales', 'budget', 'security'].map(name => {
  const raw = JSON.parse(readFileSync(resolve(`.tmp/sales-brain-evidence/${name}.json`), 'utf8'));
  if (!raw.success || raw.numFailedTests || raw.numFailedTestSuites) throw new Error(`Acceptance report ${name} contains failures`);
  return { name, passed: raw.numPassedTests, failed: raw.numFailedTests, pending: raw.numPendingTests,
    startedAt: new Date(raw.startTime).toISOString(), tests: raw.testResults.flatMap(file => file.assertionResults.map(test => ({
      file: file.name.replaceAll('\\', '/').replace(`${process.cwd().replaceAll('\\', '/')}/`, ''),
      name: test.fullName, status: test.status, durationMs: test.duration,
    }))) };
});
const priorEvidence = JSON.parse(readFileSync(resolve(destination, 'evidence.json'), 'utf8'));
const changedFiles = [...new Set([...Object.keys(priorEvidence.sourceGitBlobs ?? {}),
  ...execFileSync('git', ['ls-files', '-m', '--others', '--exclude-standard'], { encoding: 'utf8', windowsHide: true })
    .trim().split(/\r?\n/).filter(file => /^(server|client|shared|drizzle|scripts|\.github)\//.test(file))])];
const sourceHashes = Object.fromEntries(changedFiles.sort().map(file => [file,
  createHash('sha256').update(readFileSync(file)).digest('hex')]));
// Git applies line-ending filters on Windows. Record filtered blob identities too,
// so the final commit can be verified against these exact tested source files.
const sourceGitBlobs = Object.fromEntries(changedFiles.map(file => [file,
  execFileSync('git', ['hash-object', `--path=${file}`, file], { encoding: 'utf8', windowsHide: true }).trim()]));
const uniqueTests = new Map();
for (const report of reports) for (const test of report.tests) {
  const key = `${test.file}\n${test.name}`;
  const previous = uniqueTests.get(key);
  if (previous && previous !== test.status) throw new Error(`Conflicting results for ${key}`);
  uniqueTests.set(key, test.status);
}
const verification = Object.fromEntries(['build', 'types', 'translations', 'schema'].map(name => {
  const file = `.tmp/brain-final-${name}.log`;
  const content = readFileSync(resolve(file), 'utf8');
  if (name === 'types' && content.trim()) throw new Error('Type-check report is not clean');
  if (name === 'build' && !/\[bundle-budget\] index-[^\s]+\.js: \d+ bytes raw \/ \d+ bytes gzip/.test(content)) throw new Error('Build completion must be verified');
  if (name === 'schema' && !content.includes("Everything's fine")) throw new Error('Drizzle schema history check failed');
  if (name === 'translations') {
    const result = JSON.parse(content);
    if (result.missing.length || result.interpolationErrors.length || result.unresolvedDynamicCalls.length) throw new Error('Translation check failed');
  }
  return [name, { log: file, sha256: createHash('sha256').update(content).digest('hex'), output: content.trim().slice(-2500) }];
}));
const evidence = { generatedAt: new Date().toISOString(),
  baselineHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
  capturedFrom: 'Working tree before commit; sourceGitBlobs verifies the committed source tree despite Windows line-ending conversion', node: process.version,
  lockfileSha256: createHash('sha256').update(readFileSync('pnpm-lock.yaml')).digest('hex'), sourceHashes, sourceGitBlobs, reports,
  productionChanged: false, realProviderQualityMeasured: false, businessLiftMeasured: false,
  externalNetwork: 'blocked by run-isolated.mjs in these tests',
  database: `local disposable MySQL 8.0; synthetic customers; migrations 0000 through ${JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')).entries.at(-1).tag}`,
  sourceScope: 'Previous sales-brain source scope plus current changed source, including shared modules; all hashes recalculated from current files',
  securityScope: 'Local behavioral adversarial tests plus source contracts; not an independent authenticated production penetration assessment.',
  publicSurface: JSON.parse(readFileSync(resolve(destination, 'public-surface.json'), 'utf8')),
  testCountsMayOverlapAcrossReports: true,
  uniqueTests: { passed: Array.from(uniqueTests.values()).filter(status => status === 'passed').length,
    skipped: Array.from(uniqueTests.values()).filter(status => status === 'pending' || status === 'skipped').length },
  verification,
  componentUi: JSON.parse(readFileSync(resolve(destination, 'ui/results.json'), 'utf8')),
};
if (evidence.componentUi.errors.length || evidence.componentUi.results.some(result => !result.passed)) throw new Error('Component UI verification failed');
writeFileSync(resolve(destination, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(`Wrote evidence for ${reports.reduce((total, report) => total + report.passed, 0)} passing tests and ${changedFiles.length} source files.`);
