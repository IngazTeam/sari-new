export type SariTaskStatus = "existing" | "planned";

export type SariTaskContract = {
  taskType: `sari.${string}`;
  aliases: readonly `sari.${string}`[];
  businessNameAr: string;
  status: SariTaskStatus;
  priority: "P0" | "P1" | "P2";
  owner: string;
  sourceFiles: readonly string[];
  execution: "sync" | "async";
  dataClassification: "green" | "amber" | "red";
  externalProcessing: "allow" | "deny";
  humanReviewRequired: boolean;
  timeoutMs: number;
  fallback: string;
  inputKind: "message" | "conversation" | "catalog" | "analysis" | "outcome";
  outputKind: "text" | "classification" | "recommendation" | "analysis" | "receipt";
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  sampleInput: Record<string, unknown>;
  sampleOutput: Record<string, unknown>;
  goldenCases: readonly Record<string, unknown>[];
  rejectionCases: readonly Record<string, unknown>[];
};

type TaskDefinition = Omit<
  SariTaskContract,
  | "inputSchema"
  | "outputSchema"
  | "sampleInput"
  | "sampleOutput"
  | "goldenCases"
  | "rejectionCases"
> & {
  inputKind: "message" | "conversation" | "catalog" | "analysis" | "outcome";
  outputKind: "text" | "classification" | "recommendation" | "analysis" | "receipt";
};

const boundedString = (maxLength: number, minLength = 1) => ({
  type: "string",
  minLength,
  maxLength,
});

const identifier = {
  ...boundedString(128),
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
};

const stringList = (maxItems: number, maxLength: number) => ({
  type: "array",
  maxItems,
  items: boundedString(maxLength),
});

const promptMessages = {
  type: "array",
  minItems: 1,
  maxItems: 100,
  items: {
    type: "object",
    additionalProperties: false,
    maxProperties: 2,
    properties: {
      role: { type: "string", enum: ["system", "user", "assistant"], maxLength: 16 },
      content: boundedString(16_000),
    },
    required: ["role", "content"],
  },
};

function closedSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    maxProperties: Object.keys(properties).length,
    properties,
    required,
  };
}

function closedInputSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return closedSchema(
    { ...properties, promptMessages },
    [...required, "promptMessages"],
  );
}

function inputContract(kind: TaskDefinition["inputKind"]): {
  schema: Record<string, unknown>;
  sample: Record<string, unknown>;
} {
  const operationId = "operation_demo_001";

  switch (kind) {
    case "message":
      return {
        schema: closedInputSchema({
          operationId: identifier,
          conversationId: identifier,
          message: boundedString(8_000),
          conversationSummary: boundedString(12_000, 0),
          language: { ...boundedString(12), pattern: "^[a-z]{2}(?:-[A-Z]{2})?$" },
          referenceIds: stringList(50, 128),
        }, ["operationId", "conversationId", "message"]),
        sample: {
          operationId,
          conversationId: "conversation_demo_001",
          message: "أرغب في معرفة العرض الأنسب لاحتياج تجريبي.",
          conversationSummary: "محادثة تجريبية بلا بيانات عميل حقيقية.",
          language: "ar",
          referenceIds: ["reference_demo_001"],
          promptMessages: [
            { role: "system", content: "نفّذ المهمة وفق سياسة Sari." },
            { role: "user", content: "أرغب في معرفة العرض الأنسب لاحتياج تجريبي." },
          ],
        },
      };
    case "conversation":
      return {
        schema: closedInputSchema({
          operationId: identifier,
          conversationId: identifier,
          messages: stringList(100, 8_000),
          objective: boundedString(1_000),
          periodStart: { ...boundedString(32), format: "date-time" },
          periodEnd: { ...boundedString(32), format: "date-time" },
        }, ["operationId", "conversationId", "messages"]),
        sample: {
          operationId,
          conversationId: "conversation_demo_001",
          messages: [
            "العميل التجريبي يسأل عن باقة مناسبة.",
            "تم توضيح خصائص الباقة التجريبية.",
          ],
          objective: "تحليل المحادثة دون تنفيذ أي أثر جانبي.",
          promptMessages: [
            { role: "system", content: "حلل المحادثة وأعد النتيجة المطلوبة فقط." },
            { role: "user", content: "حلل المحادثة التجريبية." },
          ],
        },
      };
    case "catalog":
      return {
        schema: closedInputSchema({
          operationId: identifier,
          query: boundedString(4_000),
          productIds: stringList(100, 128),
          constraints: stringList(20, 500),
          language: { ...boundedString(12), pattern: "^[a-z]{2}(?:-[A-Z]{2})?$" },
        }, ["operationId", "query"]),
        sample: {
          operationId,
          query: "ابحث في عناصر الكتالوج التجريبية عن خيار مناسب.",
          productIds: ["product_demo_001", "product_demo_002"],
          constraints: ["لا تنشئ سعرًا غير موجود"],
          language: "ar",
          promptMessages: [
            { role: "system", content: "استخدم عناصر الكتالوج المرسلة فقط." },
            { role: "user", content: "ابحث عن خيار مناسب." },
          ],
        },
      };
    case "outcome":
      return {
        schema: closedInputSchema({
          operationId: identifier,
          actionId: identifier,
          conversationId: identifier,
          outcome: {
            type: "string",
            enum: ["accepted", "rejected", "completed", "failed", "unknown"],
            maxLength: 16,
          },
          notes: boundedString(2_000, 0),
        }, ["operationId", "actionId", "conversationId", "outcome"]),
        sample: {
          operationId,
          actionId: "action_demo_001",
          conversationId: "conversation_demo_001",
          outcome: "completed",
          notes: "نتيجة تجريبية بلا بيانات عميل.",
          promptMessages: [
            { role: "system", content: "سجل النتيجة من دون أثر إضافي." },
            { role: "user", content: "سجل اكتمال الإجراء التجريبي." },
          ],
        },
      };
    case "analysis":
      return {
        schema: closedInputSchema({
          operationId: identifier,
          subjectId: identifier,
          facts: stringList(100, 4_000),
          objective: boundedString(1_000),
          allowedLabels: stringList(50, 128),
        }, ["operationId", "subjectId", "facts", "objective"]),
        sample: {
          operationId,
          subjectId: "subject_demo_001",
          facts: ["حقيقة تجريبية أولى", "حقيقة تجريبية ثانية"],
          objective: "إنتاج تحليل مقيد بالحقائق المتاحة.",
          allowedLabels: ["positive", "neutral", "negative"],
          promptMessages: [
            { role: "system", content: "حلل الحقائق المرسلة فقط." },
            { role: "user", content: "أنتج تحليلاً مقيداً بالحقائق." },
          ],
        },
      };
  }
}

function outputContract(kind: TaskDefinition["outputKind"]): {
  schema: Record<string, unknown>;
  sample: Record<string, unknown>;
} {
  const common = {
    traceId: identifier,
    applicationResponse: boundedString(16_000),
  };

  switch (kind) {
    case "text":
      return {
        schema: closedSchema(
          { ...common, text: boundedString(12_000) },
          ["traceId", "applicationResponse", "text"],
        ),
        sample: {
          traceId: "trace_demo_001",
          applicationResponse: "نص تجريبي جاهز للمراجعة.",
          text: "نص تجريبي جاهز للمراجعة.",
        },
      };
    case "classification":
      return {
        schema: closedSchema({
          ...common,
          label: boundedString(128),
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: boundedString(2_000),
        }, ["traceId", "applicationResponse", "label", "confidence", "rationale"]),
        sample: {
          traceId: "trace_demo_001",
          applicationResponse: JSON.stringify({ label: "neutral", confidence: 0.8 }),
          label: "neutral",
          confidence: 0.8,
          rationale: "تصنيف تجريبي مبني على الحقائق المرسلة فقط.",
        },
      };
    case "recommendation":
      return {
        schema: closedSchema({
          ...common,
          action: boundedString(256),
          rationale: boundedString(2_000),
          confidence: { type: "number", minimum: 0, maximum: 1 },
          requiresHumanReview: { type: "boolean" },
        }, [
          "traceId",
          "applicationResponse",
          "action",
          "rationale",
          "confidence",
          "requiresHumanReview",
        ]),
        sample: {
          traceId: "trace_demo_001",
          applicationResponse: JSON.stringify({
            action: "request_more_information",
            rationale: "المعلومات التجريبية لا تكفي.",
          }),
          action: "request_more_information",
          rationale: "المعلومات التجريبية لا تكفي لإجراء عالي المخاطر.",
          confidence: 0.74,
          requiresHumanReview: true,
        },
      };
    case "analysis":
      return {
        schema: closedSchema({
          ...common,
          summary: boundedString(8_000),
          findings: stringList(50, 2_000),
          labels: stringList(50, 128),
        }, ["traceId", "applicationResponse", "summary", "findings", "labels"]),
        sample: {
          traceId: "trace_demo_001",
          applicationResponse: JSON.stringify({ summary: "ملخص تحليلي تجريبي." }),
          summary: "ملخص تحليلي تجريبي.",
          findings: ["نتيجة تجريبية قابلة للمراجعة"],
          labels: ["neutral"],
        },
      };
    case "receipt":
      return {
        schema: closedSchema({
          ...common,
          accepted: { type: "boolean" },
          status: { type: "string", enum: ["recorded", "rejected"], maxLength: 16 },
        }, ["traceId", "applicationResponse", "accepted", "status"]),
        sample: {
          traceId: "trace_demo_001",
          applicationResponse: JSON.stringify({ accepted: true, status: "recorded" }),
          accepted: true,
          status: "recorded",
        },
      };
  }
}

function reviewCases(
  sampleInput: Record<string, unknown>,
  sampleOutput: Record<string, unknown>,
): {
  goldenCases: readonly Record<string, unknown>[];
  rejectionCases: readonly Record<string, unknown>[];
} {
  const goldenCases = Array.from({ length: 5 }, (_, index) => ({
    name: `synthetic_golden_${index + 1}`,
    input: { ...sampleInput, operationId: `operation_demo_00${index + 1}` },
    expected: sampleOutput,
  }));

  const rejectionCases = [
    { name: "missing_operation_id", input: {}, reason: "required_field_missing" },
    { name: "unknown_property", input: { ...sampleInput, unexpected: true }, reason: "closed_schema" },
    { name: "oversized_identifier", input: { ...sampleInput, operationId: "x".repeat(129) }, reason: "size_limit" },
    { name: "empty_identifier", input: { ...sampleInput, operationId: "" }, reason: "minimum_length" },
    { name: "wrong_input_type", input: [], reason: "object_required" },
  ];

  return { goldenCases, rejectionCases };
}

function defineTask(definition: TaskDefinition): SariTaskContract {
  const input = inputContract(definition.inputKind);
  const output = outputContract(definition.outputKind);
  const cases = reviewCases(input.sample, output.sample);

  return Object.freeze({
    ...definition,
    inputSchema: input.schema,
    outputSchema: output.schema,
    sampleInput: input.sample,
    sampleOutput: output.sample,
    ...cases,
  });
}

const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  {
    taskType: "sari.reply",
    aliases: [],
    businessNameAr: "صياغة رد المحادثة",
    status: "existing",
    priority: "P0",
    owner: "sari-conversation-team",
    sourceFiles: ["server/ai/sari-personality.ts", "server/ai/openai.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "text",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 25_000,
    fallback: "continue_without_automatic_reply",
  },
  {
    taskType: "sari.welcome",
    aliases: [],
    businessNameAr: "صياغة رسالة الترحيب",
    status: "existing",
    priority: "P1",
    owner: "sari-conversation-team",
    sourceFiles: ["server/ai/sari-personality.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "text",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 20_000,
    fallback: "use_static_welcome",
  },
  {
    taskType: "sari.supervisor.recovery",
    aliases: [],
    businessNameAr: "استعادة المحادثة تحت إشراف النظام",
    status: "existing",
    priority: "P0",
    owner: "sari-conversation-team",
    sourceFiles: ["server/ai/supervisor-recovery.ts"],
    execution: "sync",
    inputKind: "conversation",
    outputKind: "recommendation",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 25_000,
    fallback: "escalate_to_human",
  },
  {
    taskType: "sari.product.search",
    aliases: [],
    businessNameAr: "البحث الذكي في المنتجات",
    status: "existing",
    priority: "P0",
    owner: "sari-commerce-team",
    sourceFiles: ["server/ai/product-intelligence.ts"],
    execution: "sync",
    inputKind: "catalog",
    outputKind: "analysis",
    dataClassification: "amber",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 20_000,
    fallback: "use_deterministic_catalog_search",
  },
  {
    taskType: "sari.product.suggestions",
    aliases: [],
    businessNameAr: "اقتراح المنتجات",
    status: "existing",
    priority: "P0",
    owner: "sari-commerce-team",
    sourceFiles: ["server/ai/product-intelligence.ts"],
    execution: "sync",
    inputKind: "catalog",
    outputKind: "recommendation",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 20_000,
    fallback: "show_ranked_catalog_results",
  },
  {
    taskType: "sari.sentiment.weekly",
    aliases: [],
    businessNameAr: "تحليل المشاعر الأسبوعي",
    status: "existing",
    priority: "P1",
    owner: "sari-insights-team",
    sourceFiles: ["server/ai/weekly-sentiment.ts"],
    execution: "async",
    inputKind: "conversation",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 60_000,
    fallback: "retain_previous_weekly_summary",
  },
  {
    taskType: "sari.sentiment",
    aliases: [],
    businessNameAr: "تحليل مشاعر الرسالة",
    status: "existing",
    priority: "P0",
    owner: "sari-insights-team",
    sourceFiles: ["server/ai/sentiment-analysis.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "classification",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 15_000,
    fallback: "mark_sentiment_unknown",
  },
  {
    taskType: "sari.keyword.quick-responses",
    aliases: ["sari.keyword.quick_responses"],
    businessNameAr: "اقتراح الردود السريعة",
    status: "existing",
    priority: "P1",
    owner: "sari-conversation-team",
    sourceFiles: ["server/ai/keyword-analysis.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 20_000,
    fallback: "show_no_quick_response",
  },
  {
    taskType: "sari.knowledge.classify",
    aliases: [],
    businessNameAr: "تصنيف المعرفة",
    status: "existing",
    priority: "P1",
    owner: "sari-knowledge-team",
    sourceFiles: ["server/ai/knowledge-engine.ts"],
    execution: "sync",
    inputKind: "analysis",
    outputKind: "classification",
    dataClassification: "amber",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 20_000,
    fallback: "leave_item_unclassified",
  },
  {
    taskType: "sari.knowledge.sales-intelligence",
    aliases: ["sari.knowledge.sales_intelligence"],
    businessNameAr: "استخراج ذكاء المبيعات من المعرفة",
    status: "existing",
    priority: "P1",
    owner: "sari-knowledge-team",
    sourceFiles: ["server/ai/knowledge-engine.ts"],
    execution: "async",
    inputKind: "analysis",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 60_000,
    fallback: "retain_source_knowledge",
  },
  {
    taskType: "sari.knowledge.evolution",
    aliases: [],
    businessNameAr: "تطوير قاعدة المعرفة",
    status: "existing",
    priority: "P2",
    owner: "sari-knowledge-team",
    sourceFiles: ["server/ai/knowledge-engine.ts"],
    execution: "async",
    inputKind: "analysis",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 60_000,
    fallback: "do_not_change_knowledge",
  },
  {
    taskType: "sari.keyword.extraction",
    aliases: [],
    businessNameAr: "استخراج الكلمات المفتاحية",
    status: "existing",
    priority: "P1",
    owner: "sari-insights-team",
    sourceFiles: ["server/ai/keyword-extraction.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 15_000,
    fallback: "return_empty_keywords",
  },
  {
    taskType: "sari.insights",
    aliases: [],
    businessNameAr: "استخراج رؤى المحادثة",
    status: "existing",
    priority: "P1",
    owner: "sari-insights-team",
    sourceFiles: ["server/ai/insights.ts"],
    execution: "async",
    inputKind: "conversation",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 60_000,
    fallback: "continue_without_new_insights",
  },
  {
    taskType: "sari.sales.next-best-action",
    aliases: ["sari.action.selection", "sari.next-action"],
    businessNameAr: "اختيار أفضل إجراء تالٍ",
    status: "existing",
    priority: "P0",
    owner: "sari-sales-team",
    sourceFiles: ["server/ai/action-selector.ts"],
    execution: "sync",
    inputKind: "conversation",
    outputKind: "recommendation",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 25_000,
    fallback: "request_human_decision",
  },
  {
    taskType: "sari.merchant.intent",
    aliases: [],
    businessNameAr: "تصنيف نية التاجر",
    status: "existing",
    priority: "P0",
    owner: "sari-merchant-team",
    sourceFiles: ["server/ai/merchant-mode.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "classification",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 15_000,
    fallback: "mark_intent_unknown",
  },
  {
    taskType: "sari.merchant.reply-coaching",
    aliases: ["sari.merchant.reply_coaching"],
    businessNameAr: "تدريب التاجر على الرد",
    status: "existing",
    priority: "P1",
    owner: "sari-merchant-team",
    sourceFiles: ["server/ai/merchant-mode.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "text",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 20_000,
    fallback: "show_no_coaching",
  },
  {
    taskType: "sari.merchant.assistant",
    aliases: [],
    businessNameAr: "مساعد التاجر",
    status: "existing",
    priority: "P0",
    owner: "sari-merchant-team",
    sourceFiles: ["server/ai/merchant-mode.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "text",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 25_000,
    fallback: "continue_without_assistant",
  },
  {
    taskType: "sari.learning.pattern-analysis",
    aliases: ["sari.learning.pattern_analysis"],
    businessNameAr: "تحليل أنماط التعلم",
    status: "existing",
    priority: "P2",
    owner: "sari-learning-team",
    sourceFiles: ["server/ai/learning-engine.ts"],
    execution: "async",
    inputKind: "analysis",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 60_000,
    fallback: "retain_current_learning_state",
  },
  {
    taskType: "sari.webhook.merchant-reply-improvement",
    aliases: ["sari.webhook.merchant_reply_improvement"],
    businessNameAr: "تحسين رد التاجر من الويب هوك",
    status: "existing",
    priority: "P1",
    owner: "sari-channel-team",
    sourceFiles: ["server/webhooks/greenapi.ts"],
    execution: "sync",
    inputKind: "message",
    outputKind: "text",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: true,
    timeoutMs: 20_000,
    fallback: "retain_original_merchant_reply",
  },
  {
    taskType: "sari.webhook.merchant-reply-feedback",
    aliases: ["sari.webhook.merchant_reply_feedback"],
    businessNameAr: "تحليل ملاحظات رد التاجر",
    status: "existing",
    priority: "P2",
    owner: "sari-channel-team",
    sourceFiles: ["server/webhooks/greenapi.ts"],
    execution: "async",
    inputKind: "message",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 60_000,
    fallback: "continue_without_feedback_analysis",
  },
  {
    taskType: "sari.conversations.analyze",
    aliases: [],
    businessNameAr: "تحليل المحادثة بالكامل",
    status: "planned",
    priority: "P0",
    owner: "sari-insights-team",
    sourceFiles: ["planned: ZahyPi specialized endpoint /v1/sari/conversations/analyze"],
    execution: "async",
    inputKind: "conversation",
    outputKind: "analysis",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 60_000,
    fallback: "continue_live_chat_without_analysis",
  },
  {
    taskType: "sari.outcome",
    aliases: [],
    businessNameAr: "تسجيل نتيجة الإجراء",
    status: "planned",
    priority: "P0",
    owner: "sari-sales-team",
    sourceFiles: ["planned: ZahyPi specialized endpoint /v1/sari/outcome"],
    execution: "sync",
    inputKind: "outcome",
    outputKind: "receipt",
    dataClassification: "red",
    externalProcessing: "deny",
    humanReviewRequired: false,
    timeoutMs: 15_000,
    fallback: "queue_outcome_for_retry",
  },
] as const;

export const SARI_TASK_CATALOG: readonly SariTaskContract[] = Object.freeze(
  TASK_DEFINITIONS.map(defineTask),
);

const TASK_LOOKUP = new Map<string, SariTaskContract>();

for (const contract of SARI_TASK_CATALOG) {
  TASK_LOOKUP.set(contract.taskType, contract);
  for (const alias of contract.aliases) TASK_LOOKUP.set(alias, contract);
}

export function resolveSariTaskType(taskType: string): SariTaskContract {
  const contract = TASK_LOOKUP.get(taskType);
  if (!contract) throw new Error(`Unknown Sari task type: ${taskType}`);
  return contract;
}

export function activeSariTaskTypes(): readonly `sari.${string}`[] {
  return SARI_TASK_CATALOG
    .filter((contract) => contract.status === "existing")
    .map((contract) => contract.taskType);
}
