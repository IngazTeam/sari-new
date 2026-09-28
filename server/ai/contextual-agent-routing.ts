import type { PoolConnection } from "mysql2/promise";
import {
  agentLocalTime,
  isAgentOnShift,
} from "../../shared/virtual-agent-routing";
import {
  assertCheckoutIdentity,
  checkoutTransaction,
  type CheckoutIdentity,
} from "./checkout-agreements";
import {
  conversationUnderstandingIdentity,
  type ConversationUnderstanding,
} from "./conversation-understanding-context";
import { sanitizeForPrompt } from "./sari-utils";

export type ContextualAgent = {
  id: number;
  name: string;
  role: string;
  department: string | null;
  personalityPrompt: string;
  isActive: number;
  isDefault: number;
  sortOrder: number;
  shiftStart: string | null;
  shiftEnd: string | null;
};
export type AgentCandidate = Pick<
  ContextualAgent,
  "id" | "name" | "role" | "department"
> & { expertise: string };

/** One tenant, live shift availability, no keyword or phrase matching. */
export async function readAvailableAgents(
  c: PoolConnection,
  merchantId: number,
  time = agentLocalTime(),
  lock = false
): Promise<ContextualAgent[]> {
  const [agents] = await c.execute<any[]>(
    `SELECT id,name,role,department,personality_prompt AS personalityPrompt,
    is_active AS isActive,is_default AS isDefault,sort_order AS sortOrder,shift_start AS shiftStart,shift_end AS shiftEnd
    FROM virtual_agents WHERE merchant_id=? AND is_active=1 ORDER BY sort_order,id${lock ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
  return agents.filter(agent =>
    isAgentOnShift(agent.shiftStart, agent.shiftEnd, time)
  );
}

export function agentCandidates(agents: ContextualAgent[]): AgentCandidate[] {
  // Bound model input without giving a model an invisible candidate to choose.
  return agents
    .slice(0, 50)
    .map(({ id, name, role, department, personalityPrompt }) => ({
      id,
      name,
      role,
      department,
      expertise: personalityPrompt.slice(0, 1000),
    }));
}

export function selectContextualAgent<T extends ContextualAgent>(
  agents: readonly T[],
  currentAgentId: number | null,
  analysis: ConversationUnderstanding,
  time = agentLocalTime()
) {
  const available = agents
    .filter(
      a => a.isActive === 1 && isAgentOnShift(a.shiftStart, a.shiftEnd, time)
    )
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const interpreted =
    analysis.confidence >= 0.85 && !analysis.ambiguous && !analysis.conditional
      ? available.find(a => a.id === analysis.virtualAgentId)
      : undefined;
  if (interpreted) return { agent: interpreted, reason: "context" as const };
  const current = available.find(a => a.id === currentAgentId);
  if (current) return { agent: current, reason: "current" as const };
  const preferred = available.find(a => a.isDefault === 1);
  if (preferred) return { agent: preferred, reason: "default" as const };
  return available[0]
    ? { agent: available[0], reason: "order" as const }
    : null;
}

export function chooseContextualAgent<T extends ContextualAgent>(
  agents: readonly T[],
  currentAgentId: number | null,
  analysis: ConversationUnderstanding,
  time = agentLocalTime()
) {
  return (
    selectContextualAgent(agents, currentAgentId, analysis, time)?.agent ?? null
  );
}

/** Persist under the same identity/ownership checks as other conversation actions. */
export async function resolveContextualAgent(
  input: Partial<CheckoutIdentity> & { merchantId: number; message: string }
): Promise<ContextualAgent | null> {
  const context = conversationUnderstandingIdentity();
  if (!context) throw Error("Missing conversation understanding");
  if (
    context.merchantId !== input.merchantId ||
    context.message !== input.message
  )
    throw Error("Agent interpretation identity mismatch");
  // Ephemeral previews must never assign a live conversation or re-use a saved agent.
  if (context.mode === "preview") return null;
  if (
    !input.conversationId ||
    !input.incomingMessageId ||
    !input.customerPhone ||
    context.conversationId !== input.conversationId ||
    context.incomingMessageId !== input.incomingMessageId
  )
    throw Error("Agent conversation identity mismatch");
  const identity = input as CheckoutIdentity & { message: string };
  return checkoutTransaction(async c => {
    const source = await assertCheckoutIdentity(c, identity);
    if (source.content !== input.message) throw Error("Agent source changed");
    // Re-read the seal and memory cutoff immediately before mutation. An ALS
    // proposal alone must not survive forgetting, history edits or result tampering.
    const { readStoredUnderstanding } =
      await import("./conversation-understanding");
    const stored = await readStoredUnderstanding(c, identity);
    if (!stored || !stored.analysis.confidence)
      throw Error("Agent interpretation unavailable");
    const [conversations] = await c.execute<any[]>(
      "SELECT current_agent_id FROM conversations WHERE id=? AND merchantId=?",
      [identity.conversationId, identity.merchantId]
    );
    const agents = await readAvailableAgents(
      c,
      input.merchantId,
      agentLocalTime(),
      true
    );
    const selected = chooseContextualAgent(
      agents,
      conversations[0].current_agent_id,
      stored.analysis
    );
    if (
      (conversations[0].current_agent_id ?? null) !== (selected?.id ?? null)
    ) {
      await c.execute(
        "UPDATE conversations SET current_agent_id=? WHERE id=? AND merchantId=?",
        [selected?.id ?? null, identity.conversationId, identity.merchantId]
      );
    }
    return selected;
  });
}

export function contextualAgentPrompt(
  agent: ContextualAgent | null,
  businessName: string
) {
  if (!agent)
    return `\n\n## هوية الرد:\nأنت تمثل "${sanitizeForPrompt(businessName)}" مباشرة. عرّف نفسك باسم النشاط فقط؛ لا تستخدم اسم ساري.\n`;
  return `\n\n## هوية الموظف الافتراضي الحالي (لا تغيّر حقائق النشاط أو سياسة البيع أو قرار العميل):
أنت ${sanitizeForPrompt(agent.name)}، ${sanitizeForPrompt(agent.role)} عبر الواتساب.${agent.department ? ` تخصصك ${sanitizeForPrompt(agent.department)}.` : ""}
تعليمات النبرة والشخصية: ${sanitizeForPrompt(agent.personalityPrompt)}
استخدم اسم "${sanitizeForPrompt(agent.name)}" عند الحاجة دون تكرار التعريف كل رسالة. اختيار شخصية افتراضية ليس تحويلًا لموظف بشري؛ لا تدّع وصول موظف أو حدوث تحويل بشري.\n`;
}
