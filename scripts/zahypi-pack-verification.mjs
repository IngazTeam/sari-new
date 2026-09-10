import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function assertSourceClaim(sourceSha, actualSha, changedPaths) {
  if (sourceSha !== actualSha) throw new Error("Package SHA must match the current checkout HEAD");
  if (changedPaths.length) throw new Error("Commit runtime, contract, gate and builder changes before building a source-pinned delivery");
}

export function assertCurrentPackSource(sourceSha) {
  const options = { encoding: "utf8" };
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
  const paths = [
    "server", "client", "shared", "drizzle", "package.json", "pnpm-lock.yaml", "vitest.config.ts",
    ".github/workflows/ci.yml", ".node-version", ".gitattributes", "scripts/deploy-production.sh",
    "scripts/build-zahypi-requirements-pack.mjs", "scripts/zahypi-pack-*.mjs",
  ];
  const modified = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...paths], options);
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", ...paths], options);
  assertSourceClaim(sourceSha, actualSha, `${modified}\n${untracked}`.split(/\r?\n/).filter(Boolean));
}

export async function collectSafeLocalTestEvidence(sourceSha) {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const gates = ["pretest:zahypi", "test:zahypi", "pretest:release", "test:release"];
  const testFiles = new Set();
  for (const gate of gates) {
    const parts = manifest.scripts[gate]?.split(/\s+/);
    if (parts?.[0] !== "vitest" || parts[1] !== "run") throw new Error("Unsupported verification gate command");
    for (const path of parts.slice(2)) {
      if (!/^server\/[A-Za-z0-9_./-]+\.test\.ts$/.test(path) || path.split("/").includes("..")) {
        throw new Error("Unsafe verification test path");
      }
      testFiles.add(path);
    }
  }
  const directory = await mkdtemp(join(tmpdir(), "sari-pack-evidence-"));
  const outputPath = join(directory, "vitest.json");
  const env = { ...process.env, NODE_ENV: "test" };
  delete env.DATABASE_URL;
  delete env.RUN_MYSQL_INTEGRATION;
  try {
    try {
      execFileSync(process.execPath, [
        "node_modules/vitest/vitest.mjs", "run", ...[...testFiles].sort(),
        "--reporter=json", `--outputFile=${outputPath}`,
      ], { env, encoding: "utf8", timeout: 120_000, maxBuffer: 8_000_000, stdio: "pipe" });
    } catch {
      throw new Error("Local verification failed; rerun pnpm test:zahypi and pnpm test:release. No delivery was published.");
    }
    const result = JSON.parse(await readFile(outputPath, "utf8"));
    if (!result.success || result.numFailedTests || result.numFailedTestSuites
      || result.testResults.length !== testFiles.size || result.numPassedTests < 1) {
      throw new Error("Incomplete or failing verification evidence");
    }
    // Prove the source did not drift while the gates were running.
    assertCurrentPackSource(sourceSha);
    return {
      source_sha: sourceSha, status: result.numPendingTests ? "PASS_WITH_SKIP" : "PASS",
      executed_at: new Date().toISOString(), node_version: process.version,
      platform: process.platform, gates, files: result.testResults.length,
      tests: { passed: result.numPassedTests, failed: result.numFailedTests, skipped: result.numPendingTests },
      verification: "deduplicated local Vitest gates; provider and connector responses mocked; no live E2E or MySQL integration",
      test_files: [...testFiles].sort(),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
