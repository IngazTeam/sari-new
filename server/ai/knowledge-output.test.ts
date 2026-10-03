import { expect, it } from "vitest";
import {
  parseKnowledgeSections,
  parseSalesIntelligence,
  KnowledgeAnalysisError,
  formatSalesKnowledge,
} from "./knowledge-output";
const section = {
  sectionType: "identity",
  title: "Business",
  content: "Saved source text",
  summary: "Brief description",
  confidence: 0.9,
};
const sales = {
  usps: ["Documented service"],
  sellingTips: ["Ask for the customer need"],
  opportunities: ["Review missing delivery policy"],
};
it("accepts complete structured sections and immediate children", () => {
  const value = [
    {
      ...section,
      children: [{ ...section, sectionType: "contact", children: [] }],
    },
  ];
  expect(parseKnowledgeSections(JSON.stringify(value))).toEqual(value);
});
it("preserves literal code fences inside content and accepts one enclosing JSON fence", () => {
  const value = [
    { ...section, content: "Literal ```json sample ``` remains." },
  ];
  expect(
    parseKnowledgeSections("```json\n" + JSON.stringify(value) + "\n```")
  ).toEqual(value);
});
it("does not invent content for an explicitly empty classification or sales result", () => {
  expect(parseKnowledgeSections("[]")).toEqual([]);
  expect(
    parseSalesIntelligence(
      JSON.stringify({ usps: [], sellingTips: [], opportunities: [] })
    )
  ).toEqual({ usps: [], sellingTips: [], opportunities: [] });
});
it.each([
  null,
  {},
  "bad json",
  "Text before " + JSON.stringify([section]),
  JSON.stringify({ sections: [section] }),
  JSON.stringify([{ ...section, title: "" }]),
  JSON.stringify([{ ...section, title: "x".repeat(501) }]),
  JSON.stringify([{ ...section, summary: undefined }]),
  JSON.stringify([{ ...section, content: 7 }]),
  JSON.stringify([{ ...section, confidence: "0.9" }]),
  JSON.stringify([{ ...section, confidence: 0.2 }]),
  JSON.stringify([{ ...section, confidence: 2 }]),
  JSON.stringify([{ ...section, sectionType: "sales_intel" }]),
  JSON.stringify([{ ...section, useInBot: true }]),
  JSON.stringify([section, { ...section, sectionType: "unknown" }]),
  JSON.stringify([{ ...section, children: [{ ...section, content: null }] }]),
  JSON.stringify([
    { ...section, children: [{ ...section, children: [section] }] },
  ]),
  JSON.stringify(Array.from({ length: 101 }, () => section)),
  " ".repeat(400001),
])(
  "rejects invalid classification without returning a partly valid result (%#)",
  response => {
    expect(() => parseKnowledgeSections(response)).toThrow(
      KnowledgeAnalysisError
    );
    try {
      parseKnowledgeSections(response);
    } catch (e) {
      expect((e as Error).message).toBe(
        "knowledge_analysis:classification_unavailable"
      );
    }
  }
);
it("accepts bounded sales arrays", () =>
  expect(parseSalesIntelligence(JSON.stringify(sales))).toEqual(sales));
it.each([
  null,
  "bad json",
  "null",
  "[]",
  "{}",
  JSON.stringify({ ...sales, usps: "string" }),
  JSON.stringify({ ...sales, usps: [{}] }),
  JSON.stringify({ ...sales, opportunities: [null] }),
  JSON.stringify({ ...sales, sellingTips: ["   "] }),
  JSON.stringify({ ...sales, sellingTips: ["x".repeat(2001)] }),
  JSON.stringify({ ...sales, usps: Array(21).fill("x") }),
  JSON.stringify({ ...sales, confidence: 100 }),
])("rejects invalid sales output (%#)", response =>
  expect(() => parseSalesIntelligence(response)).toThrow(
    "knowledge_analysis:sales_unavailable"
  )
);

it("formats a complete hierarchy as JSON with original source content", () => {
  const data = [
    {
      ...section,
      content: "Long parent ".repeat(70),
      children: [{ ...section, content: "Long child ".repeat(70) }],
    },
  ];
  expect(JSON.parse(formatSalesKnowledge(data))).toEqual(
    data.map(p => ({
      ...p,
      content: p.content.trim(),
      children: p.children.map(c => ({ ...c, content: c.content.trim() })),
    }))
  );
});
it.each([
  [],
  [{ ...section, children: [{ ...section, confidence: "bad" }] }],
  Array.from({ length: 5 }, () => ({
    ...section,
    content: "x".repeat(100000),
  })),
])("refuses empty, invalid or oversized sales input (%#)", value =>
  expect(() => formatSalesKnowledge(value)).toThrow(
    "knowledge_analysis:sales_unavailable"
  )
);
