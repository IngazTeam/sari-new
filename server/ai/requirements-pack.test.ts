import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";

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

    const zip = await JSZip.loadAsync(await readFile(firstOutput), { checkCRC32: true });
    const entries = Object.keys(zip.files);
    const root = "SARI_ZAHYPI_REQUIREMENTS_PACK_2026-08-29";

    expect(entries).toContain(`${root}/MANIFEST.json`);
    expect(entries).toContain(`${root}/MANIFEST.sha256`);
    expect(entries).toContain(`${root}/02_SARI_TASK_CATALOG.json`);
    expect(entries).toContain(`${root}/ZAHYPI_CONNECTOR.json`);
    expect(entries.some((entry) => entry.startsWith("/") || entry.includes("../"))).toBe(false);
    expect(entries.some((entry) => entry.endsWith(".zip"))).toBe(false);
    expect(new Set(entries.map((entry) => entry.split("/")[0]))).toEqual(new Set([root]));
    expect(new Set(entries.map((entry) => entry.toLowerCase())).size).toBe(entries.length);
    for (const entry of Object.values(zip.files)) {
      expect(entry.date.toISOString()).toBe("2000-01-01T00:00:00.000Z");
      expect(entry.unixPermissions).toBe(0o100644);
      expect(entry.dir).toBe(false);
    }

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

    const archiveContent = (await Promise.all(Object.values(zip.files).map((entry) =>
      entry.async("text"),
    ))).join("\n");
    expect(archiveContent).not.toMatch(
      /(?:sk-[A-Za-z0-9_-]{20,}|bearer\s+[A-Za-z0-9._-]{20,}|password\s*[=:])/i,
    );

    const readJson = async (relativePath: string) => JSON.parse(
      await zip.file(`${root}/${relativePath}`)!.async("text"),
    );
    const catalog = await readJson("02_SARI_TASK_CATALOG.json");
    expect(catalog.source_sha).toBe(options.sourceSha);
    expect(catalog.task_count).toBe(SARI_TASK_CATALOG.length);
    expect(catalog.tasks[0]).toMatchObject({
      task_type: SARI_TASK_CATALOG[0].taskType,
      business_name_ar: SARI_TASK_CATALOG[0].businessNameAr,
      data_classification: SARI_TASK_CATALOG[0].dataClassification,
      human_review: SARI_TASK_CATALOG[0].humanReviewRequired,
    });
    expect(catalog.tasks[0]).not.toHaveProperty("taskType");

    expect(await readJson("ZAHYPI_CONNECTOR.json")).toEqual({
      connector_type: "http-bootstrap-v1",
      project_slug: "sari",
      base_url: "https://sary.live",
      bootstrap_path: "/zahypi/bootstrap",
      verify_path: "/zahypi/verify",
      secret_env_ref: "SARI_BOOTSTRAP_SECRET",
    });

    const firstTask = SARI_TASK_CATALOG[0].taskType;
    const golden = await readJson(`tasks/${firstTask}/golden.cases.json`);
    expect(golden.cases).toHaveLength(5);
    expect(golden.cases[0]).toMatchObject({
      schema_valid: true,
      input: SARI_TASK_CATALOG[0].goldenCases[0].input,
      expected_output: SARI_TASK_CATALOG[0].goldenCases[0].expected,
    });
    expect((await readJson(`tasks/${firstTask}/rejection.cases.json`)).cases).toHaveLength(5);

    const checksumManifest = await zip.file(`${root}/MANIFEST.sha256`)!.async("text");
    expect(checksumManifest).not.toContain("MANIFEST.json");
    const manifest = await readJson("MANIFEST.json");
    expect(manifest).toMatchObject({
      package: root,
      project_slug: "sari",
      source_sha: options.sourceSha,
      task_count: catalog.task_count,
      files_excluding_manifest_and_checksums: entries.length - 2,
    });
    expect(new Set(manifest.files.map((entry: { path: string }) => `${root}/${entry.path}`))).toEqual(
      new Set(entries.filter((entry) => !entry.endsWith("/MANIFEST.json") && !entry.endsWith("/MANIFEST.sha256"))),
    );
    expect(checksumManifest.trim().split("\n")).toHaveLength(manifest.files.length);
    for (const entry of manifest.files) {
      const bytes = await zip.file(`${root}/${entry.path}`)!.async("nodebuffer");
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
      expect(checksumManifest).toContain(`${entry.sha256}  ${entry.path}\n`);
    }
    expect((await buildZahyPiRequirementsPack({ ...options, outputPath: firstOutput })).sha256).toBe(first.sha256);
  });

  it.each([
    "sari.../../escape",
    "sari.bad/name",
    "sari.bad\\name",
    "SARI.uppercase",
    "C:/outside",
  ])("rejects unsafe task names before creating output: %s", async (taskType) => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, "rejected.zip");
    await expect(buildZahyPiRequirementsPack({
      outputPath,
      sourceSha: "a".repeat(40),
      releaseDate: "2026-09-10",
      catalog: [{ ...SARI_TASK_CATALOG[0], taskType }],
    })).rejects.toThrow(/safe and globally unique/);
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects duplicate task names and colliding aliases instead of silently overwriting files", async () => {
    const directory = await temporaryDirectory();
    const options = { outputPath: join(directory, "duplicate.zip"), sourceSha: "a".repeat(40), releaseDate: "2026-09-10" };
    await expect(buildZahyPiRequirementsPack({ ...options, catalog: [SARI_TASK_CATALOG[0], SARI_TASK_CATALOG[0]] }))
      .rejects.toThrow(/globally unique/);
    await expect(buildZahyPiRequirementsPack({ ...options, catalog: [
      SARI_TASK_CATALOG[0],
      { ...SARI_TASK_CATALOG[1], aliases: [SARI_TASK_CATALOG[0].taskType] },
    ] })).rejects.toThrow(/globally unique/);
  });

  it.each(["2026-02-30", "2026-13-01", "../2026-09-10"])("rejects invalid release dates: %s", async (releaseDate) => {
    const directory = await temporaryDirectory();
    await expect(buildZahyPiRequirementsPack({
      outputPath: join(directory, "invalid.zip"), sourceSha: "a".repeat(40), releaseDate,
    })).rejects.toThrow(/valid YYYY-MM-DD/);
  });

  it("preserves an existing delivery when validation fails or new bytes differ", async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, "existing.zip");
    const original = Buffer.from("existing delivery must survive");
    await writeFile(outputPath, original);
    const options = { outputPath, sourceSha: "a".repeat(40), releaseDate: "2026-09-10" };
    await expect(buildZahyPiRequirementsPack(options)).rejects.toThrow(/already exists/);
    await expect(buildZahyPiRequirementsPack({ ...options, catalog: [{
      ...SARI_TASK_CATALOG[0],
      sampleInput: { ...SARI_TASK_CATALOG[0].sampleInput, message: `sk-${"x".repeat(32)}` },
    }] })).rejects.toThrow(/Possible secret/);
    await expect(buildZahyPiRequirementsPack({ ...options, catalog: [{
      ...SARI_TASK_CATALOG[0], businessNameAr: "ض".repeat(8_000_001),
    }] })).rejects.toThrow(/payload exceeds/);
    expect(await readFile(outputPath)).toEqual(original);
  });
});
