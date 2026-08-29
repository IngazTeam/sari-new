import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildZahyPiRequirementsPack } from "../../scripts/build-zahypi-requirements-pack.mjs";
import { SARI_TASK_CATALOG } from "./task-catalog";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true }),
  ));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sari-zahypi-pack-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

describe("buildZahyPiRequirementsPack", () => {
  it("builds a deterministic, bounded and complete governed package", async () => {
    const firstDirectory = await temporaryDirectory();
    const secondDirectory = await temporaryDirectory();
    const firstOutput = join(firstDirectory, "requirements.zip");
    const secondOutput = join(secondDirectory, "requirements.zip");
    const options = {
      sourceSha: "a".repeat(40),
      releaseDate: "2026-08-29",
      catalog: SARI_TASK_CATALOG,
    } as const;

    const first = await buildZahyPiRequirementsPack({ ...options, outputPath: firstOutput });
    const second = await buildZahyPiRequirementsPack({ ...options, outputPath: secondOutput });

    expect(first.taskCount).toBe(SARI_TASK_CATALOG.length);
    expect(first.byteLength).toBeLessThanOrEqual(1_500_000);
    expect(await sha256(firstOutput)).toBe(await sha256(secondOutput));

    const entries = execFileSync("unzip", ["-Z1", firstOutput], { encoding: "utf8" })
      .trim()
      .split("\n");
    const root = "SARI_ZAHYPI_REQUIREMENTS_PACK_2026-08-29";

    expect(entries).toContain(`${root}/MANIFEST.json`);
    expect(entries).toContain(`${root}/MANIFEST.sha256`);
    expect(entries).toContain(`${root}/02_SARI_TASK_CATALOG.json`);
    expect(entries).toContain(`${root}/ZAHYPI_CONNECTOR.json`);
    expect(entries.some((entry) => entry.startsWith("/") || entry.includes("../"))).toBe(false);
    expect(entries.some((entry) => entry.endsWith(".zip"))).toBe(false);

    for (const contract of SARI_TASK_CATALOG) {
      const taskRoot = `${root}/tasks/${contract.taskType}`;
      for (const fileName of [
        "requirements.md",
        "input.schema.json",
        "output.schema.json",
        "sample.input.json",
        "sample.output.json",
        "rejection.cases.json",
        "golden.cases.json",
        "integration.md",
      ]) {
        expect(entries).toContain(`${taskRoot}/${fileName}`);
      }
    }

    const archiveContent = execFileSync("unzip", ["-p", firstOutput], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(archiveContent).not.toMatch(
      /(?:sk-[A-Za-z0-9_-]{20,}|bearer\s+[A-Za-z0-9._-]{20,}|password\s*[=:])/i,
    );

    const readJson = (relativePath: string) => JSON.parse(execFileSync(
      "unzip",
      ["-p", firstOutput, `${root}/${relativePath}`],
      { encoding: "utf8" },
    ));
    const catalog = readJson("02_SARI_TASK_CATALOG.json");
    expect(catalog.source_sha).toBe(options.sourceSha);
    expect(catalog.task_count).toBe(SARI_TASK_CATALOG.length);
    expect(catalog.tasks[0]).toMatchObject({
      task_type: SARI_TASK_CATALOG[0].taskType,
      business_name_ar: SARI_TASK_CATALOG[0].businessNameAr,
      data_classification: SARI_TASK_CATALOG[0].dataClassification,
      human_review: SARI_TASK_CATALOG[0].humanReviewRequired,
    });
    expect(catalog.tasks[0]).not.toHaveProperty("taskType");

    expect(readJson("ZAHYPI_CONNECTOR.json")).toEqual({
      connector_type: "http-bootstrap-v1",
      project_slug: "sari",
      base_url: "https://sary.live",
      bootstrap_path: "/zahypi/bootstrap",
      verify_path: "/zahypi/verify",
      secret_env_ref: "SARI_BOOTSTRAP_SECRET",
    });

    const firstTask = SARI_TASK_CATALOG[0].taskType;
    const golden = readJson(`tasks/${firstTask}/golden.cases.json`);
    expect(golden.cases).toHaveLength(5);
    expect(golden.cases[0]).toMatchObject({
      schema_valid: true,
      input: SARI_TASK_CATALOG[0].goldenCases[0].input,
      expected_output: SARI_TASK_CATALOG[0].goldenCases[0].expected,
    });
    expect(readJson(`tasks/${firstTask}/rejection.cases.json`).cases).toHaveLength(5);

    const checksumManifest = execFileSync(
      "unzip",
      ["-p", firstOutput, `${root}/MANIFEST.sha256`],
      { encoding: "utf8" },
    );
    expect(checksumManifest).not.toContain("MANIFEST.json");
  });
});
