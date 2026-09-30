import { z } from "zod";
import { setupCatalogDraft } from "@shared/setup-catalog";
import {
  setupCompletionFields,
  setupCompletionInput,
  setupCompletionReceipt,
} from "@shared/setup-completion";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
import {
  setupProfileDraft,
  setupAssistantDraft,
} from "./setup-field-validation";

export function setupFieldsFromDraft(draft: Record<string, unknown>) {
  const catalog = setupCatalogDraft.parse(draft);
  const source = draft.websiteAnalysis as
    | { confirmed?: boolean; websiteUrl?: unknown; platform?: unknown }
    | undefined;
  return setupCompletionFields.parse({
    ...setupProfileDraft(draft),
    ...setupAssistantDraft(draft),
    products: catalog.products,
    services: catalog.services,
    templateId: draft.templateId,
    websiteAnalysis: source?.confirmed
      ? {
          websiteUrl: source.websiteUrl,
          platform: source.platform ?? "unknown",
        }
      : undefined,
  });
}
export const setupAttempt = z
  .object({
    actorId: z.number().int().positive(),
    merchantId: z.number().int().positive(),
    input: setupCompletionInput,
  })
  .strict();
export type SetupAttempt = z.infer<typeof setupAttempt>;
const prefix = "sary:setup-completion:v1:";
function key(actorId: number, merchantId: number) {
  if (![actorId, merchantId].every(id => Number.isSafeInteger(id) && id > 0))
    throw Error("Invalid setup scope");
  return `${prefix}${actorId}:${merchantId}`;
}
export function readSetupAttempt(
  actorId: number,
  merchantId: number
): SetupAttempt | null {
  const raw = sessionStorage.getItem(key(actorId, merchantId));
  if (!raw) return null;
  if (raw.length > 1_100_000) throw Error("Invalid setup attempt");
  const value = setupAttempt.parse(JSON.parse(raw));
  if (value.actorId !== actorId || value.merchantId !== merchantId)
    throw Error("Invalid setup scope");
  return value;
}
export function rememberSetupAttempt(value: SetupAttempt, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const checked = setupAttempt.parse(value),
    name = key(value.actorId, value.merchantId),
    previous = readSetupAttempt(value.actorId, value.merchantId);
  if (previous && JSON.stringify(previous) !== JSON.stringify(checked))
    throw Error("Pending setup attempt");
  const raw = JSON.stringify(checked);
  if (raw.length > 1_100_000) throw Error("Invalid setup attempt");
  sessionStorage.setItem(name, raw);
  if (sessionStorage.getItem(name) !== raw)
    throw Error("Setup attempt unavailable");
}
export function forgetSetupAttempt(value: SetupAttempt) {
  const current = readSetupAttempt(value.actorId, value.merchantId);
  if (current?.input.requestId === value.input.requestId)
    sessionStorage.removeItem(key(value.actorId, value.merchantId));
}
export function checkedSetupReceipt(raw: unknown, attempt: SetupAttempt) {
  const result = setupCompletionReceipt.parse(raw),
    fields = attempt.input.fields;
  if (
    result.actorId !== attempt.actorId ||
    result.merchantId !== attempt.merchantId ||
    result.requestId !== attempt.input.requestId ||
    result.businessName !== fields.businessName ||
    result.products.length !== fields.products.length ||
    result.services.length !== fields.services.length ||
    result.templateId !== (fields.templateId ?? null) ||
    JSON.stringify(result.reviewedWebsite) !==
      JSON.stringify(fields.websiteAnalysis ?? null) ||
    result.products.some(
      (row, i) =>
        row.name !== fields.products[i].name ||
        row.priceMinor !== fields.products[i].priceMinor ||
        row.currency !== fields.products[i].currency
    ) ||
    result.services.some(
      (row, i) =>
        row.name !== fields.services[i].name ||
        row.priceMinor !== fields.services[i].priceMinor ||
        row.durationMinutes !== fields.services[i].durationMinutes
    )
  )
    throw Error("Setup receipt mismatch");
  return result;
}
