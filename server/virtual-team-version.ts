import { createHash } from "node:crypto";
import type { virtualAgents } from "../drizzle/schema";

type Agent = typeof virtualAgents.$inferSelect;

/** The reviewed team includes routing/default effects, but not write timestamps. */
export function virtualTeamRevision(merchantId: number, agents: Agent[]) {
  const rows = [...agents]
    .sort((a, b) => a.id - b.id)
    .map(agent => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      department: agent.department,
      personalityPrompt: agent.personalityPrompt,
      tone: agent.tone,
      avatarEmoji: agent.avatarEmoji,
      isDefault: agent.isDefault,
      isActive: agent.isActive,
      triggerKeywords: agent.triggerKeywords,
      triggerIntents: agent.triggerIntents,
      shiftStart: agent.shiftStart,
      shiftEnd: agent.shiftEnd,
      sortOrder: agent.sortOrder,
    }));
  return createHash("sha256")
    .update(JSON.stringify({ merchantId, rows }))
    .digest("hex");
}
