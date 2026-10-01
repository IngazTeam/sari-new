import { z } from "zod";
import {
  emptyVirtualAgent,
  type VirtualAgentDraft,
} from "../../../shared/virtual-agent-form";
import {
  virtualTeamSaveInput,
  virtualTeamSaveReceipt,
  type VirtualTeamSaveInput,
} from "../../../shared/virtual-team-save";
import { isCompleteAgentOrder } from "../../../shared/virtual-agent-routing";

export const personaModes = [
  "normal",
  "empty",
  "limit",
  "viewer",
  "offline-before",
  "lost-after",
  "receipt-failed",
  "foreign-receipt",
  "conflict",
  "load-error",
] as const;
export type PersonaMode = (typeof personaModes)[number];
type Agent = VirtualAgentDraft & {
  id: number;
  sortOrder: number;
  triggerIntents: string | null;
};
const failure = (code = "INTERNAL_SERVER_ERROR") => ({ data: { code } });
const agentSchema = z.object({
  id: z.number().int().positive(),
  sortOrder: z.number().int().nonnegative(),
  triggerIntents: z.string().nullable(),
  draft: virtualTeamSaveInput.shape.draft,
});
const stateSchema = z
  .object({
    version: z.literal(1),
    sequence: z.number().int().positive(),
    agents: z.array(agentSchema).max(10),
    receipts: z.array(
      z.object({ input: virtualTeamSaveInput, result: virtualTeamSaveReceipt })
    ),
  })
  .strict();
type Stored = z.infer<typeof stateSchema>;
export class PersonaPreviewModel {
  readonly actorId = 900174;
  mode: PersonaMode = "normal";
  storageError = false;
  writes = 0;
  reads = 0;
  private state: Stored;
  private generation = 0;
  private listeners = new Set<() => void>();
  private attempted = new Set<string>();
  private conflicted = false;
  constructor(
    readonly merchantId: number,
    private storage: Pick<Storage, "getItem" | "setItem">
  ) {
    this.state = this.initial();
    try {
      const raw = storage.getItem(this.key);
      if (raw) {
        const data = stateSchema.parse(JSON.parse(raw));
        if (
          data.receipts.some(
            r =>
              r.input.merchantId !== merchantId ||
              r.result.merchantId !== merchantId ||
              r.result.actorId !== this.actorId
          )
        )
          throw Error("Foreign fixture");
        this.state = data;
      }
    } catch {
      this.storageError = true;
    }
  }
  private get key() {
    return `sary:persona-preview:174:${this.merchantId}`;
  }
  private initial(): Stored {
    return {
      version: 1,
      sequence: 1,
      receipts: [],
      agents: [
        {
          id: 1,
          sortOrder: 0,
          triggerIntents: '["greeting"]',
          draft: {
            ...emptyVirtualAgent,
            name: "سارة",
            role: "استقبال",
            department: "خدمة العملاء",
            personalityPrompt:
              "رحّبي بالعميل وافهمي طلبه، واستخدمي المعرفة المعتمدة.",
            isDefault: true,
          },
        },
        {
          id: 2,
          sortOrder: 1,
          triggerIntents: null,
          draft: {
            ...emptyVirtualAgent,
            name: "فهد",
            role: "مبيعات",
            department: "المبيعات",
            personalityPrompt: "افهم احتياج العميل ولا تقدم وعودًا غير مؤكدة.",
            tone: "persuasive",
            avatarEmoji: "sales",
            shiftStart: "22:00",
            shiftEnd: "06:00",
            triggerKeywords: ["سعر"],
          },
        },
      ],
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.generation;
  notify() {
    this.generation++;
    this.listeners.forEach(listener => listener());
  }
  revision() {
    return (this.merchantId * 100000 + this.state.sequence)
      .toString(16)
      .padStart(64, "0");
  }
  private commit(next: Stored) {
    const raw = JSON.stringify(stateSchema.parse(next));
    this.storage.setItem(this.key, raw);
    if (this.storage.getItem(this.key) !== raw)
      throw Error("Preview storage unavailable");
    this.state = structuredClone(next);
    this.storageError = false;
    this.notify();
  }
  reset(mode: PersonaMode = this.mode) {
    this.mode = mode;
    this.attempted.clear();
    this.conflicted = false;
    const next = this.initial();
    if (mode === "empty") next.agents = [];
    if (mode === "limit")
      next.agents = Array.from({ length: 10 }, (_, i) => ({
        ...structuredClone(next.agents[0]),
        id: i + 1,
        sortOrder: i,
        draft: {
          ...next.agents[0].draft,
          name: `شخصية ${i + 1}`,
          isDefault: i === 0,
        },
      }));
    this.commit(next);
  }
  list() {
    if (this.mode === "load-error" || this.storageError) throw failure();
    return {
      revision: this.revision(),
      canManage: this.mode !== "viewer",
      agents: this.state.agents.map(a => ({
        ...a.draft,
        id: a.id,
        sortOrder: a.sortOrder,
        merchantId: this.merchantId,
        isActive: Number(a.draft.isActive),
        isDefault: Number(a.draft.isDefault),
        triggerKeywords: JSON.stringify(a.draft.triggerKeywords),
        triggerIntents: a.triggerIntents,
        createdAt: "2026-10-01 00:00:00",
        updatedAt: "2026-10-01 00:00:00",
      })),
    };
  }
  private writable(expectedRevision: string) {
    if (this.mode === "viewer") throw failure("FORBIDDEN");
    if (this.storageError) throw failure();
    if (expectedRevision !== this.revision()) throw failure("CONFLICT");
  }
  async save(value: VirtualTeamSaveInput) {
    const input = virtualTeamSaveInput.parse(value);
    this.writes++;
    this.notify();
    if (input.merchantId !== this.merchantId || this.mode === "viewer")
      throw failure("FORBIDDEN");
    const old = this.state.receipts.find(
      r => r.input.requestId === input.requestId
    );
    if (old) {
      if (JSON.stringify(old.input) !== JSON.stringify(input))
        throw failure("CONFLICT");
      return structuredClone(old.result);
    }
    const first = !this.attempted.has(input.requestId);
    this.attempted.add(input.requestId);
    if (first && this.mode === "offline-before") throw failure();
    if (first && this.mode === "conflict" && !this.conflicted) {
      this.conflicted = true;
      const next = structuredClone(this.state);
      next.sequence++;
      if (next.agents[0]) next.agents[0].draft.name = "اسم من نافذة أخرى";
      this.commit(next);
      throw failure("CONFLICT");
    }
    this.writable(input.expectedRevision);
    const next = structuredClone(this.state),
      index = next.agents.findIndex(a => a.id === input.editing);
    if (input.editing !== null && index < 0) throw failure("NOT_FOUND");
    if (input.editing === null && next.agents.length >= 10)
      throw failure("BAD_REQUEST");
    if (input.draft.isDefault)
      next.agents.forEach(a => {
        a.draft.isDefault = false;
      });
    const personaId =
      input.editing ??
      Math.max(
        0,
        ...next.agents.map(a => a.id),
        ...next.receipts.map(r => r.result.personaId)
      ) + 1;
    if (index < 0)
      next.agents.push({
        id: personaId,
        sortOrder: next.agents.length,
        triggerIntents: null,
        draft: input.draft,
      });
    else next.agents[index].draft = input.draft;
    next.sequence++;
    const result = virtualTeamSaveReceipt.parse({
      merchantId: this.merchantId,
      actorId: this.actorId,
      requestId: input.requestId,
      operation: input.editing === null ? "create" : "update",
      personaId,
      reviewedRevision: input.expectedRevision,
      revisionAfter: (this.merchantId * 100000 + next.sequence)
        .toString(16)
        .padStart(64, "0"),
      savedAt: new Date().toISOString(),
    });
    next.receipts.push({ input, result });
    this.commit(next);
    if (
      first &&
      ["lost-after", "receipt-failed", "foreign-receipt"].includes(this.mode)
    )
      throw failure();
    return result;
  }
  async receipt({
    merchantId,
    requestId,
  }: {
    merchantId: number;
    requestId: string;
  }) {
    this.reads++;
    this.notify();
    if (merchantId !== this.merchantId || this.mode === "viewer")
      throw failure("FORBIDDEN");
    if (this.mode === "receipt-failed" || this.storageError) throw failure();
    const result = this.state.receipts.find(
      r => r.input.requestId === requestId
    )?.result;
    return result
      ? structuredClone(
          this.mode === "foreign-receipt"
            ? { ...result, merchantId: 999 }
            : result
        )
      : null;
  }
  async action(name: "delete" | "reorder" | "seedTemplates", input: any) {
    this.writable(input.expectedRevision);
    const next = structuredClone(this.state);
    if (name === "delete") {
      if (!next.agents.some(a => a.id === input.id)) throw failure("NOT_FOUND");
      next.agents = next.agents.filter(a => a.id !== input.id);
    } else if (name === "reorder") {
      if (
        !isCompleteAgentOrder(
          next.agents.map(a => a.id),
          input.orderedIds
        )
      )
        throw failure("BAD_REQUEST");
      next.agents = input.orderedIds.map((id: number, i: number) => ({
        ...next.agents.find(a => a.id === id)!,
        sortOrder: i,
      }));
    } else {
      if (next.agents.length) return { success: false };
      next.agents = this.initial().agents;
    }
    next.sequence++;
    this.commit(next);
    return { success: true };
  }
}
