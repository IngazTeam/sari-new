import {
  emptyVirtualAgent,
  parseAgentKeywords,
  type VirtualAgentDraft,
} from "./virtual-agent-form";

export function agentDraft(agent: {
  name: string;
  role: string;
  department: string | null;
  personalityPrompt: string;
  tone: VirtualAgentDraft["tone"];
  avatarEmoji: string | null;
  isDefault: number;
  isActive: number;
  triggerKeywords: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
}): VirtualAgentDraft {
  return {
    name: agent.name,
    role: agent.role,
    department: agent.department || "",
    personalityPrompt: agent.personalityPrompt,
    tone: agent.tone,
    avatarEmoji: agent.avatarEmoji || "default",
    isDefault: Boolean(agent.isDefault),
    isActive: Boolean(agent.isActive),
    triggerKeywords: parseAgentKeywords(agent.triggerKeywords),
    shiftStart: agent.shiftStart || "",
    shiftEnd: agent.shiftEnd || "",
  };
}

export const agentReviewFields = Object.keys(
  emptyVirtualAgent
) as (keyof VirtualAgentDraft)[];
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function compareAgentDraft(
  base: VirtualAgentDraft,
  draft: VirtualAgentDraft,
  latest: VirtualAgentDraft
) {
  const merged = { ...latest };
  const conflicts: (keyof VirtualAgentDraft)[] = [];
  const changed = agentReviewFields.filter(
    key => !same(base[key], latest[key])
  );
  for (const key of agentReviewFields) {
    if (same(base[key], draft[key])) continue;
    if (!same(base[key], latest[key]) && !same(draft[key], latest[key]))
      conflicts.push(key);
    Object.assign(merged, { [key]: draft[key] });
  }
  return { merged, conflicts, changed };
}
