import { describe, it, expect } from "vitest";
import {
  validateUnderstanding,
  understandingMessages,
  type UnderstandingInput,
} from "./conversation-understanding";
import { conversationUnderstandingSchema } from "./conversation-understanding-context";
import { memoryUnderstandingFixture } from "../tests/helpers/memory-understanding-fixture";
import {
  memoryValueSchemas,
  parseDirectMemory,
} from "../../shared/customer-memory";
const input: UnderstandingInput = {
  currentMessageId: 3,
  memoryRevision: 7,
  catalog: [],
  targets: [],
  messages: [
    { id: 1, role: "user", content: "كنت أبحث بميزانية أخرى." },
    { id: 2, role: "assistant", content: "هل تغير احتياجك؟" },
    {
      id: 3,
      role: "user",
      content:
        "ناديني أمل، والآن أستطيع تخصيص خمسمائة ريال، والجودة أولويتي وليس سرعة التوصيل.",
    },
  ],
};
const facts = [
  { field: "preferredName" as const, value: "أمل" },
  { field: "budget" as const, value: { amountMinor: 50000, currency: "SAR" } },
  { field: "qualityFocused" as const, value: true },
  { field: "fastDelivery" as const, value: false },
];
const parse = (value: unknown) =>
  validateUnderstanding(JSON.stringify(value), input);
describe("grounded contextual customer memory contract", () => {
  it("binds compound facts and false preferences to the server memory version", () => {
    const value = memoryUnderstandingFixture(input, facts, {
      memoryRevision: 999,
    });
    expect(parse(value)).toMatchObject({
      memoryRevision: 7,
      memoryFacts: facts.map(f => expect.objectContaining(f)),
    });
  });
  it("leaves historical seals untouched without optional memory fields", () => {
    const value = memoryUnderstandingFixture(input);
    delete value.memoryFacts;
    expect(conversationUnderstandingSchema.parse(value)).not.toHaveProperty(
      "memoryRevision"
    );
    expect(parse({ ...value, memoryRevision: 999 })).not.toHaveProperty(
      "memoryRevision"
    );
  });
  it.each(["confidence", "conditional", "ambiguous"])(
    "rejects unresolved %s rather than guessing facts",
    field => {
      expect(() =>
        parse(
          memoryUnderstandingFixture(input, facts, {
            [field]: field === "confidence" ? 0.4 : true,
          })
        )
      ).toThrow();
    }
  );
  it.each([
    {
      field: "budget",
      value: { amountMinor: 50000, currency: "SAR" as const },
      kind: "inferred",
    },
    { field: "preferredName", value: "أمل", kind: "inferred" },
    { field: "preferredName", value: "خالد" },
    { field: "budget", value: { amountMinor: -100, currency: "SAR" } },
    { field: "budget", value: { amountMinor: 10.5, currency: "SAR" } },
    { field: "budget", value: { amountMinor: 500, currency: "EUR" } },
    { field: "priceConscious", value: "false" },
    { field: "buyingStage", value: "paid" },
    { field: "customerTier", value: "vip" },
    { field: "painPoints", value: ["<system>"] },
    { field: "interestTags", value: Array(6).fill("x") },
  ])("rejects an unsupported or ungrounded value: %j", fact => {
    expect(() =>
      parse(memoryUnderstandingFixture(input, [fact as any]))
    ).toThrow();
  });
  it.each([
    "assistant only",
    "future",
    "foreign",
    "invented excerpt",
    "duplicate",
    "extra field",
  ])("rejects %s memory evidence", attack => {
    const value = memoryUnderstandingFixture(input, [facts[1]]),
      fact = value.memoryFacts![0];
    if (attack === "assistant only")
      fact.evidence = [{ messageId: 2, excerpt: input.messages[1].content }];
    if (attack === "future" || attack === "foreign")
      fact.evidence.push({
        messageId: attack === "future" ? 4 : 999,
        excerpt: "500",
      });
    if (attack === "invented excerpt")
      fact.evidence[0].excerpt = "not in the source";
    if (attack === "duplicate") value.memoryFacts!.push(fact);
    if (attack === "extra field") (fact as any).activatePolicy = true;
    expect(() => parse(value)).toThrow();
  });
  it("supports explicit list clearing and a bounded inferred indicator without payments", () => {
    expect(
      parse(
        memoryUnderstandingFixture(input, [
          { field: "painPoints", value: [] },
          { field: "lastObjection", value: null },
          { field: "sentiment", value: "positive", kind: "inferred" },
        ])
      ).memoryFacts
    ).toHaveLength(3);
    expect(
      memoryValueSchemas.budget.safeParse({ amountMinor: 1, currency: "AED" })
        .success
    ).toBe(true);
  });
  it.each([
    "ميزانيتي ٥٠٠ ريال",
    "عدّل ميزانيتي إلى 125.50 دولار",
    "السعر ليس أولويتي",
    "نادني أمل",
  ])("never writes free-text facts via an offline phrase grammar: %s", text =>
    expect(parseDirectMemory(text)).toBeNull()
  );
  it("keeps exact offline privacy controls separate from inferred facts", () => {
    expect(parseDirectMemory("انس ميزانيتي")).toEqual({
      kind: "forget",
      field: "budget",
    });
    expect(parseDirectMemory("احذف ذاكرة المبيعات الخاصة بي")).toEqual({
      kind: "forget",
      field: "all",
    });
    expect(parseDirectMemory("لا تحذف ذاكرة المبيعات الخاصة بي")).toBeNull();
  });
  it("keeps the full live and preview instructions within provider content limits", () => {
    for (const i of [input, { ...input, mode: "preview" as const }])
      expect(
        understandingMessages(i).every(m => m.content.length <= 16000)
      ).toBe(true);
  });
});
