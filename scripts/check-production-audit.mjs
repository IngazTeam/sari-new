import { spawnSync } from 'node:child_process';

const pnpmExecPath = process.env.npm_execpath;
const command = pnpmExecPath ? process.execPath : (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
const args = pnpmExecPath
  ? [pnpmExecPath, 'audit', '--prod', '--json']
  : ['audit', '--prod', '--json'];
const audit = spawnSync(command, args, {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  shell: false,
});

if (audit.error) throw audit.error;

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  throw new Error(`Unable to parse pnpm audit output: ${audit.stderr || error}`);
}

const advisories = Object.values(report.advisories ?? {});
const critical = advisories.filter((advisory) => advisory.severity === 'critical');
const high = advisories.filter((advisory) => advisory.severity === 'high');

if (critical.length > 0) {
  throw new Error(`Production audit found ${critical.length} critical advisories`);
}

if (high.length > 0) {
  const summary = high.map((advisory) => `${advisory.module_name}: ${advisory.url}`).join(', ');
  throw new Error(`Production audit found ${high.length} high advisories: ${summary}`);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `[dependency-audit] critical=0; high=0; ` +
  `moderate=${counts.moderate ?? 0}; low=${counts.low ?? 0}`,
);
