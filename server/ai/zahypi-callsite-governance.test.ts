import { readdirSync, readFileSync } from "node:fs";
import { join, posix, win32 } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { activeSariTaskTypes, resolveSariTaskType } from "./task-catalog";

const SERVER_ROOT = "server";
const DEPRECATED_TEXT_FILES = new Set(["server/websiteAnalysis.ts"]);
const DIRECT_PROVIDER_FILES = new Set([
  "server/_core/llm.ts",
  "server/_core/voiceTranscription.ts",
  "server/ai/openai.ts",
  "server/ai/rag-engine.ts",
  "server/cron/ai-health-monitor.ts",
  "server/voice-transcription.ts",
]);

function productionTypeScriptFiles(directory = SERVER_ROOT, joinPath = join): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    // Policy identifiers are repository-relative POSIX paths on every host.
    // Normalize before both recursion and exact allowlist comparisons.
    const path = joinPath(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) return productionTypeScriptFiles(path, joinPath);
    if (
      !entry.isFile()
      || !entry.name.endsWith(".ts")
      || entry.name.endsWith(".d.ts")
      || entry.name.includes(".test.")
      || entry.name.includes(".spec.")
    ) return [];
    return [path];
  });
}

type GovernedCallsite = {
  fileName: string;
  line: number;
  taskType?: string;
};

function objectProperty(
  node: ts.Expression | undefined,
  propertyName: string,
): ts.ObjectLiteralElementLike | undefined {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  return node.properties.find((property) => property.name
    ?.getText()
    .replaceAll(/["']/g, "") === propertyName);
}

function stringPropertyValue(property: ts.ObjectLiteralElementLike | undefined): string | undefined {
  if (!property || !ts.isPropertyAssignment(property)) return undefined;
  const value = property.initializer;
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
    ? value.text
    : undefined;
}

function governedCallsites(fileName: string): GovernedCallsite[] {
  const source = readFileSync(fileName, "utf8");
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const findings: GovernedCallsite[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      const options = callee === "invokeLLM"
        ? node.arguments[0]
        : callee === "callGPT4"
          ? node.arguments[1]
          : undefined;
      if (callee === "invokeLLM" || callee === "callGPT4") {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        findings.push({
          fileName,
          line: line + 1,
          taskType: stringPropertyValue(objectProperty(options, "taskType")),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function isActiveTaskType(taskType: string): boolean {
  try {
    return resolveSariTaskType(taskType).status === "existing";
  } catch {
    return false;
  }
}

describe("ZahyPi production callsite governance", () => {
  const productionFiles = productionTypeScriptFiles();
  const activeFiles = productionFiles.filter((file) => !DEPRECATED_TEXT_FILES.has(file));
  const callsites = activeFiles.flatMap(governedCallsites);
  const activeTaskTypes = new Set<string>(activeSariTaskTypes());

  it.each([
    ["Windows", win32.join],
    ["POSIX", posix.join],
  ] as const)("uses identical exact policy paths with %s path joining", (_name, joinPath) => {
    const files = productionTypeScriptFiles(SERVER_ROOT, joinPath);
    expect(files).toEqual(productionFiles);
    expect(files.every((file) => file.startsWith("server/") && !file.includes("\\"))).toBe(true);
    expect(files.filter((file) => DEPRECATED_TEXT_FILES.has(file))).toEqual([
      "server/websiteAnalysis.ts",
    ]);
    expect(new Set(files.filter((file) => DIRECT_PROVIDER_FILES.has(file)))).toEqual(
      DIRECT_PROVIDER_FILES,
    );
    expect(DEPRECATED_TEXT_FILES.has("server/nested/websiteAnalysis.ts")).toBe(false);
    expect(DIRECT_PROVIDER_FILES.has("server/unreviewed/openai.ts")).toBe(false);
  });

  it("assigns an explicit active task type to every text-generation callsite", () => {
    expect(callsites.length).toBeGreaterThanOrEqual(50);
    expect(callsites.filter((callsite) => !callsite.taskType)).toEqual([]);
    expect(callsites.filter((callsite) => (
      callsite.taskType && !isActiveTaskType(callsite.taskType)
    ))).toEqual([]);
  });

  it("keeps every active task type anchored in production source", () => {
    const source = activeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect([...activeTaskTypes].filter((taskType) => !source.includes(taskType))).toEqual([]);
  });

  it("limits direct provider endpoints to reviewed provider boundaries", () => {
    const directProviderFiles = productionFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      const hasProviderEndpoint = source.includes("api.openai.com")
        || source.includes("OPENAI_API_URL}/chat/completions")
        || source.includes("OPENAI_API_URL}/audio/transcriptions")
        || source.includes("OPENAI_API_URL}/embeddings");
      const makesNetworkRequest = /\bfetch\s*\(|\baxios\s*\./.test(source);
      return hasProviderEndpoint && makesNetworkRequest;
    });
    expect(new Set(directProviderFiles)).toEqual(DIRECT_PROVIDER_FILES);
  });

  it("prevents environment keys from bypassing the administrator kill switch", () => {
    for (const file of ["server/ai/openai.ts", "server/ai/rag-engine.ts"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(
        /getOpenAiApiKey\(\)\s*\|\|\s*ENV\.openaiApiKey/,
      );
    }
  });

  it("keeps the deprecated legacy analyzer outside production imports", () => {
    const deprecatedSource = readFileSync("server/websiteAnalysis.ts", "utf8");
    expect(deprecatedSource).toMatch(/@deprecated/i);
    const importers = activeFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes('from "./websiteAnalysis"')
        || source.includes("from './websiteAnalysis'")
        || source.includes('from "../websiteAnalysis"')
        || source.includes("from '../websiteAnalysis'");
    });
    expect(importers).toEqual([]);
  });
});
