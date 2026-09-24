const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`); return args[i + 1]; };
const source = path.resolve(option('--source-root'));
const baselineFile = option('--baseline'), currentFile = option('--current'), output = option('--output');
const hash = data => createHash('sha256').update(data).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const corpusBytes = fs.readFileSync(path.join(source, 'scripts/testing/fixtures/sales-decision-corpus.v1.json'));
const corpus = JSON.parse(corpusBytes), manifest = read(path.join(source, 'scripts/testing/fixtures/sales-decision-corpus.v1.manifest.json'));
if (hash(corpusBytes) !== manifest.corpusSha256 || corpus.cases.length !== manifest.caseCount) throw Error('Frozen corpus changed');
function validate(file) {
  const report = read(file);
  if (report.corpusSha256 !== manifest.corpusSha256 || report.results.length !== corpus.cases.length
    || report.total !== corpus.cases.length || report.liveModelCalls !== 0) throw Error('Report scope differs');
  for (const [index, row] of report.results.entries()) {
    const expected = corpus.cases[index];
    for (const key of ['id', 'family', 'language', 'critical', 'input', 'expected']) {
      if (JSON.stringify(row[key]) !== JSON.stringify(expected[key])) throw Error(`Changed expectation: ${expected.id}`);
    }
    const mismatches = Object.keys(expected.expected).filter(key => row.actual[key] !== expected.expected[key]);
    if (JSON.stringify(mismatches) !== JSON.stringify(row.mismatches) || row.passed !== !mismatches.length) throw Error('Invalid result');
  }
  if (report.passed !== report.results.filter(row => row.passed).length || report.failed !== report.total - report.passed
    || report.critical !== report.results.filter(row => row.critical).length
    || report.criticalPassed !== report.results.filter(row => row.critical && row.passed).length) throw Error('Invalid totals');
  return report;
}
const baseline = validate(baselineFile), current = validate(currentFile);
const baselineHead = execFileSync('git', ['rev-parse', manifest.baselineHead], { encoding: 'utf8', windowsHide: true }).trim();
const baselineSourceBlobs = {};
for (const [file, digest] of Object.entries(baseline.sourceSha256)) {
  if (!Object.hasOwn(current.sourceSha256, file) || !/^server\/ai\/[a-z-]+\.ts$/.test(file)) throw Error('Unexpected baseline source');
  const raw = execFileSync('git', ['show', `${baselineHead}:${file}`], { windowsHide: true });
  const lf = raw.toString('utf8').replaceAll('\r\n', '\n');
  if (![hash(raw), hash(lf), hash(lf.replaceAll('\n', '\r\n'))].includes(digest)) throw Error(`Baseline differs from recorded commit: ${file}`);
  baselineSourceBlobs[file] = execFileSync('git', ['rev-parse', `${baselineHead}:${file}`], { encoding: 'utf8', windowsHide: true }).trim();
}
for (const [file, digest] of Object.entries(current.sourceSha256)) {
  if (!Object.hasOwn(baseline.sourceSha256, file) || hash(fs.readFileSync(path.join(source, file))) !== digest) throw Error(`Untested current source: ${file}`);
}
const runner = hash(fs.readFileSync(path.join(source, 'server/ai/sales-decision-benchmark.test.ts')));
if (current.runnerSha256 !== runner || baseline.runnerSha256 !== runner) throw Error('Baseline and final runners differ');
if (current.failed || current.criticalPassed !== current.critical) throw Error('Decision acceptance failed');
const regressions = current.results.filter((row, i) => !row.passed && baseline.results[i].passed).map(row => row.id);
const repaired = current.results.filter((row, i) => row.passed && !baseline.results[i].passed).map(row => row.id);
const summary = report => ({ total: report.total, passed: report.passed, failed: report.failed, critical: report.critical, criticalPassed: report.criticalPassed });
const comparison = { generatedAt: new Date().toISOString(), scope: corpus.scope, corpusSha256: manifest.corpusSha256,
  baselineHead, baselineSourceBlobs, baselineReportSha256: hash(fs.readFileSync(baselineFile)),
  currentReportSha256: hash(fs.readFileSync(currentFile)), runnerSha256: runner, baseline: summary(baseline), current: summary(current),
  repaired, regressions, realModelQualityMeasured: false, independentHoldout: false, businessLiftMeasured: false };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(comparison, null, 2) + '\n');
console.log(JSON.stringify({ baseline: comparison.baseline, current: comparison.current, repaired: repaired.length, regressions: regressions.length }));
