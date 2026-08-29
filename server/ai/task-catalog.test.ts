import { describe, expect, it } from "vitest";

import {
  SARI_TASK_CATALOG,
  activeSariTaskTypes,
  resolveSariTaskType,
} from "./task-catalog";

const TASK_TYPE_PATTERN = /^sari\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function collectStringSchemas(schema: unknown): Array<Record<string, unknown>> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const record = schema as Record<string, unknown>;
  const collected = record.type === "string" ? [record] : [];

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) collected.push(...collectStringSchemas(item));
    } else {
      collected.push(...collectStringSchemas(value));
    }
  }

  return collected;
}

describe("SARI_TASK_CATALOG", () => {
  it("defines unique canonical task types using the sari namespace", () => {
    const taskTypes = SARI_TASK_CATALOG.map((contract) => contract.taskType);

    expect(taskTypes.length).toBeGreaterThanOrEqual(20);
    expect(new Set(taskTypes).size).toBe(taskTypes.length);
    expect(taskTypes.every((taskType) => TASK_TYPE_PATTERN.test(taskType))).toBe(true);
  });

  it("keeps aliases globally unique and separate from canonical names", () => {
    const taskTypes = new Set(SARI_TASK_CATALOG.map((contract) => contract.taskType));
    const aliases = SARI_TASK_CATALOG.flatMap((contract) => contract.aliases);

    expect(new Set(aliases).size).toBe(aliases.length);
    expect(aliases.every((alias) => TASK_TYPE_PATTERN.test(alias))).toBe(true);
    expect(aliases.some((alias) => taskTypes.has(alias))).toBe(false);
  });

  it("resolves legacy next-action names to one governed capability", () => {
    expect(resolveSariTaskType("sari.action.selection").taskType).toBe(
      "sari.sales.next-best-action",
    );
    expect(resolveSariTaskType("sari.next-action").taskType).toBe(
      "sari.sales.next-best-action",
    );
  });

  it("does not expose the generic sari.invoke escape hatch", () => {
    expect(activeSariTaskTypes()).not.toContain("sari.invoke");
    expect(() => resolveSariTaskType("sari.invoke")).toThrow(/unknown sari task type/i);
  });

  it("uses bounded closed object schemas for every task", () => {
    for (const contract of SARI_TASK_CATALOG) {
      for (const schema of [contract.inputSchema, contract.outputSchema]) {
        expect(schema).toMatchObject({
          type: "object",
          additionalProperties: false,
        });
        expect(schema.maxProperties).toEqual(expect.any(Number));

        for (const stringSchema of collectStringSchemas(schema)) {
          expect(stringSchema.maxLength).toEqual(expect.any(Number));
        }
      }
    }
  });

  it("carries the trusted application prompt and a compatibility response envelope", () => {
    for (const contract of SARI_TASK_CATALOG) {
      const input = contract.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      const output = contract.outputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };

      expect(input.properties).toHaveProperty("promptMessages");
      expect(input.required).toContain("promptMessages");
      expect(contract.sampleInput.promptMessages).toEqual(expect.any(Array));
      expect(output.properties).toHaveProperty("applicationResponse");
      expect(output.required).toContain("applicationResponse");
      expect(contract.sampleOutput.applicationResponse).toEqual(expect.any(String));
    }
  });

  it("ships reviewable examples and rejection cases for every task", () => {
    for (const contract of SARI_TASK_CATALOG) {
      expect(contract.goldenCases.length).toBeGreaterThanOrEqual(5);
      expect(contract.rejectionCases.length).toBeGreaterThanOrEqual(5);
      expect(JSON.stringify(contract.goldenCases)).not.toMatch(
        /(?:api[_-]?key|bearer\s|password|session[_-]?id)/i,
      );
    }
  });

  it("fails closed for unsupported names", () => {
    expect(() => resolveSariTaskType("sari.not-real")).toThrow(
      /unknown sari task type/i,
    );
  });
});
