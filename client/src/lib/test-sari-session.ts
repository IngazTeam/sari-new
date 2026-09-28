import { testDealValue } from "@shared/test-sari-workspace";

export interface TestMessage {
  id: string;
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
  }): Promise<unknown>;
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
type Failure = "session" | "saveUser" | "reply" | "saveReply" | "deal";
export interface TestSessionState {
  conversationId: number | null;
  messages: TestMessage[];
  busy: boolean;
  error: Failure | null;
  forbidden: boolean;
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
    this.update({
      error: stage,
      forbidden:
        (error as { data?: { code?: string } })?.data?.code === "FORBIDDEN",
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
      this.requestId = null;
      this.update({
        conversationId: result.conversationId,
        messages: [],
        deal: null,
        ratingHistory: [],
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
        await this.api.save({
          conversationId,
          clientMessageId: pending.user.id,
          sender: "user",
          content: pending.user.content,
        });
        pending.userSaved = true;
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
      await this.api.save({
        conversationId,
        clientMessageId: pending.reply.id,
        sender: "sari",
        content: pending.reply.content,
        responseTime: pending.responseTime,
      });
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
    if (this.pending) return this.completeMessage();
    return false;
  }
  rate(id: string, rating: "positive" | "negative") {
    if (
      this.state.busy ||
      this.state.error ||
      !this.state.messages.some(
        m => m.id === id && m.role === "assistant" && m.source !== "guardrail"
      )
    )
      return;
    const messages = this.state.messages.map(m =>
      m.id === id
        ? { ...m, rating: m.rating === rating ? undefined : rating }
        : m
    );
    const positive = messages.filter(m => m.rating === "positive").length,
      negative = messages.filter(m => m.rating === "negative").length;
    this.update({
      messages,
      ratingHistory: [
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
      ],
    });
  }
}
