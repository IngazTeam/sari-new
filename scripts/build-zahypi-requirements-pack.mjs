import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { SARI_TASK_CATALOG } from "../server/ai/task-catalog.ts";

const execFileAsync = promisify(execFile);
const MAX_ARCHIVE_BYTES = 1_500_000;
const FIXED_ARCHIVE_TIME = new Date("2000-01-01T00:00:00.000Z");
const REQUIRED_TASK_FILES = [
  "requirements.md",
  "input.schema.json",
  "output.schema.json",
  "sample.input.json",
  "sample.output.json",
  "rejection.cases.json",
  "golden.cases.json",
  "integration.md",
];
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/i,
  /\bbearer\s+[A-Za-z0-9._-]{20,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:api[_-]?key|secret|token)\s*[=:]\s*["']?[A-Za-z0-9/+_.-]{20,}/i,
];

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function assertSafeRelativePath(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`Unsafe package path: ${path}`);
  }
  if (path.endsWith(".zip") || path.endsWith(".tar") || path.endsWith(".gz")) {
    throw new Error(`Nested archive is not allowed: ${path}`);
  }
}

function assertNoSecrets(path, content) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) throw new Error(`Possible secret detected in ${path}`);
  }
}

function markdownList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function taskRequirements(contract) {
  return `# ${contract.taskType}\n\n` +
    `- **الاسم التجاري:** ${contract.businessNameAr}\n` +
    `- **الحالة:** ${contract.status}\n` +
    `- **الأولوية:** ${contract.priority}\n` +
    `- **المالك التقني:** ${contract.owner}\n` +
    `- **التنفيذ:** ${contract.execution}\n` +
    `- **تصنيف البيانات:** ${contract.dataClassification}\n` +
    `- **المعالجة الخارجية:** ${contract.externalProcessing}\n` +
    `- **مراجعة بشرية:** ${contract.humanReviewRequired ? "مطلوبة" : "غير مطلوبة"}\n` +
    `- **المهلة:** ${contract.timeoutMs} ms\n` +
    `- **الفشل الآمن:** ${contract.fallback}\n\n` +
    `## User Story\n\n` +
    `بصفتي مستخدمًا مخولًا داخل tenant ساري، أريد تنفيذ ${contract.businessNameAr} من خلال عقد ` +
    `محكوم حتى تكون المدخلات والمخرجات والميزانية وسجل التنفيذ قابلة للتدقيق.\n\n` +
    `## ضوابط\n\n` +
    `- ينتج Draft أو تحليلًا فقط، ولا ينفذ أثرًا تجاريًا غير منصوص عليه في العقد.\n` +
    `- يثبت Sari ملكية المعرّفات للـtenant قبل الإرسال.\n` +
    `- لا يرسل سجل قاعدة بيانات مفتوحًا أو بيانات اعتماد أو محادثات حقيقية في أمثلة الاختبار.\n` +
    `- الاسم القديم، إن وجد، Alias فقط: ${contract.aliases.join(", ") || "لا يوجد"}.\n`;
}

function taskIntegration(contract) {
  const specializedEndpoints = {
    "sari.reply": "/v1/sari/reply",
    "sari.sales.next-best-action": "/v1/sari/next-action",
    "sari.conversations.analyze": "/v1/sari/conversations/analyze",
    "sari.outcome": "/v1/sari/outcome",
  };
  const specializedEndpoint = specializedEndpoints[contract.taskType];

  return `# Integration: ${contract.taskType}\n\n` +
    `- **المسار المحكوم:** ${specializedEndpoint || "/v1/jobs"}\n` +
    `- **المشروع:** sari\n` +
    `- **Tenant header:** X-ZahyPi-Tenant = merchant:<trusted-id>\n` +
    `- **Task header:** X-Task-Type = ${contract.taskType}\n` +
    `- **Idempotency:** مفتاح واحد للعملية الواحدة ويعاد استخدامه فقط عند retry لنفس body.\n` +
    `- **النجاح:** لا يقبل دون trace_id وrun_manifest_id ومخرج مطابق للـschema.\n` +
    `- **التراجع:** ${contract.fallback}. لا يوجد fallback تلقائي للبيانات الحمراء.\n\n` +
    `## مصادر الكود\n\n${markdownList(contract.sourceFiles.map((source) => `\`${source}\``))}\n`;
}

function topLevelFiles({ catalog, sourceSha, releaseDate }) {
  const inventoryRows = catalog.map((contract) =>
    `| \`${contract.taskType}\` | ${contract.businessNameAr} | ${contract.status} | ${contract.execution} | ${contract.priority} |`,
  );
  const securityRows = catalog.map((contract) =>
    `| \`${contract.taskType}\` | ${contract.dataClassification} | ${contract.externalProcessing} | ${contract.humanReviewRequired ? "نعم" : "لا"} | ${contract.fallback} |`,
  );
  const codeRows = catalog.flatMap((contract) => contract.sourceFiles.map((source) =>
    `| \`${contract.taskType}\` | \`${source}\` |`,
  ));
  const planned = catalog.filter((contract) => contract.status === "planned");

  return new Map([
    ["README.md", `# Sari ZahyPi Requirements Pack\n\nحزمة عقود آمنة مولدة حتميًا من كتالوج Sari عند SHA \`${sourceSha}\` بتاريخ ${releaseDate}.\n`],
    ["00_SYSTEM_SNAPSHOT.md", `# لقطة النظام\n\n- المستودع: IngazTeam/sari-new\n- الفرع الإنتاجي: main\n- Source SHA: \`${sourceSha}\`\n- Backend: Node.js + TypeScript + Express\n- Frontend: React\n- Database: MySQL + Drizzle ORM\n- Multi-tenancy: merchant ID موثوق من جلسة Sari ويُنقل كرأس tenant محكوم\n- Text/decision AI target: ZahyPi\n- Voice transcription and embeddings: OpenAI بحدود مستقلة\n- لا توجد بيئة staging دائمة ضمن هذا المسار\n`],
    ["01_AI_CAPABILITIES_INVENTORY.md", `# جرد قدرات الذكاء الاصطناعي\n\n| Task Type | القدرة | الحالة | التنفيذ | الأولوية |\n|---|---|---|---|---|\n${inventoryRows.join("\n")}\n`],
    ["02_SARI_TASK_CATALOG.json", stableJson({
      source_sha: sourceSha,
      task_count: catalog.length,
      tasks: catalog,
    })],
    ["03_DATA_SECURITY_MATRIX.md", `# مصفوفة أمن البيانات\n\n| Task Type | التصنيف | معالجة خارجية | مراجعة بشرية | الفشل الآمن |\n|---|---|---|---|---|\n${securityRows.join("\n")}\n`],
    ["04_UI_ACTION_MAP.md", `# خريطة التشغيل\n\nكل مهمة existing مرتبطة بمصدر إنتاج فعلي مذكور في خريطة الكود. المهام planned لا تفعّل حتى يضاف لها trigger داخل Sari وتجتاز المراجعة.\n`],
    ["05_CODE_MAP.md", `# خريطة الكود\n\n| Task Type | المصدر |\n|---|---|\n${codeRows.join("\n")}\n`],
    ["06_TEST_EVIDENCE.md", `# أدلة الاختبار المطلوبة\n\n- تحقق schema لكل input/output.\n- خمس Golden Cases وخمس Rejection Cases لكل مهمة.\n- عزل tenant A عن tenant B.\n- 401 و403 و429 وtimeout وcircuit-open.\n- تحقق trace_id وrun_manifest_id قبل قبول النجاح.\n`],
    ["07_OWNER_DECISIONS_REQUIRED.md", `# قرارات المالك\n\n${planned.length === 0 ? "لا توجد مهام planned." : planned.map((contract) => `- اعتماد trigger الإنتاجي للمهمة \`${contract.taskType}\`.`).join("\n")}\n`],
    ["DELIVERY_CHECKLIST.md", `# Delivery Checklist\n\n- [x] جرد المهام الحالية والمخططة\n- [x] Schemas مغلقة ومحدودة\n- [x] Golden/Rejection cases مصطنعة\n- [x] لا أسرار ولا بيانات عملاء\n- [x] أسماء aliases موثقة\n- [ ] Preview داخل ZahyPi\n- [ ] Validate وSimulation\n- [ ] Owner review ثم activation\n`],
    ["current-ai-contracts/README.md", `# العقود الحالية\n\nالمصدر القانوني للعقود هو \`server/ai/task-catalog.ts\`. لا تعدل نسخة الحزمة يدويًا.\n`],
  ]);
}

function taskFiles(contract) {
  return new Map([
    ["requirements.md", taskRequirements(contract)],
    ["input.schema.json", stableJson(contract.inputSchema)],
    ["output.schema.json", stableJson(contract.outputSchema)],
    ["sample.input.json", stableJson(contract.sampleInput)],
    ["sample.output.json", stableJson(contract.sampleOutput)],
    ["rejection.cases.json", stableJson(contract.rejectionCases)],
    ["golden.cases.json", stableJson(contract.goldenCases)],
    ["integration.md", taskIntegration(contract)],
  ]);
}

async function setDeterministicMetadata(rootPath, relativePaths) {
  const directories = new Set([rootPath]);

  for (const path of relativePaths) {
    const absolutePath = join(rootPath, ...path.split("/"));
    let current = dirname(absolutePath);
    while (current.startsWith(rootPath)) {
      directories.add(current);
      if (current === rootPath) break;
      current = dirname(current);
    }
    await chmod(absolutePath, 0o644);
    await utimes(absolutePath, FIXED_ARCHIVE_TIME, FIXED_ARCHIVE_TIME);
  }

  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    await chmod(directory, 0o755);
    await utimes(directory, FIXED_ARCHIVE_TIME, FIXED_ARCHIVE_TIME);
  }
}

export async function buildZahyPiRequirementsPack({
  outputPath,
  sourceSha,
  releaseDate,
  catalog = SARI_TASK_CATALOG,
}) {
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error("sourceSha must be a 40-character Git SHA");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new Error("releaseDate must use YYYY-MM-DD");
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error("catalog must not be empty");

  const workspace = await mkdtemp(join(tmpdir(), "sari-zahypi-build-"));
  const rootName = `SARI_ZAHYPI_REQUIREMENTS_PACK_${releaseDate}`;
  const rootPath = join(workspace, rootName);
  const files = topLevelFiles({ catalog, sourceSha, releaseDate });

  for (const contract of catalog) {
    for (const [fileName, content] of taskFiles(contract)) {
      files.set(`tasks/${contract.taskType}/${fileName}`, content);
    }
  }

  const normalizedFiles = new Map();
  for (const [path, rawContent] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    assertSafeRelativePath(path);
    const content = String(rawContent);
    assertNoSecrets(path, content);
    normalizedFiles.set(path, content);
  }

  const payloadEntries = [...normalizedFiles.entries()].map(([path, content]) => ({
    path,
    sha256: sha256(content),
    bytes: Buffer.byteLength(content),
  }));
  const manifestContent = stableJson({
    format: "sari-zahypi-requirements-pack/v1",
    source_sha: sourceSha,
    release_date: releaseDate,
    task_count: catalog.length,
    required_task_files: REQUIRED_TASK_FILES,
    files: payloadEntries,
  });
  normalizedFiles.set("MANIFEST.json", manifestContent);
  normalizedFiles.set("MANIFEST.sha256", [
    ...payloadEntries,
    { path: "MANIFEST.json", sha256: sha256(manifestContent) },
  ].map((entry) => `${entry.sha256}  ${entry.path}`).join("\n") + "\n");

  try {
    await mkdir(rootPath, { recursive: true });
    for (const [path, content] of normalizedFiles) {
      const absolutePath = join(rootPath, ...path.split("/"));
      const relativePath = relative(rootPath, absolutePath);
      if (relativePath.startsWith("..") || relativePath.split(sep).includes("..")) {
        throw new Error(`Package path escaped root: ${path}`);
      }
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, { encoding: "utf8", mode: 0o644 });
    }

    await setDeterministicMetadata(rootPath, [...normalizedFiles.keys()]);
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await rm(resolve(outputPath), { force: true });
    await execFileAsync("zip", ["-X", "-q", "-9", "-r", resolve(outputPath), rootName], {
      cwd: workspace,
      env: { ...process.env, TZ: "UTC" },
    });

    const archiveStats = await stat(resolve(outputPath));
    if (archiveStats.size > MAX_ARCHIVE_BYTES) {
      await rm(resolve(outputPath), { force: true });
      throw new Error(`Package exceeds ${MAX_ARCHIVE_BYTES} bytes`);
    }

    return {
      outputPath: resolve(outputPath),
      byteLength: archiveStats.size,
      sha256: sha256(await readFile(resolve(outputPath))),
      taskCount: catalog.length,
    };
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function runCli() {
  const releaseDate = argumentValue("date") || new Date().toISOString().slice(0, 10);
  const sourceSha = argumentValue("sha") || execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const defaultName = `SARI_ZAHYPI_REQUIREMENTS_PACK_${releaseDate}.zip`;
  const outputPath = argumentValue("output") || join(process.cwd(), "artifacts", defaultName);
  const result = await buildZahyPiRequirementsPack({ outputPath, sourceSha, releaseDate });
  process.stdout.write(`${stableJson(result)}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
