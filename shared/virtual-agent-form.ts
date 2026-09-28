export const virtualAgentTones = [
  "friendly",
  "professional",
  "casual",
  "empathetic",
  "persuasive",
] as const;
export type VirtualAgentDraft = {
  name: string;
  role: string;
  department: string;
  personalityPrompt: string;
  tone: (typeof virtualAgentTones)[number];
  avatarEmoji: string;
  isDefault: boolean;
  isActive: boolean;
  triggerKeywords: string[];
  shiftStart: string;
  shiftEnd: string;
};
export const emptyVirtualAgent: VirtualAgentDraft = {
  name: "",
  role: "",
  department: "",
  personalityPrompt: "",
  tone: "friendly",
  avatarEmoji: "reception",
  isDefault: false,
  isActive: true,
  triggerKeywords: [],
  shiftStart: "",
  shiftEnd: "",
};
export function parseAgentKeywords(value: unknown): string[] {
  try {
    const list = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(list)
      ? Array.from(
          new Set(
            list
              .filter((s): s is string => typeof s === "string")
              .map(s => s.trim())
              .filter(Boolean)
          )
        )
      : [];
  } catch {
    return [];
  }
}
export function validateVirtualAgent(draft: VirtualAgentDraft) {
  const errors: Partial<
    Record<
      keyof VirtualAgentDraft,
      "required" | "tooLong" | "schedule" | "keywords"
    >
  > = {};
  for (const field of ["name", "role", "personalityPrompt"] as const) {
    if (!draft[field].trim()) errors[field] = "required";
    else if (
      draft[field].trim().length > (field === "personalityPrompt" ? 2000 : 100)
    )
      errors[field] = "tooLong";
  }
  if (draft.department.length > 100) errors.department = "tooLong";
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    Boolean(draft.shiftStart) !== Boolean(draft.shiftEnd) ||
    (draft.shiftStart &&
      (!time.test(draft.shiftStart) ||
        !time.test(draft.shiftEnd) ||
        draft.shiftStart === draft.shiftEnd))
  )
    errors.shiftStart = "schedule";
  if (JSON.stringify(draft.triggerKeywords).length > 2000)
    errors.triggerKeywords = "keywords";
  return errors;
}
export function virtualAgentPayload(draft: VirtualAgentDraft) {
  return {
    name: draft.name.trim(),
    role: draft.role.trim(),
    department: draft.department.trim(),
    personalityPrompt: draft.personalityPrompt.trim(),
    tone: draft.tone,
    avatarEmoji: draft.avatarEmoji,
    isDefault: draft.isDefault,
    triggerKeywords: JSON.stringify(parseAgentKeywords(draft.triggerKeywords)),
  };
}
