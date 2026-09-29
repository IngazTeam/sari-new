// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
import {
  PhoneInput,
  parsePhoneValue,
} from "../client/src/components/ui/phone-input";
let root: Root, container: HTMLDivElement;
const changed = vi.fn();
function Harness({ value = "" }: { value?: string }) {
  const [phone, setPhone] = useState(value);
  return React.createElement(PhoneInput, {
    value: phone,
    onChange: (v: string) => {
      changed(v);
      setPhone(v);
    },
    required: true,
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  changed.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = (value = "") =>
  act(async () => root.render(React.createElement(Harness, { value })));
const input = () => container.querySelector("input")!;
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it.each(["+447700900123", "447700900123", "00447700900123"])(
  "shows the complete international value %s without a Saudi prefix",
  async value => {
    await render(value);
    expect(container.querySelector("select")!.value).toBe("INTL");
    expect(input().value).toBe("447700900123");
    expect(input().checkValidity()).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  }
);
it("keeps international mode while typing and editing instead of switching to Saudi mid-entry", async () => {
  await render("+447700900123");
  await type("");
  await type("4");
  expect(container.querySelector("select")!.value).toBe("INTL");
  expect(changed).toHaveBeenLastCalledWith("+4");
  await type("447700900124");
  expect(changed).toHaveBeenLastCalledWith("+447700900124");
  expect(input().value).toBe("447700900124");
});
it("accepts Arabic and Persian digits without discarding the country code", async () => {
  await render("+٤٤٧٧٠٠٩٠٠١٢٣");
  expect(input().value).toBe("447700900123");
  await type("۴۴۷۷۰۰۹۰۰۱۲۴");
  expect(changed).toHaveBeenLastCalledWith("+447700900124");
});
it("enforces the international range without requiring exactly fifteen digits", async () => {
  await render("+447700900123");
  expect(input().minLength).toBe(9);
  expect(input().maxLength).toBe(15);
  await type("00000000");
  expect(input().checkValidity()).toBe(false);
  await type("447700900123999999");
  expect(input().value).toHaveLength(15);
});
it.each([
  ["0501234567", "SA", "501234567"],
  ["+966501234567", "SA", "501234567"],
  ["00966501234567", "SA", "501234567"],
  ["+971501234567", "AE", "501234567"],
  ["+201012345678", "EG", "1012345678"],
])(
  "preserves supported national/international parsing for %s",
  (value, country, local) => {
    const parsed = parsePhoneValue(value);
    expect(parsed.country.code).toBe(country);
    expect(parsed.localNumber).toBe(local);
  }
);
it("does not emit a modified number when the component only re-renders", async () => {
  await render("447700900123");
  await render("447700900123");
  expect(changed).not.toHaveBeenCalled();
  expect(input().value).toBe("447700900123");
});
