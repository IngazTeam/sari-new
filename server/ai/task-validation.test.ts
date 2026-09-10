import { describe, expect, it } from "vitest";

import { SARI_TASK_CATALOG } from "./task-catalog";
import { assertSariTaskPayload } from "./task-validation";

describe("Sari governed task schema boundary", () => {
  it.each(SARI_TASK_CATALOG)("validates every declared example and rejects bad payloads for $taskType", (contract) => {
    for (const example of contract.goldenCases) {
      expect(() => assertSariTaskPayload(contract, "input", example.input)).not.toThrow();
      expect(() => assertSariTaskPayload(contract, "output", example.expected)).not.toThrow();
    }
    for (const example of contract.rejectionCases) {
      expect(() => assertSariTaskPayload(contract, "input", example.input)).toThrow(/input violates its schema/);
    }
    for (const direction of ["input", "output"] as const) {
      const schema = direction === "input" ? contract.inputSchema : contract.outputSchema;
      const sample = direction === "input" ? contract.sampleInput : contract.sampleOutput;
      for (const field of schema.required as string[]) {
        const payload = { ...sample };
        delete payload[field];
        expect(() => assertSariTaskPayload(contract, direction, payload)).toThrow(/violates its schema/);
      }
      expect(() => assertSariTaskPayload(contract, direction, { ...sample, untrusted: true }))
        .toThrow(/violates its schema/);
      const properties = schema.properties as Record<string, { type: string; maxLength?: number }>;
      for (const [field, rule] of Object.entries(properties)) {
        if (rule.type === "string" && rule.maxLength !== undefined) {
          expect(() => assertSariTaskPayload(contract, direction, { ...sample, [field]: "x".repeat(rule.maxLength + 1) }))
            .toThrow(/violates its schema/);
        }
      }
    }
  });

  it("enforces nested prompt roles, closed objects and array bounds without logging payloads", () => {
    const contract = SARI_TASK_CATALOG[0];
    const sample = contract.sampleInput;
    for (const promptMessages of [
      [],
      Array.from({ length: 101 }, () => ({ role: "user", content: "synthetic" })),
      [{ role: "developer", content: "synthetic" }],
      [{ role: "user", content: "synthetic", tenantId: "other" }],
      [{ role: "user", content: "x".repeat(16_001) }],
    ]) {
      expect(() => assertSariTaskPayload(contract, "input", { ...sample, promptMessages }))
        .toThrow("ZahyPi governed task input violates its schema");
    }
    expect(() => assertSariTaskPayload(contract, "output", {
      traceId: "synthetic", applicationResponse: "private-content-never-log",
    })).toThrow("ZahyPi governed task output violates its schema");
  });

  it("enforces numeric confidence and boolean review fields", () => {
    const contract = SARI_TASK_CATALOG.find((task) => task.outputKind === "recommendation")!;
    for (const confidence of [-0.01, 1.01, NaN, Infinity, "0.5"]) {
      expect(() => assertSariTaskPayload(contract, "output", { ...contract.sampleOutput, confidence }))
        .toThrow(/output violates its schema/);
    }
    expect(() => assertSariTaskPayload(contract, "output", { ...contract.sampleOutput, requiresHumanReview: "false" }))
      .toThrow(/output violates its schema/);
  });
});
