import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  call: vi.fn(),
  history: vi.fn(),
  session: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  rag: vi.fn(),
  review: vi.fn(),
  escalate: vi.fn(),
  understanding: vi.fn(),
}));
vi.mock("./openai", () => ({ callGPT4: m.call }));
vi.mock("../db", async original => ({
  ...(await original<typeof import("../db")>()),
  getDb: async () => null,
  getPool: async () => null,
  getMerchantById: async () => ({ businessName: "متجر الاختبار" }),
  getMessagesByConversationId: m.history,
  getConversationsByMerchantId: async () => [],
  getOrCreatePersonalitySettings: async () => ({
    maxResponseLength: 200,
    tone: "professional",
  }),
  getBotSettings: async () => ({}),
  getProductsByMerchantId: async () => [
    {
      id: 7,
      merchantId: 71,
      name: "الخيار المسائي",
      price: 12500,
      priceUnit: "minor",
      currency: "SAR",
      stock: 3,
    },
  ],
  getActiveFaqsForBot: async () => [],
  getDiscoveredPagesByMerchantId: async () => [],
  getWebsiteAnalysesByMerchant: async () => [],
  getKnowledgeDocByMerchantId: async () => null,
}));
vi.mock("./conversation-understanding", async original => ({
  ...(await original<typeof import("./conversation-understanding")>()),
  understandConversation: m.understanding,
}));
vi.mock("./customer-memory", async original => ({
  ...(await original<typeof import("./customer-memory")>()),
  captureDirectCustomerMemory: async () => ({
    reply: null,
    forgetBeforeMessageId: 0,
  }),
  readCustomerMemory: async () => ({
    facts: [],
    revision: 0,
    forgetBeforeMessageId: 0,
  }),
}));
vi.mock("../db/customer-intelligence", () => ({
  getOrCreateProfile: async () => {
    throw Error("No optional profile");
  },
  buildProfileContext: () => "",
}));
vi.mock("./budget-ledger", () => ({
  getAiBudgetStatus: async () => ({ exceeded: false }),
}));
vi.mock("../appointment-reminders", () => ({
  handleAppointmentReminder: async () => null,
}));
vi.mock("./requested-followup", () => ({
  handleRequestedFollowup: async () => null,
}));
vi.mock("./byaan-checkout-conversation", () => ({
  handleByaanCheckout: async () => null,
}));
vi.mock("./salla-checkout-conversation", () => ({
  handleSallaCheckout: async () => null,
}));
vi.mock("./checkout-conversation", () => ({
  handleLocalCheckout: async () => null,
}));
vi.mock("./booking-conversation", () => ({
  handleBookingConversation: async () => null,
}));
vi.mock("../db_zid", () => ({
  default: { isZidConnected: async () => false },
}));
vi.mock("./conversation-handoff", () => ({
  conversationHandoffSummary: async () => null,
  handoffPrompt: () => "",
}));
vi.mock("./session-store", () => ({
  getSessionWithFallback: m.session,
  updateSessionWithPersist: m.update,
  createSessionWithPersist: m.create,
}));
vi.mock("./sales-sector-settings", () => ({
  getSalesSectorSettings: async () => ({ playbook: undefined }),
}));
vi.mock("./next-best-action", () => ({
  loadNBAContext: async () => ({}),
  determineNextBestAction: async () => ({ promptInjection: "" }),
}));
vi.mock("./proactive-followup", () => ({
  cancelFollowUps: async () => {},
  scheduleFollowUp: vi.fn(),
}));
vi.mock("./lightweight-arsenal", () => ({
  loadLightweightArsenal: async () => ({ bestSellers: [] }),
}));
vi.mock("./sales-arsenal", () => ({
  loadArsenal: async () => ({}),
  selectPersuasion: () => ({ strategy: "none", prompt: "" }),
}));
vi.mock("../automation/onboarding-interview", () => ({
  buildOnboardingContext: async () => "",
}));
vi.mock("./rag-engine", () => ({
  buildRAGContext: m.rag,
  cacheSuccessfulResponse: async () => {},
}));
vi.mock("../db/knowledge", () => ({ getBotSections: async () => [] }));
vi.mock("./learning-engine", () => ({ buildDNAPrompt: async () => "" }));
vi.mock("./customer-state", () => ({
  buildCustomerStateSummary: () => "LATE_CUSTOMER_STATE",
}));
vi.mock("./review-sales-response", () => ({ reviewSalesResponse: m.review }));
vi.mock("../db/quality-metrics", () => ({ recordMetric: async () => {} }));
vi.mock("../db/ai-directives", () => ({
  buildDirectivesPrompt: async () => "",
}));
vi.mock("./smart-escalation", () => ({
  handleSmartEscalation: m.escalate,
  evaluateSmartEscalationV2: () => ({ shouldEscalate: false }),
}));
vi.mock("./sentiment-analysis", () => ({
  analyzeSentiment: async () => ({ sentiment: "neutral" }),
  adjustResponseForSentiment: (response: string) => response,
}));
import { chatWithSari } from "./sari-personality";
import { CONTEXTUAL_REPLY_UNAVAILABLE } from "./sales-reply-prompt";
import { conversationUnderstandingIdentity } from "./conversation-understanding-context";

const input = {
  merchantId: 71,
  conversationId: 31,
  incomingMessageId: 13,
  customerPhone: "966500000091",
  message: "طيب وضح لي الفرق بينه وبين الأول",
};
const savedHistory = [
  { id: 11, direction: "incoming", content: "أريد خيارًا يناسب وقتي" },
  { id: 12, direction: "outgoing", content: "أشرح لك الخيار المسائي؟" },
];
const state = {
  contextSchemaVersion: 3,
  contextPrompt: "SAVED_DIALOGUE_STATE",
  ragFacts: "",
  sentimentTrajectory: [],
  persuasionUsed: [],
  messageCount: 2,
};
beforeEach(() => {
  vi.resetAllMocks();
  m.history.mockResolvedValue([
    ...savedHistory,
    { id: 13, direction: "incoming", content: input.message },
  ]);
  m.session.mockResolvedValue(null);
  m.update.mockResolvedValue({ ...state });
  m.rag.mockResolvedValue({
    sectionsUsed: 1,
    facts: "تفصيل موثق عن المنتج.\n".repeat(2400) + "FINAL_CATALOG_FACT",
    behaviors: "",
  });
  m.review.mockImplementation(async ({ response }) => response);
  m.call.mockResolvedValue(
    "الفرق في موعد الاستخدام، ويمكنك اختيار الأنسب لوقتك."
  );
  m.understanding.mockImplementation(async source => ({
    ...source,
    model: "central-admin-model",
    analysis: {
      version: 1,
      intent: "comparing",
      goal: "compare_suitable_options",
      action: "respond",
      confidence: 0.98,
      conditional: false,
      ambiguous: false,
      targetQuoteId: null,
      targetProvider: "none",
      productIds: [7],
      sessionIndex: null,
      requestKind: "ordinary",
      sentiment: "neutral",
      topicChanged: false,
      objection: "timing",
      needs: ["ملاءمة وقت العميل"],
      unresolvedQuestions: ["الفرق بين الخيارين"],
      summary: "يقارن الموعد بما يناسب وقته.",
      nextStep: "compare",
      evidence: [{ messageId: 13, excerpt: input.message }],
    },
  }));
});
describe.each(["fast", "full"])(
  "contextual %s generation through the real reply orchestrator",
  path => {
    beforeEach(() => {
      if (path === "fast") m.session.mockResolvedValue({ ...state });
    });
    it("keeps late facts, interpreted needs and both speakers in the governed reply, then runs the common review", async () => {
      m.call.mockImplementation(async (messages, options) => {
        expect(options.taskType).toBe("sari.reply");
        expect(conversationUnderstandingIdentity()?.model).toBe(
          "central-admin-model"
        );
        const systems = messages.filter(
          (message: any) => message.role === "system"
        );
        expect(systems.length).toBeGreaterThan(2);
        expect(
          messages.every(
            (message: any) =>
              typeof message.content === "string" &&
              message.content.length <= 16000
          )
        ).toBe(true);
        expect(
          systems.map((message: any) => message.content).join("")
        ).toContain("FINAL_CATALOG_FACT");
        expect(
          systems.map((message: any) => message.content).join("")
        ).toContain("LATE_CUSTOMER_STATE");
        expect(
          systems.map((message: any) => message.content).join("")
        ).toContain("ملاءمة وقت العميل");
        expect(messages.slice(-3)).toEqual([
          ...savedHistory.map(message => ({
            role: message.direction === "incoming" ? "user" : "assistant",
            content: message.content,
          })),
          { role: "user", content: input.message },
        ]);
        return "هذه مقارنة الخيارين حسب الموعد المناسب لك.";
      });
      expect(await chatWithSari(input)).toBe(
        "هذه مقارنة الخيارين حسب الموعد المناسب لك."
      );
      expect(m.call).toHaveBeenCalledOnce();
      expect(m.review).toHaveBeenCalledOnce();
      expect(m.escalate).not.toHaveBeenCalled();
      expect(m.create).toHaveBeenCalledTimes(path === "full" ? 1 : 0);
      expect(conversationUnderstandingIdentity()).toBeUndefined();
    });
    it.each([
      "provider failure",
      "timeout",
      "API key authentication",
      "AI services are disabled by an administrator",
      "budget_exceeded",
    ])(
      "does not retry a context-free reply or invent a handoff after %s",
      async reason => {
        m.call.mockRejectedValue(Error(reason));
        expect(await chatWithSari(input)).toBe(CONTEXTUAL_REPLY_UNAVAILABLE);
        expect(m.call).toHaveBeenCalledOnce();
        expect(m.review).not.toHaveBeenCalled();
        expect(m.escalate).not.toHaveBeenCalled();
      }
    );
    it("does not pay for a reply after its saved history cannot be read", async () => {
      m.history.mockRejectedValue(Error("synthetic history failure"));
      expect(await chatWithSari(input)).toBe(CONTEXTUAL_REPLY_UNAVAILABLE);
      expect(m.call).not.toHaveBeenCalled();
      expect(m.escalate).not.toHaveBeenCalled();
    });
    it("can continue after a historical media record without text", async () => {
      m.history.mockResolvedValue([
        { id: 9, direction: "incoming", content: "" },
        ...savedHistory,
      ]);
      expect(await chatWithSari(input)).toBe(
        "الفرق في موعد الاستخدام، ويمكنك اختيار الأنسب لوقتك."
      );
      expect(m.call).toHaveBeenCalledOnce();
      expect(
        m.call.mock.calls[0][0].every((message: any) => message.content !== "")
      ).toBe(true);
    });
    it("rejects an oversized historical message before generation without shortening it", async () => {
      m.history.mockResolvedValue([
        { id: 11, direction: "incoming", content: "x".repeat(16001) },
      ]);
      expect(await chatWithSari(input)).toBe(CONTEXTUAL_REPLY_UNAVAILABLE);
      expect(m.call).not.toHaveBeenCalled();
    });
  }
);
