import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const PRODUCTION_FILES = [
  "server/_core/index.ts",
  "server/_core/websiteAnalyzer.ts",
  "server/ai.ts",
  "server/ai/keyword-analysis.ts",
  "server/ai/product-intelligence.ts",
  "server/ai/profile-enrichment.ts",
  "server/ai/response-critic.ts",
  "server/ai/response-validator.ts",
  "server/ai/sari-personality.ts",
  "server/appointmentBot.ts",
  "server/automation/order-from-chat.ts",
  "server/automation/zid-order-from-chat.ts",
  "server/reports/sentiment-weekly.ts",
  "server/routers-ai-suggestions.ts",
  "server/routers-products.ts",
  "server/routers-sari-brain.ts",
] as const;

function objectPropertyNames(node: ts.Expression | undefined): string[] {
  if (!node || !ts.isObjectLiteralExpression(node)) return [];
  return node.properties.flatMap((property) => property.name
    ? [property.name.getText().replaceAll(/["']/g, "")]
    : []);
}

function ungovernedCallsites(fileName: string): string[] {
  const source = readFileSync(fileName, "utf8");
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const findings: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      const options = callee === "invokeLLM"
        ? node.arguments[0]
        : callee === "callGPT4"
          ? node.arguments[1]
          : undefined;
      if (callee === "invokeLLM" || callee === "callGPT4") {
        const properties = objectPropertyNames(options);
        if (!properties.includes("taskType")) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          findings.push(`${fileName}:${line + 1}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

describe("ZahyPi production callsite governance", () => {
  it("assigns an explicit governed task type to every active text call", () => {
    expect(PRODUCTION_FILES.flatMap(ungovernedCallsites)).toEqual([]);
  });
});
