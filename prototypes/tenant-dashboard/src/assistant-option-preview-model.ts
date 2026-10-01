import { z } from "zod";
import {
  assistantOptionInput,
  assistantLanguages,
} from "../../../shared/assistant-options";
export const optionModes = [
  "normal",
  "empty",
  "viewer",
  "offline-before",
  "lost-after",
  "conflict",
  "load-error",
  "list-error",
  "review-error",
  "foreign-result",
] as const;
export type OptionMode = (typeof optionModes)[number];
const schema = z
  .object({
    version: z.literal(1),
    language: z.enum(assistantLanguages),
    takeoverTimeoutMinutes: z.number().int().min(5).max(120),
    takeoverCommandsEnabled: z.boolean(),
    languageVersion: z.number().int().min(1).max(999999),
    takeoverVersion: z.number().int().min(1).max(999999),
  })
  .strict();
type Stored = z.infer<typeof schema>;
const initial = (): Stored => ({
  version: 1,
  language: "ar",
  takeoverTimeoutMinutes: 90,
  takeoverCommandsEnabled: true,
  languageVersion: 1,
  takeoverVersion: 1,
});
const failure = (code = "INTERNAL_SERVER_ERROR") => ({ data: { code } });
export class AssistantOptionPreviewModel {
  readonly actorId = 900177;
  mode: OptionMode = "normal";
  writes = 0;
  reads = 0;
  storageError = false;
  private state = initial();
  private generation = 0;
  private sampledAt = Date.now();
  private listeners = new Set<() => void>();
  private simulated = false;
  constructor(
    readonly merchantId: number,
    private storage: Pick<Storage, "getItem" | "setItem">
  ) {
    if (![177, 178].includes(merchantId)) throw Error("Invalid preview tenant");
    try {
      const raw = storage.getItem(this.key);
      if (raw) this.state = schema.parse(JSON.parse(raw));
    } catch {
      this.storageError = true;
    }
  }
  private get key() {
    return `sary:assistant-options-preview:177:${this.merchantId}`;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.generation;
  notify = () => {
    this.generation++;
    for (const listener of this.listeners) listener();
  };
  private commit(next: Stored) {
    this.storage.setItem(this.key, JSON.stringify(schema.parse(next)));
    this.state = next;
    this.storageError = false;
  }
  reset(mode: OptionMode) {
    this.commit(initial());
    this.mode = mode;
    this.sampledAt = Date.now();
    this.simulated = false;
    this.writes = 0;
    this.reads = 0;
    this.notify();
  }
  settings() {
    if (this.storageError || this.mode === "load-error") throw failure();
    const revision = (kind: "language" | "takeover") =>
      (
        BigInt(this.merchantId) * 100000000n +
        BigInt(
          this.state[
            kind === "language" ? "languageVersion" : "takeoverVersion"
          ]
        ) *
          2n +
        (kind === "language" ? 0n : 1n)
      )
        .toString(16)
        .padStart(64, "0");
    return {
      ...this.state,
      merchantId: this.merchantId,
      canManage: this.mode !== "viewer",
      takeoverResumeMessage:
        "نص سابق محفوظ للقراءة · Previously saved text, read only",
      optionRevisions: {
        language: revision("language"),
        takeover: revision("takeover"),
      },
    };
  }
  async review() {
    this.reads++;
    this.notify();
    if (this.mode === "review-error")
      return { data: this.settings(), error: Error("Simulated stale read") };
    if (this.mode === "load-error") {
      this.mode = "normal";
      this.notify();
    }
    try {
      return { data: this.settings() };
    } catch (error) {
      return { error };
    }
  }
  async save(raw: unknown) {
    this.writes++;
    this.notify();
    const input = assistantOptionInput.parse(raw);
    if (!this.settings().canManage) throw failure("FORBIDDEN");
    if (this.mode === "conflict" && !this.simulated) {
      this.simulated = true;
      this.commit(
        input.kind === "language"
          ? {
              ...this.state,
              language: "en",
              languageVersion: this.state.languageVersion + 1,
            }
          : {
              ...this.state,
              takeoverTimeoutMinutes: 60,
              takeoverCommandsEnabled: false,
              takeoverVersion: this.state.takeoverVersion + 1,
            }
      );
      this.notify();
    }
    if (this.mode === "offline-before" && !this.simulated) {
      this.simulated = true;
      throw failure();
    }
    if (input.expectedRevision !== this.settings().optionRevisions[input.kind])
      throw failure("CONFLICT");
    const next =
      input.kind === "language"
        ? {
            ...this.state,
            language: input.language,
            languageVersion: this.state.languageVersion + 1,
          }
        : {
            ...this.state,
            ...input.draft,
            takeoverVersion: this.state.takeoverVersion + 1,
          };
    this.commit(next);
    this.notify();
    if (
      (this.mode === "lost-after" || this.mode === "review-error") &&
      !this.simulated
    ) {
      this.simulated = true;
      throw failure();
    }
    return {
      ...this.settings(),
      merchantId:
        this.mode === "foreign-result"
          ? this.merchantId + 100
          : this.merchantId,
    };
  }
  listing(page: number) {
    if (this.mode === "list-error") throw failure();
    const total = this.mode === "empty" ? 0 : 12;
    const rows = Array.from({ length: total }, (_, i) => ({
      id: i + 1,
      customerName: `عميل تجريبي ${i + 51} · Sample customer ${i + 51}`,
      customerPhone: `ux-customer-${String(i + 51).padStart(3, "0")}`,
      permanentSilence: i % 5 === 0,
      humanExpiresAt:
        i % 5 === 1
            ? new Date(this.sampledAt + 10 * 60000).toISOString()
          : i % 5 === 2
              ? new Date(this.sampledAt - 60000).toISOString()
            : i % 5 === 3
              ? "unknown"
              : null,
    }));
    return {
      rows: rows.slice((page - 1) * 10, page * 10),
      total,
      directReplyHours: 24,
      manualMaxHours: 24,
    };
  }
}
