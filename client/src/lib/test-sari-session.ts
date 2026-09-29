import { testDealValue } from "@shared/test-sari-workspace";
import type {
  TestFeedbackResult,
  TestRating,
} from "@shared/test-feedback-workspace";

export interface TestMessage {
  id: string;
  savedId?: number;
  ratingRevision?: number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  rating?: "positive" | "negative";
  source?: "model" | "guardrail";
  historyTruncated?: boolean;
  historyMessageCount?: number;
}
interface TestApi {
  create(input: { requestId: string }): Promise<{ conversationId: number }>;
  save(input: {
    conversationId: number;
    clientMessageId: string;
    sender: "user" | "sari";
    content: string;
    responseTime?: number;
    replySource?: "model" | "guardrail";
  }): Promise<{ messageId: number }>;
  rate?(input: {
    conversationId: number;
    messageId: number;
    requestId: string;
    expectedRevision: number;
    rating: TestRating;
  }): Promise<TestFeedbackResult>;
  readRating?(input: {
    conversationId: number;
    messageId: number;
  }): Promise<Pick<TestFeedbackResult, "messageId" | "rating" | "revision">>;
  send(input: {
    conversationId: number;
    clientMessageId: string;
    message: string;
  }): Promise<{
    response: string;
    source?: "model" | "guardrail";
    historyTruncated?: boolean;
    historyMessageCount?: number;
  }>;
  deal(input: {
    conversationId: number;
    dealValue: number;
  }): Promise<{ dealId: number; dealValue: number }>;
}
type Failure =
  | "session"
  | "saveUser"
  | "reply"
  | "saveReply"
  | "deal"
  | "rating";
export interface TestSessionState {
  conversationId: number | null;
  messages: TestMessage[];
  busy: boolean;
  error: Failure | null;
  forbidden: boolean;
  ratingConflict: boolean;
  ratingSuperseded: boolean;
  deal: { value: number } | null;
  ratingHistory: {
    timestamp: Date;
    satisfactionRate: number | null;
    positive: number;
    negative: number;
  }[];
}

// Owns the operation lock independently of React renders. Retries retain the
// original IDs and received reply, so a lost acknowledgement cannot duplicate a save.
export class TestSariSession {
  private state: TestSessionState = {
    conversationId: null,
    messages: [],
    busy: false,
    error: null,
    forbidden: false,
    ratingConflict: false,
    ratingSuperseded: false,
    deal: null,
    ratingHistory: [],
  };
  private listeners = new Set<() => void>();
  private requestId: string | null = null;
  private pending: {
    user: TestMessage;
    reply?: TestMessage;
    userSaved: boolean;
    responseTime?: number;
  } | null = null;
  private pendingDeal: number | null = null;
  private pendingRating: {
    id: string;
    input: Parameters<NonNullable<TestApi["rate"]>>[0];
  } | null = null;
  constructor(
    private api: TestApi,
    private uuid = () => crypto.randomUUID(),
    private now = () => new Date()
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<TestSessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private failure(error: unknown, stage: Failure) {
    const code = (error as { data?: { code?: string } })?.data?.code;
    this.update({
      error: stage,
      forbidden: code === "FORBIDDEN" || code === "UNAUTHORIZED",
      ratingConflict:
        stage === "rating" &&
        (this.state.ratingConflict || code === "CONFLICT"),
    });
  }
  async start(): Promise<boolean> {
    if (this.state.busy) return false;
    this.update({ busy: true, error: null, forbidden: false });
    try {
      this.requestId ??= this.uuid();
      const result = await this.api.create({ requestId: this.requestId });
      this.pending = null;
      this.pendingDeal = null;
      this.pendingRating = null;
      this.requestId = null;
      this.update({
        conversationId: result.conversationId,
        messages: [],
        deal: null,
        ratingHistory: [],
        ratingConflict: false,
        ratingSuperseded: false,
      });
      return true;
    } catch (error) {
      this.failure(error, "session");
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  async send(text: string): Promise<boolean> {
    const content = text.trim();
    if (
      this.state.busy ||
      this.state.error ||
      !this.state.conversationId ||
      !content ||
      content.length > 2000
    )
      return false;
    const user: TestMessage = {
      id: this.uuid(),
      role: "user",
      content,
      timestamp: this.now(),
    };
    this.pending = { user, userSaved: false };
    this.update({ messages: [...this.state.messages, user] });
    return this.completeMessage();
  }
  private async completeMessage(): Promise<boolean> {
    if (this.state.busy || !this.pending || !this.state.conversationId)
      return false;
    this.update({ busy: true, error: null, forbidden: false });
    const pending = this.pending,
      conversationId = this.state.conversationId;
    let stage: Failure = "saveUser";
    try {
      if (!pending.userSaved) {
        const saved = await this.api.save({
          conversationId,
          clientMessageId: pending.user.id,
          sender: "user",
          content: pending.user.content,
        });
        if (!Number.isSafeInteger(saved.messageId) || saved.messageId < 1)
          throw Error("Unconfirmed save");
        pending.userSaved = true;
        pending.user.savedId = saved.messageId;
      }
      stage = "reply";
      if (!pending.reply) {
        const started = this.now().getTime();
        const result = await this.api.send({
          conversationId,
          clientMessageId: pending.user.id,
          message: pending.user.content,
        });
        pending.responseTime = Math.min(
          3600000,
          Math.max(0, this.now().getTime() - started)
        );
        pending.reply = {
          id: this.uuid(),
          role: "assistant",
          content: result.response,
          source: result.source,
          historyTruncated: result.historyTruncated,
          historyMessageCount: result.historyMessageCount,
          timestamp: this.now(),
        };
        this.update({ messages: [...this.state.messages, pending.reply] });
      }
      stage = "saveReply";
      const saved = await this.api.save({
        conversationId,
        clientMessageId: pending.reply.id,
        sender: "sari",
        content: pending.reply.content,
        responseTime: pending.responseTime,
        replySource: pending.reply.source,
      });
      if (!Number.isSafeInteger(saved.messageId) || saved.messageId < 1)
        throw Error("Unconfirmed save");
      pending.reply.savedId = saved.messageId;
      pending.reply.ratingRevision = 0;
      this.update({ messages: [...this.state.messages] });
      this.pending = null;
      return true;
    } catch (error) {
      this.failure(error, stage);
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  async markDeal(value: number): Promise<boolean> {
    if (
      this.state.busy ||
      !this.state.conversationId ||
      this.state.deal ||
      this.pending ||
      this.pendingRating ||
      this.requestId ||
      !testDealValue.safeParse(value).success
    )
      return false;
    this.pendingDeal ??= value;
    this.update({ busy: true, error: null, forbidden: false });
    try {
      const saved = await this.api.deal({
        conversationId: this.state.conversationId,
        dealValue: this.pendingDeal,
      });
      this.pendingDeal = null;
      this.update({ deal: { value: saved.dealValue } });
      return true;
    } catch (error) {
      this.failure(error, "deal");
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  async retry(): Promise<boolean> {
    if (this.state.busy || this.state.forbidden) return false;
    if (this.state.error === "session") return this.start();
    if (this.state.error === "deal" && this.pendingDeal !== null)
      return this.markDeal(this.pendingDeal);
    if (this.state.error === "rating" && !this.state.ratingConflict)
      return this.saveRating();
    if (this.pending) return this.completeMessage();
    return false;
  }
  async rate(id: string, rating: "positive" | "negative"): Promise<boolean> {
    if (
      !this.api.rate ||
      this.state.busy ||
      this.state.error ||
      !this.state.messages.some(
        m =>
          m.id === id &&
          m.role === "assistant" &&
          m.source !== "guardrail" &&
          m.savedId
      )
    )
      return false;
    const target = this.state.messages.find(m => m.id === id)!;
    try {
      this.pendingRating = {
        id,
        input: {
          conversationId: this.state.conversationId!,
          messageId: target.savedId!,
          rating: target.rating === rating ? null : rating,
          expectedRevision: target.ratingRevision ?? 0,
          requestId: this.uuid(),
        },
      };
    } catch (error) {
      this.failure(error, "rating");
      return false;
    }
    return this.saveRating();
  }
  private applyRating(
    id: string,
    result: Pick<TestFeedbackResult, "rating" | "revision">,
    recordHistory: boolean
  ) {
    const messages = this.state.messages.map(m =>
      m.id === id
        ? {
            ...m,
            rating: result.rating ?? undefined,
            ratingRevision: result.revision,
          }
        : m
    );
    const positive = messages.filter(m => m.rating === "positive").length,
      negative = messages.filter(m => m.rating === "negative").length;
    this.update({
      messages,
      ratingHistory: recordHistory
        ? [
            ...this.state.ratingHistory,
            {
              timestamp: this.now(),
              positive,
              negative,
              satisfactionRate:
                positive + negative
                  ? Math.round((positive / (positive + negative)) * 100)
                  : null,
            },
          ]
        : this.state.ratingHistory,
    });
  }
  private async saveRating(): Promise<boolean> {
    if (this.state.busy || !this.pendingRating || !this.api.rate) return false;
    const pending = this.pendingRating;
    this.update({
      busy: true,
      error: null,
      forbidden: false,
      ratingConflict: false,
      ratingSuperseded: false,
    });
    try {
      const result = await this.api.rate(pending.input);
      if (result.messageId !== pending.input.messageId)
        throw Error("Unexpected reply");
      this.applyRating(pending.id, result, !result.superseded);
      this.pendingRating = null;
      this.update({ ratingSuperseded: result.superseded });
      return !result.superseded;
    } catch (error) {
      this.failure(error, "rating");
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  async reviewRating(): Promise<boolean> {
    if (this.state.busy || this.state.forbidden || !this.pendingRating || !this.api.readRating)
      return false;
    const pending = this.pendingRating;
    this.update({ busy: true });
    try {
      const result = await this.api.readRating({
        conversationId: pending.input.conversationId,
        messageId: pending.input.messageId,
      });
      if (result.messageId !== pending.input.messageId)
        throw Error("Unexpected reply");
      this.applyRating(pending.id, result, false);
      this.pendingRating = null;
      this.update({
        error: null,
        ratingConflict: false,
        ratingSuperseded: true,
      });
      return true;
    } catch (error) {
      this.failure(error, "rating");
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
}
