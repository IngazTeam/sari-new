import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validate the pinned pnpm audit contract before making any security decision. */
export function evaluateProductionAudit(audit) {
  if (audit.error || audit.signal || ![0, 1].includes(audit.status)) {
    throw new Error('Dependency audit could not complete; no security result is available');
  }
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    // Registry responses/stderr may contain credentials or proxy URLs.
    throw new Error('Dependency audit returned invalid JSON; no security result is available');
  }
  if (!isRecord(report) || Object.hasOwn(report, 'error') || !isRecord(report.advisories)
      || !isRecord(report.metadata) || !isRecord(report.metadata.vulnerabilities)) {
    throw new Error('Dependency audit returned an error or unsupported report structure');
  }
  const counts = report.metadata.vulnerabilities;
  const advisories = Object.values(report.advisories);
  for (const advisory of advisories) {
    if (!isRecord(advisory) || !severities.includes(advisory.severity)
        || typeof advisory.module_name !== 'string' || !advisory.module_name.trim()
        || typeof advisory.url !== 'string' || !/^https:\/\//.test(advisory.url)) {
      throw new Error('Dependency audit contains an invalid advisory');
    }
  }
  for (const severity of severities) {
    if (!Number.isSafeInteger(counts[severity]) || counts[severity] < 0
        || counts[severity] !== advisories.filter(item => item.severity === severity).length) {
      throw new Error(`Dependency audit has inconsistent ${severity} totals`);
    }
  }
  if (audit.status === 1 && advisories.length === 0) {
    throw new Error('Dependency audit failed without a vulnerability result');
  }
  const critical = advisories.filter(advisory => advisory.severity === 'critical');
  const high = advisories.filter(advisory => advisory.severity === 'high');
  if (critical.length > 0) {
    throw new Error(`Production audit found ${critical.length} critical advisories`);
  }
  if (high.length > 0) {
    const summary = high.map(advisory => `${advisory.module_name}: ${advisory.url}`).join(', ');
    throw new Error(`Production audit found ${high.length} high advisories: ${summary}`);
  }
  return { info: counts.info, low: counts.low, moderate: counts.moderate, high: 0, critical: 0 };
}

export function runProductionAudit() {
  const pnpmExecPath = process.env.npm_execpath;
  const command = pnpmExecPath ? process.execPath : 'pnpm';
  const args = pnpmExecPath
    ? [pnpmExecPath, 'audit', '--prod', '--json']
    : ['audit', '--prod', '--json'];
  const audit = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
    // Only fixed arguments are passed to the Windows command shim fallback.
    shell: !pnpmExecPath && process.platform === 'win32',
    windowsHide: true,
  });
  const counts = evaluateProductionAudit(audit);
  console.log(`[dependency-audit] critical=0; high=0; moderate=${counts.moderate}; low=${counts.low}`);
  return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runProductionAudit();
  } catch (error) {
    console.error(`[dependency-audit] ${error.message}`);
    process.exitCode = 1;
  }
}
