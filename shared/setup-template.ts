import { z } from "zod";
import { setupCatalogDraft, SETUP_CATALOG_LIMIT } from "./setup-catalog";

const day = z.object({
  open: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  close: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  isOpen: z.boolean(),
});
export const setupTemplateHours = z
  .object({
    saturday: day.optional(),
    sunday: day.optional(),
    monday: day.optional(),
    tuesday: day.optional(),
    wednesday: day.optional(),
    thursday: day.optional(),
    friday: day.optional(),
  })
  .strict();
const assistant = z
  .object({
    tone: z.enum(["friendly", "professional", "casual"]).optional(),
    language: z.enum(["ar", "en", "both", "fr", "tr", "es", "it"]).optional(),
    welcomeMessage: z.string().max(2000).optional(),
  })
  .strict();
const rawTemplate = z.object({
  id: z.number().int().positive(),
  is_active: z.literal(1),
  template_name: z.string().min(1).max(255),
  templateName: z.string().min(1).max(255).optional(),
  description: z.string().nullable(),
  products: z.string().nullable(),
  services: z.string().nullable(),
  working_hours: z.string().nullable(),
  bot_personality: z.string().nullable(),
  botPersonality: z.string().nullable().optional(),
});
function json(value: string | null, empty: unknown) {
  if (!value) return empty;
  if (value.length > 500_000) throw Error("SETUP_TEMPLATE_INVALID");
  return JSON.parse(value);
}
export function setupTemplatePreview(value: unknown) {
  const template = rawTemplate.parse(value);
  const catalog = setupCatalogDraft.parse({
    products: json(template.products, []),
    services: json(template.services, []),
  });
  return {
    id: template.id,
    title: template.templateName || template.template_name,
    description: template.description || "",
    products: catalog.products.map(({ priceMinor, ...row }, index) => ({
      ...row,
      price: (priceMinor / 100).toFixed(2),
      id: `template-${template.id}-product-${index}`,
    })),
    services: catalog.services.map(({ priceMinor, ...row }, index) => ({
      ...row,
      price: (priceMinor / 100).toFixed(2),
      id: `template-${template.id}-service-${index}`,
    })),
    workingHours: setupTemplateHours.parse(json(template.working_hours, {})),
    assistant: assistant.parse(
      json(template.botPersonality ?? template.bot_personality, {})
    ),
  };
}
export type SetupTemplatePreview = ReturnType<typeof setupTemplatePreview>;
export type SetupTemplateChoices = {
  catalog: "merge" | "replace" | "skip";
  assistant: boolean;
  workingHours: boolean;
};
/** Local draft only. Preserves unrelated fields and never writes catalog records. */
export function setupTemplatePatch(
  draft: Record<string, unknown>,
  preview: SetupTemplatePreview,
  choices: SetupTemplateChoices
) {
  const patch: Record<string, unknown> = { templateId: preview.id };
  for (const kind of ["products", "services"] as const) {
    if (choices.catalog === "skip") continue;
    const old = draft[kind];
    if (choices.catalog === "merge" && old !== undefined && !Array.isArray(old))
      throw Error("SETUP_TEMPLATE_DRAFT_INVALID");
    const rows: unknown[] =
      choices.catalog === "replace" ? [] : (old as unknown[] | undefined) || [];
    const ids = new Set(
      rows.map(row =>
        row && typeof row === "object"
          ? (row as { id?: unknown }).id
          : undefined
      )
    );
    const added = preview[kind].filter(row => !ids.has(row.id));
    if (rows.length + added.length > SETUP_CATALOG_LIMIT)
      throw Error("SETUP_TEMPLATE_LIMIT");
    patch[kind] = [...rows, ...added];
  }
  if (choices.assistant) {
    if (preview.assistant.tone !== undefined)
      patch.botTone = preview.assistant.tone;
    if (preview.assistant.language !== undefined)
      patch.botLanguage = preview.assistant.language;
    if (preview.assistant.welcomeMessage !== undefined)
      patch.welcomeMessage = preview.assistant.welcomeMessage;
  }
  if (choices.workingHours && Object.keys(preview.workingHours).length) {
    patch.workingHours = preview.workingHours;
    patch.workingHoursType = "custom";
  }
  return patch;
}
