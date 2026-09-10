import { z } from "zod";

import type { SariTaskContract } from "./task-catalog";

const validators = new WeakMap<Record<string, unknown>, z.ZodType>();

/** Validate the shipped JSON Schema; never expose provider content in errors. */
export function assertSariTaskPayload(
  contract: SariTaskContract,
  direction: "input" | "output",
  value: unknown,
): void {
  const schema = direction === "input" ? contract.inputSchema : contract.outputSchema;
  let validator = validators.get(schema);
  if (!validator) {
    validator = z.fromJSONSchema(schema, { defaultTarget: "draft-2020-12" });
    validators.set(schema, validator);
  }
  if (!validator.safeParse(value).success) {
    throw new Error(`ZahyPi governed task ${direction} violates its schema`);
  }
}
