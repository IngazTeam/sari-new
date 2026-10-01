import { z } from "zod";
import { assistantSettingsDraft } from "../../../shared/assistant-settings-draft";
import {
  getWorkingScheduleErrors,
  workingTimeSchema,
  workingDaysSchema,
} from "../../../shared/bot-working-schedule";
import {
  defaultDiscountPolicy,
  discountPolicySchema,
  discountPolicyUpdateSchema,
} from "../../../shared/discount-policy";
import {
  defaultMarginPolicy,
  marginPolicySchema,
  marginPolicyUpdateSchema,
} from "../../../shared/checkout-margin";

export const settingsModes = [
  "normal",
  "empty",
  "viewer",
  "offline-before",
  "lost-after",
  "conflict",
  "load-error",
  "review-error",
  "foreign-result",
  "policy-load-error",
  "status-error",
  "preview-error",
  "send-error",
] as const;
export type SettingsMode = (typeof settingsModes)[number];
const draftSchema = z
  .object({
    autoReplyEnabled: z.boolean(),
    workingHoursEnabled: z.boolean(),
    workingHoursStart: workingTimeSchema,
    workingHoursEnd: workingTimeSchema,
    workingDays: workingDaysSchema,
    welcomeMessage: z.string(),
    outOfHoursMessage: z.string(),
    responseDelay: z.number().min(1).max(10),
    maxResponseLength: z.number().min(50).max(500),
    tone: z.enum(["friendly", "professional", "casual", "enthusiastic"]),
    style: z.enum(["saudi_dialect", "formal_arabic", "english", "bilingual"]),
    emojiUsage: z.enum(["none", "minimal", "moderate", "frequent"]),
    personalityInstructions: z.string().max(2000),
    brandVoice: z.string().max(2000),
    language: z.enum(["ar", "en", "fr", "tr", "es", "it", "both"]),
    customInstructions: z.string().max(10000).nullable(),
    groupMode: z.enum([
      "disabled",
      "mention_only",
      "keyword_only",
      "private_redirect",
    ]),
    groupKeywords: z.string().max(5000),
    groupRedirectMessage: z.string().max(500),
  })
  .strict();
const historyBase = {
  revision: z.number().int().positive(),
  actorUserId: z.literal(900181),
  createdAt: z.string().datetime(),
};
const discountHistory = z
  .object({
    ...historyBase,
    beforePolicy: discountPolicySchema,
    afterPolicy: discountPolicySchema,
  })
  .strict();
const marginHistory = z
  .object({
    ...historyBase,
    beforePolicy: marginPolicySchema,
    afterPolicy: marginPolicySchema,
  })
  .strict();
const storedSchema = z
  .object({
    version: z.literal(1),
    merchantId: z.number().int(),
    settings: draftSchema,
    settingsVersion: z.number().int().positive(),
    discount: discountPolicySchema,
    discountVersion: z.number().int().positive(),
    discountHistory: z.array(discountHistory),
    margin: marginPolicySchema,
    marginVersion: z.number().int().positive(),
    marginHistory: z.array(marginHistory),
  })
  .strict();
const initial = (merchantId: number) =>
  storedSchema.parse({
    version: 1,
    merchantId,
    settings: assistantSettingsDraft({
      autoReplyEnabled: true,
      welcomeMessage: "مرحبًا بك · Welcome",
      outOfHoursMessage:
        "سنرد خلال أوقات العمل · We will reply during working hours",
    }),
    settingsVersion: 1,
    discount: defaultDiscountPolicy,
    discountVersion: 1,
    discountHistory: [],
    margin: defaultMarginPolicy,
    marginVersion: 1,
    marginHistory: [],
  });
const failure = (code = "INTERNAL_SERVER_ERROR") => ({ data: { code } });
type Kind = "settings" | "discount" | "margin";
export class AssistantSettingsPreviewModel {
  readonly actorId = 900181;
  mode: SettingsMode = "normal";
  writes = 0;
  reads = 0;
  previews = 0;
  sends = 0;
  storageError = false;
  private state: z.infer<typeof storedSchema>;
  private generation = 0;
  private listeners = new Set<() => void>();
  private simulated = new Set<Kind>();
  private checkedAt = new Date().toISOString();
  constructor(
    readonly merchantId: number,
    private storage: Pick<Storage, "getItem" | "setItem">,
  ) {
    if (![181, 182].includes(merchantId)) throw Error("Invalid sample tenant");
    this.state = initial(merchantId);
    try {
      const raw = storage.getItem(this.key);
      if (raw) {
        const stored = storedSchema.parse(JSON.parse(raw));
        if (stored.merchantId !== merchantId) throw Error("Foreign sample");
        this.state = stored;
      }
    } catch {
      this.storageError = true;
    }
  }
  private get key() {
    return `sary:assistant-settings-preview:181:${this.merchantId}`;
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
  private commit(next: typeof this.state) {
    const parsed = storedSchema.parse(next);
    this.storage.setItem(this.key, JSON.stringify(parsed));
    this.state = parsed;
    this.storageError = false;
  }
  private proof(kind: Kind) {
    return (
      BigInt(this.merchantId) * 100000000n +
      BigInt(this.state[`${kind}Version`]) * 4n +
      BigInt(["settings", "discount", "margin"].indexOf(kind))
    )
      .toString(16)
      .padStart(64, "0");
  }
  private readable() {
    if (this.storageError || this.mode === "load-error") throw failure();
  }
  private writable() {
    this.readable();
    if (this.mode === "viewer") throw failure("FORBIDDEN");
  }
  reset(mode: SettingsMode) {
    const next = initial(this.merchantId);
    if (mode === "empty") {
      next.settings.welcomeMessage = "";
      next.settings.outOfHoursMessage = "";
    }
    this.commit(next);
    this.mode = mode;
    this.simulated.clear();
    this.writes = 0;
    this.reads = 0;
    this.sends = 0;
    this.previews = 0;
    this.checkedAt = new Date().toISOString();
    this.notify();
  }
  settings() {
    this.readable();
    return {
      ...structuredClone(this.state.settings),
      merchantId: this.merchantId,
      canManage: this.mode !== "viewer",
      formRevision: this.proof("settings"),
    };
  }
  async review() {
    this.reads++;
    this.notify();
    if (this.mode === "review-error")
      return {
        data: this.settings(),
        error: Error("Simulated stale response"),
        isError: true,
      };
    if (this.mode === "load-error") {
      this.mode = "normal";
      this.notify();
    }
    try {
      return { data: this.settings(), isError: false };
    } catch (error) {
      return { error, isError: true };
    }
  }
  status() {
    this.readable();
    if (this.mode === "status-error") throw failure();
    const s = this.state.settings;
    let reason: string | undefined;
    if (!s.autoReplyEnabled) reason = "Auto-reply is disabled";
    else if (s.workingHoursEnabled) {
      const now = new Date(
          new Date(this.checkedAt).toLocaleString("en-US", {
            timeZone: "Asia/Riyadh",
          }),
        ),
        day = now.getDay(),
        time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const days = s.workingDays.split(",").filter(Boolean).map(Number),
        start = s.workingHoursStart,
        end = s.workingHoursEnd;
      const overnight = start > end;
      const allowed = overnight
        ? time >= start
          ? days.includes(day)
          : time < end && days.includes((day + 6) % 7)
        : days.includes(day) && time >= start && time < end;
      if (!allowed)
        reason =
          !overnight && !days.includes(day)
            ? "Outside working days"
            : "Outside working hours";
    }
    return {
      merchantId: this.merchantId,
      checkedAt: this.checkedAt,
      shouldRespond: !reason,
      reason,
    };
  }
  async refreshStatus() {
    this.checkedAt = new Date().toISOString();
    if (this.mode === "status-error") this.mode = "normal";
    this.notify();
    try {
      return { data: this.status() };
    } catch (error) {
      return { error };
    }
  }
  private before(kind: Kind) {
    this.writes++;
    this.notify();
    this.writable();
    if (this.mode === "offline-before" && !this.simulated.has(kind)) {
      this.simulated.add(kind);
      throw failure();
    }
    if (this.mode === "conflict" && !this.simulated.has(kind)) {
      this.simulated.add(kind);
      const next = structuredClone(this.state);
      if (kind === "settings") {
        next.settings.brandVoice = "تعديل من زميل · Another editor";
        next.settings.language = "en";
        next.settingsVersion++;
      } else if (kind === "discount") {
        next.discount = { enabled: true, maxPercent: 20, expireHours: 24 };
        next.discountVersion++;
      } else {
        next.margin = { enabled: true, minPercent: 25 };
        next.marginVersion++;
      }
      this.commit(next);
      this.notify();
    }
  }
  private after(kind: Kind) {
    this.notify();
    if (
      ["lost-after", "review-error"].includes(this.mode) &&
      !this.simulated.has(kind)
    ) {
      this.simulated.add(kind);
      throw failure();
    }
  }
  async save(raw: unknown) {
    const input = draftSchema
      .extend({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(raw);
    const { expectedRevision, ...draft } = input;
    if (Object.keys(getWorkingScheduleErrors(draft)).length)
      throw failure("BAD_REQUEST");
    this.before("settings");
    if (expectedRevision !== this.proof("settings")) throw failure("CONFLICT");
    this.commit({
      ...this.state,
      settings: draft,
      settingsVersion: this.state.settingsVersion + 1,
    });
    this.after("settings");
    return {
      ...this.settings(),
      merchantId:
        this.mode === "foreign-result"
          ? this.merchantId + 100
          : this.merchantId,
    };
  }
  policy(kind: "discount" | "margin") {
    this.readable();
    if (this.mode === "policy-load-error") throw failure();
    return {
      merchantId: this.merchantId,
      policy: structuredClone(this.state[kind]),
      revision: this.state[`${kind}Version`],
      evidence: this.proof(kind),
      canManage: this.mode !== "viewer",
      history: structuredClone(this.state[`${kind}History`].slice(0, 10)),
    };
  }
  async reviewPolicy(kind: "discount" | "margin") {
    this.reads++;
    if (this.mode === "policy-load-error") this.mode = "normal";
    this.notify();
    try {
      return { data: this.policy(kind), isError: this.mode === "review-error" };
    } catch (error) {
      return { error, isError: true };
    }
  }
  async savePolicy(kind: "discount" | "margin", raw: unknown) {
    const input = (
      kind === "discount"
        ? discountPolicyUpdateSchema
        : marginPolicyUpdateSchema
    ).parse(raw);
    this.before(kind);
    if (
      input.expectedRevision !== this.state[`${kind}Version`] ||
      input.evidence !== this.proof(kind)
    )
      throw failure("CONFLICT");
    const next = structuredClone(this.state),
      revision = next[`${kind}Version`] + 1;
    const row = {
      revision,
      actorUserId: this.actorId,
      createdAt: new Date().toISOString(),
      beforePolicy: next[kind],
      afterPolicy: input.policy,
    };
    if (kind === "discount") {
      next.discount = discountPolicySchema.parse(input.policy);
      next.discountVersion = revision;
      next.discountHistory.unshift(discountHistory.parse(row));
    } else {
      next.margin = marginPolicySchema.parse(input.policy);
      next.marginVersion = revision;
      next.marginHistory.unshift(marginHistory.parse(row));
    }
    this.commit(next);
    this.after(kind);
    return {
      ...this.policy(kind),
      merchantId:
        this.mode === "foreign-result"
          ? this.merchantId + 100
          : this.merchantId,
    };
  }
  async preview(raw: unknown) {
    this.writable();
    const input = z
      .object({ message: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(raw);
    this.previews++;
    this.notify();
    if (this.mode === "preview-error") throw failure();
    return {
      response: `مثال ثابت للتصميم فقط · Fixed layout sample: ${input.message}`,
      source: "guardrail" as const,
      historyMessageCount: 0,
      historyTruncated: false,
    };
  }
  async sendTest() {
    this.writable();
    this.sends++;
    this.notify();
    if (this.mode === "send-error") throw failure();
    return {
      message:
        "محاكاة فقط: لم تُرسل رسالة واتساب · Simulation only: no WhatsApp message sent",
    };
  }
}
