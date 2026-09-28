import { parseAgentKeywords } from "./virtual-agent-form";
export type AssistantSettingsDraft = {
  autoReplyEnabled: boolean;
  workingHoursEnabled: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: string;
  welcomeMessage: string;
  outOfHoursMessage: string;
  responseDelay: number;
  maxResponseLength: number;
  tone: "friendly" | "professional" | "casual";
  language: "ar" | "en" | "fr" | "tr" | "es" | "it" | "both";
  customInstructions: string | null;
  groupMode: "disabled" | "mention_only" | "keyword_only" | "private_redirect";
  groupKeywords: string;
  groupRedirectMessage: string;
};
/** The fields edited by the assistant settings form, excluding sales authority. */
export function assistantSettingsDraft(
  settings: Record<string, any>
): AssistantSettingsDraft {
  return {
    autoReplyEnabled: Boolean(settings.autoReplyEnabled),
    workingHoursEnabled: Boolean(settings.workingHoursEnabled),
    workingHoursStart: settings.workingHoursStart ?? "09:00",
    workingHoursEnd: settings.workingHoursEnd ?? "18:00",
    workingDays: settings.workingDays ?? "1,2,3,4,5",
    welcomeMessage: settings.welcomeMessage ?? "",
    outOfHoursMessage: settings.outOfHoursMessage ?? "",
    responseDelay: settings.responseDelay ?? 2,
    maxResponseLength: settings.maxResponseLength ?? 200,
    tone: (["friendly", "professional", "casual"].includes(settings.tone)
      ? settings.tone
      : "friendly") as "friendly" | "professional" | "casual",
    language: (settings.language ?? "ar") as
      | "ar"
      | "en"
      | "fr"
      | "tr"
      | "es"
      | "it"
      | "both",
    customInstructions: settings.customInstructions || null,
    groupMode: (settings.groupMode || "disabled") as
      | "disabled"
      | "mention_only"
      | "keyword_only"
      | "private_redirect",
    groupKeywords: JSON.stringify(parseAgentKeywords(settings.groupKeywords)),
    groupRedirectMessage: settings.groupRedirectMessage || "",
  };
}
export type AssistantDraftField = keyof AssistantSettingsDraft;
export const assistantDraftFields = Object.keys(
  assistantSettingsDraft({})
) as AssistantDraftField[];
export function compareAssistantDraft(
  base: AssistantSettingsDraft,
  draft: AssistantSettingsDraft,
  latest: AssistantSettingsDraft
) {
  const merged = { ...latest };
  const conflicts: AssistantDraftField[] = [];
  for (const field of assistantDraftFields) {
    if (Object.is(base[field], draft[field])) continue;
    if (
      !Object.is(base[field], latest[field]) &&
      !Object.is(draft[field], latest[field])
    )
      conflicts.push(field);
    Object.assign(merged, { [field]: draft[field] });
  }
  return { merged, conflicts };
}
