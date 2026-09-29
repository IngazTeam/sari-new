import { expect, it } from "vitest";
import { sanitizeIdentity } from "./response-validator";
it("does not expand the merchant name already present in the observed production fallback", () => {
  const name = "مختبر ساري — اختبار فقط",
    reply = `شكراً لسؤالك عن ${name}! 😊 تعذر التحقق من المعلومة الآن؛ حاول مرة ثانية بعد قليل 🙏`;
  expect(sanitizeIdentity(reply, name)).toBe(reply);
});
it.each([
  "مختبر ساري — اختبار فقط",
  "House of Sari",
  "متجر $& $` $'",
  "متجر (ساري)+ [فرع]",
  "ساري",
])("inserts %s literally once and remains idempotent", name => {
  const result = sanitizeIdentity("أنا ساري، كيف أساعدك؟", name);
  expect(result).toBe(`أنا ${name}، كيف أساعدك؟`);
  expect(sanitizeIdentity(result, name)).toBe(result);
});
it("preserves both the merchant and configured virtual agent names", () => {
  const result = sanitizeIdentity(
    "أنا ساري من متجر ساري الحديث",
    "متجر ساري الحديث",
    "ساري المبيعات"
  );
  expect(result).toBe("أنا ساري المبيعات من متجر ساري الحديث");
  expect(sanitizeIdentity(result, "متجر ساري الحديث", "ساري المبيعات")).toBe(
    result
  );
});
it.each([
  "هذا ساري المفعول حتى الغد",
  "مساري مختلف وهذا علم على سارية",
  "My name is Saria",
  "house of SARI has this item",
])("preserves non-alias wording: %s", text =>
  expect(sanitizeIdentity(text, "House of Sari")).toBe(text)
);
it("does not mistake a configured name that is only a substring for the whole assistant alias", () =>
  expect(sanitizeIdentity("I'm Sari", "ari")).toBe("I'm ari"));
it("does not consume a literal placeholder supplied in the reply", () => {
  const text = "__IDENTITY_LITERAL_0__ أنا ساري";
  expect(sanitizeIdentity(text, "متجر ساري")).toBe(
    "__IDENTITY_LITERAL_0__ أنا متجر ساري"
  );
});
it("preserves empty input and keeps no-name fallback behavior", () => {
  expect(sanitizeIdentity("")).toBe("");
  expect(sanitizeIdentity("أنا ساري")).toBe("أنا هنا");
});
