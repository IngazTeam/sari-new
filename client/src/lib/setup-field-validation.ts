import { setupCompletionFields } from "@shared/setup-completion";

export const setupProfileFields = setupCompletionFields.pick({
  businessType: true,
  businessName: true,
  phone: true,
  address: true,
  description: true,
  workingHoursType: true,
  workingHours: true,
});
export const setupAssistantFields = setupCompletionFields.pick({
  botTone: true,
  botLanguage: true,
  welcomeMessage: true,
});
export function setupProfileDraft(draft: Record<string, unknown>) {
  return {
    businessType: draft.businessType ?? "store",
    businessName: draft.businessName ?? "",
    phone: draft.phone ?? "",
    address: draft.address ?? "",
    description: draft.description ?? "",
    workingHoursType: draft.workingHoursType ?? "24_7",
    workingHours: draft.workingHours,
  };
}
export function setupAssistantDraft(draft: Record<string, unknown>) {
  return {
    botTone: draft.botTone ?? "friendly",
    botLanguage: draft.botLanguage ?? "ar",
    welcomeMessage: draft.welcomeMessage ?? "",
  };
}
export function setupProfileIssues(draft: Record<string, unknown>) {
  const parsed = setupProfileFields.safeParse(setupProfileDraft(draft));
  return parsed.success
    ? []
    : parsed.error.issues.map(issue => String(issue.path[0]));
}
export function setupAssistantIssues(draft: Record<string, unknown>) {
  const parsed = setupAssistantFields.safeParse(setupAssistantDraft(draft));
  return parsed.success
    ? []
    : parsed.error.issues.map(issue => String(issue.path[0]));
}
export const setupTextValue = (value: unknown) =>
  typeof value === "string" ? value : "";
